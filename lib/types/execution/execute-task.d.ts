import type { GoalId, RunId, Locale } from '#whalemaid/core';
import type { WhaleStore } from '../store/index.js';
import type { ScopeService } from '../scope-service.js';
import { RunTracker } from '../bridge/run-tracker.js';
import type { RunSignal } from '../bridge/session-events.js';
import { RunRegistry } from './registry.js';
import { WorktreeManager } from './worktree.js';
import type { DshRunner, ExecutionVia } from './dsh-runner.js';
import type { ObserveSession } from '../verify/reconcile.js';
/** Manually dispatch one task. Durable delivery, tool policy, and finalization share one registry. */
export declare class TaskExecutor {
    readonly store: WhaleStore;
    private readonly scopes;
    private readonly runner;
    private readonly locale;
    private readonly log;
    private readonly observe?;
    readonly registry: RunRegistry;
    readonly tracker: RunTracker;
    readonly worktrees: WorktreeManager;
    private readonly locks;
    private readonly projectLocks;
    private readonly timers;
    private readonly finishing;
    private readonly finalizations;
    private admission;
    /** Install the host-wide model-capacity boundary for manual and background launches alike. */
    setAdmission(admit: (via: ExecutionVia, ownRun?: RunId) => boolean): void;
    private disposed;
    constructor(store: WhaleStore, scopes: ScopeService, runner: DshRunner, dataDir: string, locale: () => Locale, log: (message: string, error?: unknown) => void, observe?: ObserveSession | undefined);
    /** Feed only normalized session lifecycle signals to the owned-run tracker. */
    accept(signal: RunSignal): void;
    /** Dispatch at most one eligible task after authorization and worktree preflight. */
    executeNextTask(input: GoalId, via: ExecutionVia, admit?: (ownRun?: RunId) => boolean): Promise<{
        started: boolean;
        reason: string;
        runId?: RunId;
    }>;
    /** Immediately close the gate and request cancellation for a revoked grant. */
    revoke(scopeId: string): void;
    /** Reuse abort/gate closure, then require runtime termination before owner cancellation is final. */
    stopGoal(goalId: GoalId): Promise<void>;
    private abort;
    private finalize;
    private finish;
    /** Unload stops local scheduling and requests cancellation. Durable running rows remain for restart reconciliation. */
    dispose(): Promise<void>;
}
