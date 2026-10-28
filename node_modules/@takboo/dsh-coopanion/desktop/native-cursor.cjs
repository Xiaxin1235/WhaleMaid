// SPDX-License-Identifier: AGPL-3.0-or-later
const { spawn } = require('node:child_process');
const { join } = require('node:path');

// Chromium caches in-window X11 cursor events even after click-through is
// enabled. Query X11 independently so entry into an ignored window still works.
exports.createNativeCursor = ({ screen, platform = process.platform, env = process.env, start = spawn, now = () => performance.now() }) => {
  let child, point, at = -Infinity, buffer = '';
  const stop = () => { const old = child; child = undefined; point = undefined; old?.kill(); };
  if (platform === 'linux' && env.DISPLAY && !env.WAYLAND_DISPLAY && env.XDG_SESSION_TYPE?.toLowerCase() !== 'wayland') {
    try {
      child = start('/usr/bin/python3', ['-I', '-u', join(__dirname, 'cursor-x11.py')], { env: { DISPLAY: env.DISPLAY, ...(env.XAUTHORITY ? { XAUTHORITY: env.XAUTHORITY } : {}) }, stdio: ['ignore', 'pipe', 'ignore'] });
      child.on('error', stop); child.on('exit', stop);
      child.stdout.on('data', data => {
        buffer += data.toString();
        if (buffer.length > 2048) return stop();
        let end;
        while ((end = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
          try {
            const p = JSON.parse(line);
            if (!p || Object.keys(p).length !== 2 || !['x', 'y'].every(k => Number.isInteger(p[k]) && Math.abs(p[k]) < 16777216)) return stop();
            point = p; at = now();
          } catch { return stop(); }
        }
      });
    } catch { stop(); }
  }
  return { read: () => point && now() - at <= 500 ? point : screen.getCursorScreenPoint(), inspect: () => ({running:!!child,point,age:Number.isFinite(at)?now()-at:null}), stop };
};
