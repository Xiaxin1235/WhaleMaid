import type { GoalId, TaskId, RunId, TickSnapshot, ProjectGoal, Locale, Clock, IdGen } from '#whalemaid/core';
import type { WhaleStore } from '../store/index.js';
import type { ScopeService } from '../scope-service.js';
import type { DraftModel } from '../goal-intake/model.js';
export interface SchedulerPorts {
    execute(goalId: GoalId, admit: (ownRun?: RunId) => boolean): Promise<{
        started: boolean;
        reason: string;
        runId?: RunId;
    }>;
    verify(taskId: TaskId): Promise<unknown>;
    reconcile(taskId: TaskId): Promise<{
        state: string;
    }>;
    requestDecision?(taskId: TaskId): void;
    planner: DraftModel;
    stop?(): void;
}
export interface SchedulerOptions {
    maxConcurrentRuns?: number;
    clock?: Clock;
    idGen?: IdGen;
    locale: () => Locale;
    debounceMs?: number;
    scanMs?: number;
    plannerTimeoutMs?: number;
    day?: (at: number) => string;
    log: (message: string, error?: unknown) => void;
}
/** Coordinate bounded, opt-in actions; project operations live exclusively in executor/verifier ports. */
export declare class AutopilotScheduler {
    readonly store: WhaleStore;
    private readonly scopes;
    private readonly ports;
    private readonly options;
    private readonly clock;
    private readonly ids;
    private readonly day;
    private readonly timers;
    private readonly active;
    private readonly dirty;
    private readonly controllers;
    private modelSlots;
    private verificationSlot;
    private interval;
    private stopWatch;
    private stopped;
    constructor(store: WhaleStore, scopes: Pick<ScopeService, 'activeScopeFor'>, ports: SchedulerPorts, options: SchedulerOptions);
    /** Start only after recovery and host subscriptions are ready; startup queues one current-state check. */
    start(): void;
    /** Coalesce triggers without storing or replaying missed timers. */
    mark(goalId: GoalId): void;
    /** Wake enabled goals after state changes, including another goal releasing project/global capacity. */
    markAll(): void;
    /** Recheck controls at the final execution boundary, even after asynchronous worktree preparation. */
    canExecute(goalId: GoalId, ownRun?: RunId): boolean;
    /** Count in-flight model admissions as well as durable runs while asynchronous preflight is pending. */
    hasCapacity(ownRun?: RunId, ownReservation?: boolean): boolean;
    /** Explicit owner confirmation binds enabling to the scope that was shown in the panel. */
    setAutopilot(input: {
        goalId: GoalId;
        enabled: boolean;
        confirm?: boolean | undefined;
        scopeHash?: string | undefined;
    }): ProjectGoal;
    /** Build one detached snapshot; daily counters use local calendar dates. */
    snapshot(goalId: GoalId): TickSnapshot;
    private frontier;
    private event;
    private refreshDecisions;
    private check;
    private snapshotWithoutOwnSlot;
    private plan;
    private disable;
    /** Stop timers, abort tool-free planning/verification, and wait at most five seconds for actions. */
    dispose(): Promise<void>;
}
