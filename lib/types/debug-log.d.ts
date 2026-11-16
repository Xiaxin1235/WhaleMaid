import type { RunSignal } from './bridge/session-events.js';
/** Local diagnostics never retain messages, tool arguments, results, or raw events. */
export declare class DebugLog {
    private readonly dataDir;
    private readonly signalsEnabled;
    private readonly maxBytes;
    constructor(dataDir: string, signalsEnabled?: boolean, maxBytes?: number);
    signal(signal: RunSignal): void;
    host(message: string, error?: unknown): void;
    private append;
}
