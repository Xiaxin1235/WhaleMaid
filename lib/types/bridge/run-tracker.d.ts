import type { RunSignal, SessionEventSource } from './session-events.js';
import type { Clock } from '#whalemaid/core';
export type { Clock } from '#whalemaid/core';
export interface RunState {
    runId: string;
    sessionId: string;
    status: 'running' | 'ended';
    endReason: RunSignal['endReason'] | null;
    endSource: 'turn-end' | 'session-disposed' | null;
    toolCalls: number;
    startedAt: number;
    endedAt: number | null;
}
/** One watch denotes one execution. Rewatch explicitly to track another turn. */
export declare class RunTracker {
    private readonly clock;
    private readonly onRunEnded;
    private readonly runs;
    constructor(clock: Clock, onRunEnded: (run: Readonly<RunState>) => void);
    watch(sessionId: string, runId: string): void;
    unwatch(sessionId: string): void;
    get(sessionId: string): Readonly<RunState> | undefined;
    subscribe(source: SessionEventSource): () => void;
    accept(signal: RunSignal): void;
}
