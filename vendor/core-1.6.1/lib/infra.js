/** Create a deterministic clock for tests and replay. */
export function fixedClock(t) {
    return { now: () => t };
}
/** Create an isolated, deterministic ID sequence (not a production ID generator). */
export function sequenceIdGen() {
    let sequence = 0;
    return { next: (prefix) => `${prefix}_${++sequence}` };
}
//# sourceMappingURL=infra.js.map