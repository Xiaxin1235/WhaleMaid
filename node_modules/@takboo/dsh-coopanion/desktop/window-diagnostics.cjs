// SPDX-License-Identifier: AGPL-3.0-or-later
const events = new Set(['minimize', 'restore', 'hide', 'show', 'blur', 'focus', 'always-on-top-changed', 'display-added', 'display-removed', 'display-metrics-changed', 'lock-screen', 'unlock-screen', 'suspend', 'resume', 'recovery']);
const rectangle = value => value && ['x', 'y', 'width', 'height'].every(k => typeof value[k] === 'number' && Number.isFinite(value[k]) && Math.abs(value[k]) <= 10000000) && value.width >= 0 && value.height >= 0
  ? Object.fromEntries(['x', 'y', 'width', 'height'].map(k => [k, value[k]])) : undefined;
exports.petGeometry = value => {
  const pet = rectangle(value?.pet), viewport = rectangle(value?.viewport);
  return pet && viewport && Number.isSafeInteger(value.at) && value.at > 0 ? { at: value.at, pet, viewport } : undefined;
};
exports.windowState = value => {
  const bounds = rectangle(value?.bounds), workArea = rectangle(value?.workArea);
  if (!bounds || !workArea || !['visible', 'minimized', 'alwaysOnTop', 'desiredVisible'].every(k => typeof value[k] === 'boolean') || !Number.isFinite(value.scaleFactor) || value.scaleFactor <= 0 || value.scaleFactor > 16) throw new Error('Invalid window diagnostics');
  const pet = value.pet === null ? null : exports.petGeometry(value.pet);
  if (pet === undefined) throw new Error('Invalid pet geometry');
  return { visible: value.visible, minimized: value.minimized, alwaysOnTop: value.alwaysOnTop, desiredVisible: value.desiredVisible, bounds, workArea, scaleFactor: value.scaleFactor, pet };
};
exports.windowTrace = value => {
  if (!Array.isArray(value) || value.length > 24) throw new Error('Invalid window trace');
  return value.map(entry => {
    if (!events.has(entry.event) || !Number.isSafeInteger(entry.at) || entry.at <= 0) throw new Error('Invalid window event');
    return { at: entry.at, event: entry.event, ...exports.windowState(entry) };
  });
};
exports.createWindowTrace = ({ enabled, snapshot, now = Date.now }) => {
  const entries = [];
  return { clear() { entries.length = 0; },
    record(event) { if (!enabled() || !events.has(event)) return; const value = snapshot(); if (!value) return; entries.push({ at: now(), event, ...exports.windowState(value) }); if (entries.length > 24) entries.shift(); },
    read() { return enabled() ? { current: snapshot(), events: structuredClone(entries) } : undefined; },
  };
};
