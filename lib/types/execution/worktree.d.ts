import type { ProjectGoal } from '#whalemaid/core';
export interface Workspace {
    path: string;
    baseCommit: string;
    git: boolean;
}
/** Git operations are argv-only, with hooks and fsmonitor disabled even in untrusted repositories. */
export declare class WorktreeManager {
    private readonly dataDir;
    readonly emptyHooks: string;
    constructor(dataDir: string);
    /** Invoke Git without repository hooks, fsmonitor or shell interpolation. */
    git(cwd: string, args: string[]): Promise<string>;
    /** Create or reconcile one external worktree; reject uncertain baselines and boundaries. */
    prepare(goal: ProjectGoal, expected?: string): Promise<Workspace>;
    /** Preserve all task changes in a local commit and return diff evidence. */
    checkpoint(workspace: Workspace, message: string): Promise<{
        commit: string;
        files: string[];
        diffStat: string;
        changed: boolean;
    }>;
}
