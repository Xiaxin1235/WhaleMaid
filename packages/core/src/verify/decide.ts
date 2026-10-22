import { z } from 'zod'
import type { Limits } from '../model/limits.js'
import type { Judgment } from './judge.js'
const fields = {
  reason: z.string(),
  goalProgress: z.int().nonnegative(),
  attempts: z.int().nonnegative(),
  failureSummary: z.string(),
}
const current = z.strictObject({
  ...fields,
  taskOutcome: z.enum(['succeed', 'retry', 'rollback-and-retry', 'ask-user', 'reconcile']),
  goalAction: z.enum(['continue', 'pause']),
  unknownVerifications: z.int().nonnegative(),
})
// Preserve readability of old reports without rewriting historical task outcomes.
const legacy = z
  .strictObject({
    ...fields,
    type: z.enum(['succeed', 'retry', 'rollback-and-retry', 'ask-user', 'reconcile', 'pause-goal']),
  })
  .transform(({ type, ...data }) => ({
    ...data,
    taskOutcome: type === 'pause-goal' ? ('ask-user' as const) : type,
    goalAction: type === 'pause-goal' ? ('pause' as const) : ('continue' as const),
    unknownVerifications: 0,
  }))
export const DecisionSchema = z.union([current, legacy])
export type Decision = z.infer<typeof current>
/** Separate task acceptance from goal-level stalls; neutral leaves the stall counter untouched. */
export function decideNext(input: {
  judgment: Judgment
  attempts: number
  limits: Limits
  stalled: number
  tampered: boolean
  unknownVerifications?: number
}): Decision {
  const { judgment: j } = input
  const goalProgress =
    j.progress === 'improved'
      ? 0
      : j.verdict === 'PASS' && j.progress === 'unchanged'
        ? input.stalled + 1
        : input.stalled
  const unknownVerifications = j.verdict === 'UNKNOWN' ? (input.unknownVerifications ?? 0) + 1 : 0
  const out = (taskOutcome: Decision['taskOutcome'], reason: string, retry = false): Decision => ({
    taskOutcome,
    reason,
    goalAction: goalProgress >= input.limits.maxStallRounds ? 'pause' : 'continue',
    goalProgress,
    attempts: input.attempts + (retry ? 1 : 0),
    failureSummary: j.reasons.join('; '),
    unknownVerifications,
  })
  if (j.verdict === 'UNKNOWN')
    return out(
      unknownVerifications >= 2 ? 'ask-user' : 'reconcile',
      unknownVerifications >= 2 ? 'verification-unknown' : 'unknown-outcome',
    )
  if (input.tampered) return out('ask-user', 'tampering')
  if (j.verdict === 'PASS') return out('succeed', 'verified')
  if (j.verdict === 'NOT_SCORABLE') return out('ask-user', 'not-scorable')
  if (j.verdict === 'INSUFFICIENT_EVIDENCE') return out('ask-user', 'insufficient-evidence')
  if (input.attempts >= input.limits.maxFixRounds) return out('ask-user', 'fix-rounds-exhausted')
  return out(j.progress === 'regressed' ? 'rollback-and-retry' : 'retry', 'repair-required', true)
}
