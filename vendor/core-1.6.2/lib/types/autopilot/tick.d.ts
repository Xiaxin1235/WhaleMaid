import type { ProjectGoal } from '../model/goal.js';
import type { Task } from '../model/task.js';
import type { TaskId } from '../model/ids.js';
import type { Limits } from '../model/limits.js';
export interface TickSnapshot {
    goal: ProjectGoal;
    hasScope: boolean;
    globalPaused: boolean;
    tasks: Task[];
    runningTaskIds: TaskId[];
    runsToday: number;
    occupied: number;
    maxConcurrentRuns: number;
    pendingDecisions: number;
    plannerCallsToday: number;
    limits: Limits;
    projectTasks: Task[];
    plannerComplete: boolean;
    latestVerificationPassed: boolean;
    verifierBusy: boolean;
}
export type TickAction = {
    type: 'idle';
    reason: string;
} | {
    type: 'reconcile' | 'verify';
    taskId: TaskId;
} | {
    type: 'execute' | 'suggest-next' | 'plan' | 'complete';
};
/** Decide one bounded action from immutable facts; no IO, clock access or model text is involved. */
export declare function planTick(s: TickSnapshot): TickAction;
