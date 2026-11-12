import type { Context } from '@deepseek-ai/cordis';
import type { ApprovalRequest, ApprovalOutcome } from '@deepseek-ai/dsh-user-approval';
import type { WhaleStore } from '../store/index.js';
import type { RunRegistry } from '../execution/registry.js';
/** Redact before truncating, so a token crossing the display limit cannot escape masking. */
export declare function approvalLogText(value: string, limit: number): string;
/** A non-terminal answerer: only safe ordinary shell calls can produce allowed-once. */
export declare class EverydayApprovals {
    private readonly ctx;
    private readonly store;
    private readonly registry;
    private stopped;
    constructor(ctx: Context, store: WhaleStore, registry: Pick<RunRegistry, 'has'>);
    panel(): {
        enabled: boolean;
        records: {
            at: number;
            sessionId: string;
            sessionName: string;
            cwd: string;
            command: string;
            classification: "safe";
        }[];
    };
    settings(input: unknown): {
        enabled: boolean;
        records: {
            at: number;
            sessionId: string;
            sessionName: string;
            cwd: string;
            command: string;
            classification: "safe";
        }[];
    };
    dispose(): void;
    answer(req: ApprovalRequest, next: () => Promise<ApprovalOutcome>): Promise<ApprovalOutcome>;
}
export declare function installEverydayApprovals(ctx: Context, service: EverydayApprovals): void;
