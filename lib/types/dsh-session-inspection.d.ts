import type { Context } from '@deepseek-ai/cordis';
import type { SessionEvent, SessionHeader, SessionId } from '@deepseek-ai/dsh-session';
interface Inspection {
    readonly meta: SessionHeader;
    readonly events: readonly SessionEvent[];
}
/** 0.2.1 uses SessionController.inspect. 0.2.2 moves point observations to SessionQueryEngine. */
export declare function inspectSession(ctx: Context, id: SessionId, signal?: AbortSignal): Promise<Inspection>;
/** Only documented absence codes permit replacement or an absent-session result. */
export declare function isMissingSession(error: unknown): boolean;
export {};
