export interface Clock {
  now(): number
}

export interface IdGen {
  next(prefix: string): string
}

/** Host supplies SHA-256 as lowercase hexadecimal; core performs no IO. */
export interface ScopeHasher {
  hash(content: string): string
}

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }

/** Create a deterministic clock for tests and replay. */
export function fixedClock(t: number): Clock {
  return { now: () => t }
}

/** Create an isolated, deterministic ID sequence (not a production ID generator). */
export function sequenceIdGen(): IdGen {
  let sequence = 0
  return { next: (prefix) => `${prefix}_${++sequence}` }
}
