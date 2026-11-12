import { expect, test } from 'vitest';
import { ACTIONS, stageCommand } from '../web/stage/protocol.js';
import { stagePose } from '../web/stage/poses.js';

const parent = {};
const origin = 'https://harness.test';
const parse = (data, source = parent, from = origin) => stageCommand({ source, origin: from, data }, parent, origin);

test('accepts only the same-origin parent and projects just the command fields', () => {
  const command = { protocol: 'stage/1', type: 'place', x: 128, y: 256, scale: .8, facing: 'left', injected: true };
  expect(parse(command, {})).toBeNull();
  expect(parse(command, parent, 'https://other.test')).toBeNull();
  expect(parse(command)).toEqual({ type: 'place', x: 128, y: 256, scale: .8, facing: 'left', durationMs: 0 });
  expect(parse({ ...command, protocol: 'stage/2' })).toEqual({ error: 'unsupported-version' });
  expect(parse({ protocol: 'anything', type: 'resume' })).toBeNull();
});

test.each([{ x: '3' }, { x: Infinity }, { y: -32769 }, { scale: 3.1 }, { durationMs: -1 }, { durationMs: 5001 }, { facing: 1 }])(
  'rejects invalid place fields %j', patch => {
    expect(parse({ protocol: 'stage/1', type: 'place', x: 0, y: 0, scale: 1, facing: 'left', ...patch }))
      .toEqual({ error: 'invalid-command' });
  },
);

test('advertises exactly the accepted poses and expression vocabulary', () => {
  expect(new Set(ACTIONS).size).toBe(ACTIONS.length);
  expect(ACTIONS).toEqual(expect.arrayContaining(['idle', 'walk', 'sit-work', 'sleep', 'happy', 'shy', 'surprised', 'thinking']));
  for (const name of ACTIONS) expect(parse({ protocol: 'stage/1', type: 'motion', name })).toEqual({ type: 'motion', name });
  expect(parse({ protocol: 'stage/1', type: 'session', name: 'read' })).toEqual({ error: 'invalid-command' });
  expect(parse({ protocol: 'stage/1', type: 'light', name: 'constructor' })).toEqual({ error: 'invalid-command' });
});

test('the walk steps alternate, work uses the seated rig and sleep closes both eyes', () => {
  const first = stagePose('walk', undefined, .1, false);
  const second = stagePose('walk', undefined, .1 + 1 / 3.6, false);
  expect(first.frame.legs.map(([x, , foot]) => Math.sign(foot - x))).toEqual(
    second.frame.legs.map(([x, , foot]) => -Math.sign(foot - x)),
  );
  expect(stagePose('sit-work', 'happy', 1, false).frame).toMatchObject({ sit: 1, work: true, face: 'happy' });
  expect(stagePose('sleep', undefined, 2, false).face.eyes.map(eye => eye.shape)).toEqual(['down', 'down']);
  for (const pose of ['walk', 'sit-work', 'sleep']) {
    const clean = (time) => stagePose(pose, undefined, time, true);
    expect(clean(1)).toEqual(clean(10));
  }
});
