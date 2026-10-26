import type { CommandResult } from '#whalemaid/core';
import { WorktreeManager } from '../execution/worktree.js';
/** Whether independent acceptance or a decision currently owns the host execution slot. */
export declare function verificationBusy(): boolean;
/** Execute one verification batch globally; scheduling a batch never starts another model turn. */
export declare function verificationBatch<T>(work: () => Promise<T>): Promise<T>;
/** Keep only the explicit build/test environment and exclude credential-like names. */
export declare function verificationEnv(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
/** Independent command runner; only exact immutable scope commands reach this adapter. */
export declare class VerificationRunner {
    readonly dataDir: string;
    private readonly cache;
    readonly worktrees: WorktreeManager;
    constructor(dataDir: string);
    /** Run sequentially in a detached baseline, cache successful observations, always remove the worktree. */
    baseline(project: string, commit: string, commands: string[], runId: string, minutes: number, authorize: () => void, signal?: AbortSignal): Promise<CommandResult[]>;
    /** Execute the confirmed string through the native shell with bounded output and process-group/tree cancellation. */
    command(cwd: string, command: string, runId: string, index: string, minutes: number, signal?: AbortSignal): Promise<CommandResult>;
    /** Read only a persisted evidence path and verify its digest before returning the panel tail. */
    logTail(result: CommandResult): Promise<string>;
}
