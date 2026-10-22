import { z } from 'zod'
import type { Limits } from '../model/limits.js'
import type { Judgment } from './judge.js'

export const DecisionSchema = z.strictObject({
  type: z.enum(['succeed', 'retry', 'rollback-and-retry', 'ask-user', 'reconcile', 'pause-goal']),
  reason: z.string(),
  goalProgress: z.int().nonnegative(),
  attempts: z.int().nonnegative(),
  failureSummary: z.string(),
})
export type Decision = z.infer<typeof DecisionSchema>
/** Improved clears stalls; PASS unchanged adds one; failure retains the prior count. */
export function decideNext(input: {
  judgment: Judgment
  attempts: number
  limits: Limits
  stalled: number
  tampered: boolean
}): Decision {
  const { judgment: j } = input
  const goalProgress =
    j.progress === 'improved'
      ? 0
      : j.verdict === 'PASS' && j.progress === 'unchanged'
        ? input.stalled + 1
        : input.stalled
  const out = (type: Decision['type'], reason: string, retry = false): Decision => ({
    type,
    reason,
    goalProgress,
    attempts: input.attempts + (retry ? 1 : 0),
    failureSummary: j.reasons.join('; '),
  })
  if (j.verdict === 'UNKNOWN') return out('reconcile', 'unknown-outcome')
  if (input.tampered) return out('ask-user', 'tampering')
  if (goalProgress >= input.limits.maxStallRounds) return out('pause-goal', 'stalled')
  if (j.verdict === 'PASS') return out('succeed', 'verified')
  if (j.verdict === 'NOT_SCORABLE') return out('ask-user', 'not-scorable')
  if (j.verdict === 'INSUFFICIENT_EVIDENCE') return out('ask-user', 'insufficient-evidence')
  if (input.attempts >= input.limits.maxFixRounds) return out('ask-user', 'fix-rounds-exhausted')
  return out(j.progress === 'regressed' ? 'rollback-and-retry' : 'retry', 'repair-required', true)
}
