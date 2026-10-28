import type { Result } from './infra.js';
import type { Limits } from './model/authorization.js';
import type { TaskKind } from './model/common.js';
import type { ProjectGoal } from './model/goal.js';
import type { GoalId, TaskId } from './model/ids.js';
import type { Task } from './model/task.js';
export type DagError = {
    code: 'duplicate-task-id';
    taskId: TaskId;
} | {
    code: 'dangling-dependency' | 'cross-goal-dependency';
    taskId: TaskId;
    dependencyId: TaskId;
} | {
    code: 'cycle';
    taskIds: TaskId[];
};
/** Validate dependency identity, goal ownership and acyclicity without modifying the task list. */
export declare function validateDag(tasks: readonly Task[]): Result<void, DagError>;
/** Return PENDING tasks eligible for promotion; an invalid graph yields no eligible tasks. */
export declare function readyTasks(tasks: readonly Task[]): Task[];
export type TaskSelection = {
    task: Task;
    reason: 'selected';
} | {
    task: null;
    reason: 'no-ready-task' | 'write-slot-busy' | 'goal-not-active' | 'invalid-graph';
};
/** Select an oldest READY task; runningTasks must include all in-flight tasks in this project across goals. */
export declare function selectNextTask(goal: ProjectGoal, tasks: readonly Task[], runningTasks: readonly Task[], limits: Limits): TaskSelection;
/** Build a collision-free stable key from goal, Unicode/whitespace-normalized title and kind. */
export declare function taskKey(goalId: GoalId, normalizedTitle: string, kind: TaskKind): string;
export interface TaskProposalMerge {
    tasks: Task[];
    rejected: {
        task: Task;
        reason: 'foreign-goal' | 'duplicate' | 'dangling-dependency' | 'cycle';
    }[];
}
/** Merge proposals in order, preserving a valid existing DAG and reporting each rejected proposal. */
export declare function mergeProposedTasks(goalId: GoalId, existing: readonly Task[], proposed: readonly Task[]): TaskProposalMerge;
