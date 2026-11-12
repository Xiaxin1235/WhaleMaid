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
  return reason => {
    if (recovering) return [];
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
    try {
      if (actions.includes('restore-inactive')) {
        // On Windows showInactive restores the normal show state without the
        // activation performed by restore(). A temporary focusable=false does
        // not suppress that activation reliably in Electron 44.
        if (platform === 'win32') win.showInactive();
        else {
          const focusable = win.isFocusable(); win.setFocusable(false);
          try { win.restore(); win.showInactive(); }
          finally { win.setFocusable(focusable); }
        }
      } else if (actions.includes('show-inactive')) win.showInactive();
      if (actions.includes('raise')) { win.setAlwaysOnTop(true, exports.topLevel(intent.aboveFullscreen)); win.moveTop(); }
      record('recovery');
    } finally { recovering = false; }
    return actions;
  };
};
