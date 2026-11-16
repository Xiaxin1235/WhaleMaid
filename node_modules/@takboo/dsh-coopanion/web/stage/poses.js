import { FACES, STAND } from '../upstream/kit/body.js';

const CYCLE = Math.PI * 2;

/** Samples the original rig in its own units. Travel is a separate stage transform. */
export function stagePose(pose, expression, time, still) {
  const walking = pose === 'walk';
  const working = pose === 'sit-work';
  const sleeping = pose === 'sleep';
  const seated = working || sleeping;
  const step = still ? .12 * CYCLE : time * 1.8 * CYCLE;
  const face = expression ?? (sleeping ? 'sleep' : 'neutral');
  const blinkPhase = (time + 1) % 5.4;
  const blink = still || sleeping || blinkPhase > .18 ? 0 : Math.sin(blinkPhase / .18 * Math.PI);
  return {
    face: FACES[face].f(still ? 0 : time),
    frame: {
      mode: pose, face, t: still ? 0 : time, facing: 1, staticPose: still,
      legs: walking ? STAND.map(([hx, hy, fx, fy], i) => {
        const phase = step + i * Math.PI;
        return [hx, hy, fx + 13 * Math.cos(phase), fy - 8 * Math.max(0, Math.sin(phase))];
      }) : STAND,
      look: [0, working ? 2.8 : 0], blink,
      sit: seated ? 1 : 0,
      low: seated ? 28 : walking ? -3 * Math.abs(Math.sin(step)) : 0,
      swing: walking && !still ? Math.cos(step) * 5 : 0,
      tilt: sleeping ? -7 : 0, work: working,
    },
  };
}
