import type { Context } from '@deepseek-ai/cordis';
import type { PeerScope } from '@deepseek-ai/dsh-client-connection';
export type ExecutionVia = {
    kind: 'panel';
    peer: PeerScope;
} | {
    kind: 'background';
};
export interface LaunchRequest {
    cwd: string;
    preset: 'read-only' | 'workspace-write';
    title: string;
    prompt: string;
    via: ExecutionVia;
    register(sessionId: string): void;
    check(): void;
}
export interface DshRunner {
    launch(request: LaunchRequest): Promise<string>;
    cancel(sessionId: string): void;
}
/** Trusted host-local service calls require no cached browser identity. Owner admission is checked only for this launch. */
export declare function dshRunner(ctx: Context): DshRunner;
