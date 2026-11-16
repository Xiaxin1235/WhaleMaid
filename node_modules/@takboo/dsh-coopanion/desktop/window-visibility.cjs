// SPDX-License-Identifier: AGPL-3.0-or-later
/** No activation operations: user intent and suspension always win. */
exports.visibilityPlan = (state, reason) => {
  if (!state.ready || state.closing || state.destroyed || !state.desiredVisible || state.suspended) return [];
  const recover = state.minimized || !state.visible;
  const top = (!state.alwaysOnTop && !state.belowTaskbar) || recover || reason === 'configure' || reason === 'display-change' || (reason === 'blur' && state.aboveFullscreen);
  return [...(state.minimized ? ['restore-inactive'] : recover ? ['show-inactive'] : []), ...(top ? ['raise'] : [])];
};

exports.topLevel = (aboveFullscreen, platform = process.platform) => aboveFullscreen !== false && platform !== 'linux' ? 'pop-up-menu' : 'floating';

exports.createVisibilityGuard = ({ win, state, record = () => {}, platform = process.platform }) => {
  let recovering = false;
  let passiveMacRestore = false;
  let passiveMacReset;
  // AppKit's deminiaturize may make a panel key even if it was temporarily
  // non-focusable. Reject that unintended activation, including delayed focus.
  const rejectPassiveFocus = () => {
    if (!passiveMacRestore || win.isDestroyed() || !win.isFocused()) return;
    // Do not call showInactive() from the focus event: AppKit may emit
    // another focus event while opening the panel, creating a focus loop.
    win.blur();
    record('recovery');
  };
  if (platform === 'darwin') win.on?.('focus', rejectPassiveFocus);
  return reason => {
    if (recovering || (passiveMacRestore && reason === 'blur')) return [];
    const intent = state();
    const actions = exports.visibilityPlan({ ...intent, belowTaskbar: platform === 'win32' && intent.aboveFullscreen === false, destroyed: win.isDestroyed(),
      minimized: !win.isDestroyed() && win.isMinimized(), visible: !win.isDestroyed() && win.isVisible(),
      alwaysOnTop: !win.isDestroyed() && win.isAlwaysOnTop() }, reason);
    if (!actions.length) return actions;
    recovering = true;
    // AppKit may make a focusable window key while changing its level/order,
    // even though no focus() call is made. Keep passive recovery non-key; an
    // already focused chat window keeps its existing focus and focusability.
    // Deminiaturization finishes asynchronously: keep passive windows non-key
    // until a real pointer entry re-enables interaction in hit().
    const passiveMac = platform === 'darwin' && !win.isFocused() && win.isFocusable();
    if (passiveMac) win.setFocusable(false);
    if (passiveMac && actions.includes('restore-inactive')) {
      passiveMacRestore = true;
      clearTimeout(passiveMacReset);
      // A native macOS minimize/Spaces transition can finish after showInactive().
      passiveMacReset = setTimeout(() => { passiveMacRestore = false; }, 1500);
      passiveMacReset.unref?.();
    }
    try {
      if (actions.includes('restore-inactive')) {
        // On Windows showInactive restores the normal show state without the
        // activation performed by restore(). A temporary focusable=false does
        // not suppress that activation reliably in Electron 44.
        // On macOS, restore() deminiaturizes by activating the NSPanel even
        // when temporarily non-focusable; showInactive() is the non-key path.
        // Windows likewise restores without activation via showInactive().
        if (platform === 'darwin' || platform === 'win32') win.showInactive();
        else {
          const focusable = win.isFocusable(); win.setFocusable(false);
          try { win.restore(); win.showInactive(); }
          finally { win.setFocusable(focusable); }
        }
      } else if (actions.includes('show-inactive')) win.showInactive();
      if (actions.includes('raise')) { win.setAlwaysOnTop(true, exports.topLevel(intent.aboveFullscreen)); win.moveTop(); }
      rejectPassiveFocus();
      record('recovery');
    } finally { recovering = false; }
    return actions;
  };
};
