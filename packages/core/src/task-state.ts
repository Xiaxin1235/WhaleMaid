import type { Clock, IdGen, Result } from './infra.js'
import type { TaskState } from './model/common.js'
import { TransitionIdSchema } from './model/ids.js'
import type { RunId } from './model/ids.js'
import type { Task } from './model/task.js'
import type { StateTransition } from './model/transition.js'

export const TASK_TRANSITIONS: Readonly<Record<TaskState, readonly TaskState[]>> = Object.freeze({
  PENDING: Object.freeze([
    'READY', // Dependencies and preconditions have been satisfied.
    'BLOCKED', // A prerequisite cannot currently be met.
    'PAUSED', // Stop scheduling an unstarted task.
    'CANCELLED', // Discard work that has not started.
  ] as const),
  READY: Object.freeze([
    'RUNNING', // The host has acquired execution capacity and passed preflight.
    'WAITING_APPROVAL', // Launch requires a user decision.
    'BLOCKED', // Preflight found an unmet prerequisite.
    'PAUSED', // Suspend before launching execution.
    'CANCELLED', // Cancel before launching execution.
  ] as const),
  RUNNING: Object.freeze([
    'VERIFYING', // Execution ended and independent acceptance can begin.
    'FAILED', // Execution has a confirmed failure.
    'UNKNOWN', // The external execution outcome cannot be established.
    'PAUSED', // The host has suspended the active execution.
    'WAITING_APPROVAL', // Active execution needs a user decision.
  ] as const),
  VERIFYING: Object.freeze([
    'WAITING_APPROVAL', // Independent acceptance needs an owner decision.
    'SUCCEEDED', // Independent acceptance established success.
    'FAILED', // Independent acceptance established failure.
    'UNKNOWN', // Acceptance cannot establish the external result.
    'BLOCKED', // Acceptance lacks a required resource or prerequisite.
    'PAUSED', // Suspend acceptance without inventing a verdict.
  ] as const),
  WAITING_APPROVAL: Object.freeze([
    'SUCCEEDED', // Explicit manual owner acceptance, with source=user.
    'READY', // Approval permits a new preflight, never direct execution.
    'VERIFYING', // A decision permits verification of existing execution.
    'BLOCKED', // A decision leaves a prerequisite unsatisfied.
    'PAUSED', // Defer the pending decision.
    'CANCELLED', // The host confirmed cancellation and necessary cleanup.
  ] as const),
  BLOCKED: Object.freeze([
    'READY', // The host resolved the blocker and reconciled external state.
    'PAUSED', // Defer work while the blocker remains.
    'CANCELLED', // Abandon blocked work after necessary cleanup.
  ] as const),
  FAILED: Object.freeze([
    'WAITING_APPROVAL', // Exhausted repair budget needs a decision.
    'SUCCEEDED', // Explicit manual owner acceptance.
    'READY', // A confirmed failure may retry after host budget checks.
    'PAUSED', // Defer any repair decision.
    'CANCELLED', // Abandon the confirmed failed task.
  ] as const),
  UNKNOWN: Object.freeze([
    'VERIFYING', // The host reconciled external state; verify existing work without a resend.
    'FAILED', // Reconciliation established a definite failure.
    'BLOCKED', // Reconciliation identified a concrete blocker.
  ] as const),
  PAUSED: Object.freeze([
    'READY', // The host confirmed no outstanding execution and will repeat preflight.
    'VERIFYING', // Resume acceptance of an existing, reconciled execution.
    'UNKNOWN', // Outstanding execution must be reconciled before anything restarts.
    'CANCELLED', // Cancel suspended work after the host confirmed cleanup.
  ] as const),
  SUCCEEDED: Object.freeze([]),
  CANCELLED: Object.freeze([]),
})

export interface TransitionMeta {
  expectedVersion: number
  source: string
  reason: string
  runId?: RunId
}

export type TransitionError =
  | { code: 'stale-version'; expectedVersion: number; actualVersion: number }
  | { code: 'invalid-transition'; from: TaskState; to: TaskState }
  | { code: 'invalid-metadata' }

/** Apply one legal, version-checked transition without mutating the task or consuming IDs on rejection. */
export function transition(
  task: Task,
  to: TaskState,
  meta: TransitionMeta,
  deps: { clock: Clock; idGen: IdGen },
): Result<{ task: Task; record: StateTransition }, TransitionError> {
  if (task.version !== meta.expectedVersion) {
    return {
      ok: false,
      error: { code: 'stale-version', expectedVersion: meta.expectedVersion, actualVersion: task.version },
    }
  }
  if (!TASK_TRANSITIONS[task.state].includes(to)) {
    return { ok: false, error: { code: 'invalid-transition', from: task.state, to } }
  }
  if (!meta.source.trim() || !meta.reason.trim()) return { ok: false, error: { code: 'invalid-metadata' } }
  // Invalid injected values or version overflow are programming errors, not domain rejections.
  const at = deps.clock.now()
  if (!Number.isSafeInteger(at) || at < 0 || !Number.isSafeInteger(task.version + 1)) {
    throw new Error('Clock timestamp and next task version must be nonnegative safe integers')
  }
  const record: StateTransition = {
    id: TransitionIdSchema.parse(deps.idGen.next('transition')),
    entity: 'task',
    entityId: task.id,
    from: task.state,
    to,
    at,
    source: meta.source,
    reason: meta.reason,
    ...(meta.runId === undefined ? {} : { runId: meta.runId }),
  }
  return { ok: true, value: { task: { ...task, state: to, version: task.version + 1 }, record } }
}
