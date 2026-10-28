const { displayTarget } = require('../web/display-geometry.js');

// The injected screen/window are also used by the deterministic CI layout tests.
module.exports.createDisplayController = ({ screen, win, send, changed = () => {}, cursor = () => screen.getCursorScreenPoint() }) => {
  let currentId = screen.getPrimaryDisplay().id, previous, state, lastKey, revision = 0;
  const publish = () => { if (state) send({ type: 'display-changed', ...state }); };
  function refresh({ point, displayId } = {}) {
    const target = displayTarget(screen.getAllDisplays(), { currentId, previous, point, displayId });
    if (!target) return;
    currentId = target.id; previous = { ...target.workArea };
    const b = win.getBounds();
    if (['x', 'y', 'width', 'height'].some(k => b[k] !== target.workArea[k])) win.setBounds(target.workArea);
    const next = { displayId: target.id, workArea: { ...target.workArea }, contentBounds: win.getContentBounds(), scaleFactor: target.scaleFactor };
    const key = JSON.stringify(next);
    if (key !== lastKey) {
      lastKey = key; state = { ...next, revision: ++revision }; publish(); changed();
    }
  }
  return { refresh, publish, get state() { return state; }, moveToCursor() { const before = revision; refresh({ point: cursor() }); if (before === revision) publish(); },
    cursor() { const p = cursor(), b = state?.contentBounds; return b ? { type: 'cursor', x: p.x - b.x, y: p.y - b.y, revision: state.revision } : undefined; } };
};
