import type { ProjectGoal } from '../model/goal.js'
import type { Task } from '../model/task.js'
import type { TaskId } from '../model/ids.js'
import type { Limits } from '../model/limits.js'
import { readyTasks, selectNextTask } from '../goal-graph.js'
export interface TickSnapshot {
  goal: ProjectGoal
  hasScope: boolean
  globalPaused: boolean
  tasks: Task[]
  runningTaskIds: TaskId[]
  runsToday: number
  occupied: number
  maxConcurrentRuns: number
  pendingDecisions: number
  plannerCallsToday: number
  limits: Limits
  projectTasks: Task[]
  plannerComplete: boolean
  latestVerificationPassed: boolean
  verifierBusy: boolean
}
export type TickAction =
  | { type: 'idle'; reason: string }
  | { type: 'reconcile' | 'verify'; taskId: TaskId }
  | { type: 'execute' | 'suggest-next' | 'plan' | 'complete' }
/** Decide one bounded action from immutable facts; no IO, clock access or model text is involved. */
export function planTick(s: TickSnapshot): TickAction {
  const idle = (reason: string): TickAction => ({ type: 'idle', reason })
  if (s.globalPaused) return idle('global-paused')
  if (s.goal.status !== 'active') return idle('goal-paused')
  if (!s.goal.autopilot.enabled) return idle('autopilot-off')
  if (!s.hasScope) return idle('no-scope')
  if (s.pendingDecisions > 0) return idle('awaiting-decision')
  if (s.runsToday >= s.limits.maxRunsPerDay) return idle('budget-exhausted')
  if (s.runningTaskIds.length) return idle('run-in-progress')
  if (s.occupied >= s.maxConcurrentRuns || s.verifierBusy) return idle('capacity-busy')
  const unknown = s.tasks.find((task) => task.state === 'UNKNOWN')
  if (unknown) return { type: 'reconcile', taskId: unknown.id }
  const verifying = s.tasks.find((task) => task.state === 'VERIFYING')
  if (verifying) return { type: 'verify', taskId: verifying.id }
  if (s.tasks.some((task) => ['WAITING_APPROVAL', 'BLOCKED', 'FAILED', 'PAUSED'].includes(task.state)))
    return idle('awaiting-decision')
  const promoted = new Set(readyTasks(s.tasks).map((task) => task.id))
  const candidates = s.tasks.map((task) =>
    promoted.has(task.id) ? { ...task, state: 'READY' as const } : task,
  )
  const selected = selectNextTask(s.goal, candidates, s.projectTasks, s.limits)
  if (selected.task) return { type: s.goal.mode === 'suggest' ? 'suggest-next' : 'execute' }
  if (s.tasks.some((task) => !['SUCCEEDED', 'CANCELLED'].includes(task.state))) return idle('capacity-busy')
  if (s.plannerComplete && s.latestVerificationPassed) return { type: 'complete' }
  if (s.plannerCallsToday >= (s.limits.plannerCallsPerDay ?? 5)) return idle('budget-exhausted')
  return { type: 'plan' }
}
