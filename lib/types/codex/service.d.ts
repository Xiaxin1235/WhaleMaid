import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';
import type { WhaleStore } from '../store/index.js';
import type { RunRegistry } from '../execution/registry.js';
import { CodexRunner } from './runner.js';
/** Independent conversation capability, never an Autopilot executor. */
export declare class ConversationCodex {
    private readonly ctx;
    private readonly store;
    private readonly registry;
    readonly runner: CodexRunner;
    private busy;
    private readonly lifetime;
    constructor(ctx: Context, store: WhaleStore, registry: Pick<RunRegistry, 'has'>, runner: CodexRunner);
    settings(input: unknown): Promise<{
        settings: {
            enabled: boolean;
            timeoutMinutes: number;
        };
        records: {
            id: string;
            at: number;
            sessionId: string;
            mode: "read-only" | "workspace-write";
            cwd: string;
            task: string;
            status: string;
            exitCode: number | null;
            elapsedMs: number;
            files: string[];
            logPath: string;
            pid?: number | undefined;
        }[];
    }>;
    panel(): Promise<{
        settings: {
            enabled: boolean;
            timeoutMinutes: number;
        };
        records: {
            id: string;
            at: number;
            sessionId: string;
            mode: "read-only" | "workspace-write";
            cwd: string;
            task: string;
            status: string;
            exitCode: number | null;
            elapsedMs: number;
            files: string[];
            logPath: string;
            pid?: number | undefined;
        }[];
    }>;
    eligible(agent: Agent | undefined): boolean;
    tool(): ToolDefinition;
    call(raw: unknown, exec: Pick<ToolRunContext, 'agent' | 'signal' | 'callId'>): Promise<string>;
    dispose(): Promise<void>;
}
export declare function installConversationCodex(ctx: Context, service: ConversationCodex): void;
