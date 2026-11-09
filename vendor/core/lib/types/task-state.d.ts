import type { Clock, IdGen, Result } from './infra.js';
import type { TaskState } from './model/common.js';
import type { RunId } from './model/ids.js';
import type { Task } from './model/task.js';
import type { StateTransition } from './model/transition.js';
export declare const TASK_TRANSITIONS: Readonly<Record<TaskState, readonly TaskState[]>>;
export interface TransitionMeta {
    expectedVersion: number;
    source: string;
    reason: string;
    runId?: RunId;
}
export type TransitionError = {
    code: 'stale-version';
    expectedVersion: number;
    actualVersion: number;
} | {
    code: 'invalid-transition';
    from: TaskState;
    to: TaskState;
} | {
    code: 'invalid-metadata';
};
/** Apply one legal, version-checked transition without mutating the task or consuming IDs on rejection. */
export declare function transition(task: Task, to: TaskState, meta: TransitionMeta, deps: {
    clock: Clock;
    idGen: IdGen;
}): Result<{
    task: Task;
    record: StateTransition;
}, TransitionError>;
