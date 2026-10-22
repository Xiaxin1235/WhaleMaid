import type {
  AuthorizationScope,
  GoalId,
  ProjectGoal,
  Run,
  RunId,
  ScopeId,
  StateTransition,
  Task,
  TaskId,
  TaskState,
  TransitionError,
  TransitionMeta,
  Result,
} from '@whaledot/core'

export interface GoalRepo {
  get(id: GoalId): ProjectGoal | undefined
  list(): ProjectGoal[]
  insert(goal: ProjectGoal): void
  update(goal: ProjectGoal, expectedVersion: number): void
}
export interface ScopeRepo {
  get(id: ScopeId): AuthorizationScope | undefined
  list(goalId: GoalId): AuthorizationScope[]
}
export interface TaskRepo {
  get(id: TaskId): Task | undefined
  list(goalId: GoalId): Task[]
  insert(task: Task): void
  transition(
    id: TaskId,
    to: TaskState,
    meta: TransitionMeta,
  ): Result<{ task: Task; record: StateTransition }, TransitionError | { code: 'task-not-found' }>
}
export interface TransitionRepo {
  list(taskId: TaskId): StateTransition[]
}
export interface RunRepo {
  get(id: RunId): Run | undefined
  list(taskId: TaskId): Run[]
  insert(run: Run): void
  update(run: Run): void
}
