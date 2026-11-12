import type { Context } from '@deepseek-ai/cordis';
import type { SessionEvent } from '@deepseek-ai/dsh-session/types';
export interface RunSignal {
    sessionId: string;
    kind: 'turn-start' | 'tool-call' | 'tool-result' | 'turn-end' | 'session-disposed';
    at: number;
    toolName?: string;
    endReason?: 'completed' | 'error' | 'max-tokens' | 'interrupted' | 'blocked' | 'aborted' | 'unknown';
    raw?: unknown;
}
export interface SessionEventSource {
    subscribe(cb: (signal: RunSignal) => void): () => void;
}
/** DSH 0.2.1-rc.2: dsh-session/lib/types/types.d.ts:166-211,256-389. */
export declare function mapSessionEvent(sessionId: string, event: SessionEvent): RunSignal | undefined;
/** DSH-specific subscriptions stay here. No message, arguments or result content is retained. */
export declare function createSessionEventSource(ctx: Context, now: () => number): SessionEventSource;
