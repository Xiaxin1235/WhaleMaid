import { createWhaleFigure } from '../upstream/whale/figure.js';
import model from '../upstream/whale/model.json';
import { advanceRenderCadence } from '../render-cadence.js';
import { ACTIONS, LIGHTS, POSES, VERSION, stageCommand } from './protocol.js';
import { stagePose } from './poses.js';

const root = document.getElementById('stage');
const actor = document.getElementById('actor');
const drawing = document.getElementById('drawing');
const hit = document.getElementById('hit');
const origin = new URL(location.href).origin;
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
let figure, ready = false, failed = false, paused = false, dirty = true, raf = 0;
let hidden = document.hidden;
let pose = 'idle', expression, position, travel, light = 'day';
let last, elapsed = 0, phaseStart = 0, cadence = { at: -Infinity, elapsed: 0 };

function emit(type, detail = {}) {
  if (parent !== window) parent.postMessage({ protocol: VERSION, type, ...detail }, origin);
}
const announce = () => emit('ready', { actions: ACTIONS });
function fail() {
  failed = true;
  cancelAnimationFrame(raf); raf = 0;
  figure?.dispose();
  drawing.replaceChildren();
  hit.style.pointerEvents = 'none';
  emit('error', { code: 'render-failed' });
}

function active() { return !!figure && !failed && !paused && !hidden; }
function schedule() {
  if (!active()) {
    cancelAnimationFrame(raf); raf = 0;
    last = undefined; cadence = { at: -Infinity, elapsed: 0 };
    return;
  }
  if (!raf && (dirty || !reduce.matches)) raf = requestAnimationFrame(render);
}
function current() {
  if (!position) return { x: root.clientWidth / 2, y: root.clientHeight * .86, scale: .65, facing: 'right' };
  if (!travel) return position;
  const p = Math.min(1, (elapsed - travel.start) / travel.seconds);
  if (p >= 1 || reduce.matches) { travel = undefined; return position; }
  const k = p * p * (3 - 2 * p);
  const from = travel.from;
  return {
    x: from.x + (position.x - from.x) * k, y: from.y + (position.y - from.y) * k,
    scale: from.scale + (position.scale - from.scale) * k, facing: position.facing,
  };
}
function render(now) {
  raf = 0;
  if (!active()) return;
  const dt = last === undefined ? 0 : Math.min(.05, (now - last) / 1000);
  last = now;
  elapsed += dt;
  cadence = advanceRenderCadence(cadence, now, dt, true);
  if (cadence.paint) {
    const { x, y, scale, facing } = current();
    drawing.style.filter = LIGHTS[light];
    actor.setAttribute('transform', 'translate(' + x + ' ' + y + ') scale(' + (facing === 'left' ? -scale : scale) + ' ' + scale + ') translate(-128 -256)');
    const { face, frame } = stagePose(pose, expression, elapsed - phaseStart, reduce.matches);
    // The rig's spring clock must stay monotonic across pose transitions.
    frame.t = reduce.matches ? 0 : elapsed;
    try { figure.draw(drawing, face, frame); }
    catch { fail(); return; }
    dirty = false;
    if (!ready) { ready = true; announce(); }
  }
  if (reduce.matches && !dirty) last = undefined;
  schedule();
}
function refresh() { dirty = true; schedule(); }

addEventListener('message', event => {
  if (parent === window) return;
  const m = stageCommand(event, parent, origin);
  if (!m) return;
  if (m.error) { emit('error', { code: m.error }); return; }
  if (m.type === 'hello') {
    if (failed) emit('error', { code: 'render-failed' });
    else if (ready) announce();
    return;
  }
  if (m.type === 'pause' || m.type === 'resume') { paused = m.type === 'pause'; schedule(); return; }
  if (m.type === 'place') {
    const from = current();
    position = m;
    travel = m.durationMs && !reduce.matches ? { from, start: elapsed, seconds: m.durationMs / 1000 } : undefined;
  } else if (m.type === 'motion') {
    if (POSES.includes(m.name)) {
      if (pose !== m.name) phaseStart = elapsed;
      pose = m.name;
      expression = undefined;
    } else expression = m.name;
  } else if (m.type === 'light') light = m.name;
  refresh();
});

reduce.addEventListener('change', () => { if (reduce.matches) travel = undefined; refresh(); });
document.addEventListener('visibilitychange', () => { hidden = document.hidden; refresh(); });
addEventListener('resize', refresh);
addEventListener('pagehide', () => { hidden = true; schedule(); });
addEventListener('pageshow', () => { hidden = document.hidden; refresh(); });
hit.addEventListener('click', event => { if (active() && event.isTrusted) emit('click'); });
hit.addEventListener('pointerenter', event => { if (active() && event.isTrusted) emit('hover'); });
void createWhaleFigure(new URL(location.href), { model, asset: path => STAGE_TEXTURES[path] })
  .then(value => { figure = value; refresh(); }, fail);
