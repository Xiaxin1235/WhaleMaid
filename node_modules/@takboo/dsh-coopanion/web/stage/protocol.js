import { KIT_EXPRESSIONS } from '../upstream/kit/body.js';

export const VERSION = 'stage/1';
export const POSES = ['idle', 'walk', 'sit-work', 'sleep'];
export const ACTIONS = [...POSES, ...KIT_EXPRESSIONS];
export const LIGHTS = {
  day: 'none',
  evening: 'sepia(.22) saturate(1.18) brightness(.94)',
  night: 'brightness(.65) saturate(.78) hue-rotate(12deg)',
  lamp: 'sepia(.29) saturate(1.08) brightness(.91)',
};
const bounded = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

/** Null means another window or origin, which is ignored without replying. */
export function stageCommand(event, parent, origin) {
  if (event.source !== parent || event.origin !== origin) return null;
  const m = event.data;
  if (!m || typeof m !== 'object' || Array.isArray(m) || typeof m.protocol !== 'string' || !m.protocol.startsWith('stage/')) return null;
  if (m.protocol !== VERSION) return { error: 'unsupported-version' };
  switch (m.type) {
    case 'hello': case 'pause': case 'resume':
      return { type: m.type };
    case 'place':
      if (bounded(m.x, -32768, 32768) && bounded(m.y, -32768, 32768) && bounded(m.scale, .1, 3) &&
          (m.facing === 'left' || m.facing === 'right') && (m.durationMs === undefined || bounded(m.durationMs, 0, 5000)))
        return { type: m.type, x: m.x, y: m.y, scale: m.scale, facing: m.facing, durationMs: m.durationMs ?? 0 };
      break;
    case 'motion':
      if (ACTIONS.includes(m.name)) return { type: m.type, name: m.name };
      break;
    case 'light':
      if (typeof m.name === 'string' && Object.hasOwn(LIGHTS, m.name)) return { type: m.type, name: m.name };
      break;
  }
  return { error: 'invalid-command' };
}
