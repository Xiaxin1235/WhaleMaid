export interface Clock {
    now(): number;
}
export interface IdGen {
    next(prefix: string): string;
}
/** Host supplies SHA-256 as lowercase hexadecimal; core performs no IO. */
export interface ScopeHasher {
    hash(content: string): string;
}
export type Result<T, E> = {
    ok: true;
    value: T;
} | {
    ok: false;
    error: E;
};
/** Create a deterministic clock for tests and replay. */
export declare function fixedClock(t: number): Clock;
/** Create an isolated, deterministic ID sequence (not a production ID generator). */
export declare function sequenceIdGen(): IdGen;
