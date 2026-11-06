import type { Context } from '@deepseek-ai/cordis';
export interface SessionObservation {
    exists: boolean;
    running: boolean;
    finalReplyNonempty: boolean;
    endReason?: string;
}
export type ObserveSession = (id: string) => Promise<SessionObservation>;
/** Inspect cold durable sessions without activating an Agent, resuming it, or submitting input. */
export declare function observeSession(ctx: Context): ObserveSession;
