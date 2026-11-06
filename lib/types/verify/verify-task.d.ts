import type { Task, Run, TaskId, DecisionChoice, Verification, Locale } from '#whalemaid/core';
import type { WhaleStore } from '../store/index.js';
import type { ScopeService } from '../scope-service.js';
import { VerificationRunner } from './runner.js';
import type { ObserveSession } from './reconcile.js';
/** Shared P09/P10 orchestration; all invocations serialize with verification and decision mutations. */
export declare class TaskVerifier {
    readonly store: WhaleStore;
    private readonly scopes;
    readonly dataDir: string;
    private readonly observe;
    private readonly locale;
    private readonly stop;
    /** Cancel independent child processes during plugin unload. */
    dispose(): void;
    readonly runner: VerificationRunner;
    constructor(store: WhaleStore, scopes: ScopeService, dataDir: string, observe: ObserveSession, locale: () => Locale);
    /** Verify one ended, checkpointed run; this method never dispatches a model prompt. */
    verifyTask(input: TaskId): Promise<Verification>;
    private latest;
    private move;
    private authorize;
    private owned;
    private changes;
    private verify;
    /** Preserve the failed commit first; reset only the exact owned, clean worktree on whaledot/*. */
    rollback(run: Run, task: Task, checkpoint: string): Promise<void>;
    /** Ask for an explicit retry after execution/preflight stops; never infer successful delivery. */
    requestDecision(taskId: TaskId): void;
    private notify;
    /** Reconcile existing execution only; no prompt or resume API is reachable from this path. */
    reconcileTask(input: TaskId): Promise<{
        state: string;
    }>;
    /** Resolve a persisted owner choice once; view-diff is read-only and leaves the decision pending. */
    resolveDecision(notificationId: string, choice: DecisionChoice): Promise<{
        state: string;
        files?: string[];
        stat?: string;
    }>;
    /** Evidence is addressed by run/phase/index, never by a caller-supplied path. */
    logTail(runId: string, phase: 'baseline' | 'current', index: number): Promise<{
        tail: string;
    }>;
}
