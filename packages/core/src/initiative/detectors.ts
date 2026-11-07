import type { Limits } from '../model/limits.js'
import type { ProjectGoal } from '../model/goal.js'
import type { Task } from '../model/task.js'
import type { Run } from '../model/execution.js'
import type { Verification } from '../verify/model.js'
import type { CommandResult } from '../verify/parse.js'
import type { Notification } from '../model/notification.js'
import { redactSecrets } from '../companion/redact.js'
import { initiativeFindingCopy } from './copy.js'
import { INITIATIVE_DAY } from './model.js'
import type { DetectorId, OpportunityCandidate, OpportunityEvidence } from './model.js'

export interface InitiativeFacts {
  goal: ProjectGoal
  tasks?: readonly Task[]
  verifications?: readonly Verification[]
  todayRuns?: readonly Run[]
  limits?: Limits
  decisions?: readonly Notification[]
  waitingOnDecision?: boolean
  idleSince?: number
}

const SEVERITY: Record<DetectorId, number> = {
  repeatedFailure: 0.85,
  stallWarning: 0.8,
  noAcceptance: 0.65,
  budgetBurn: 1,
  pendingBacklog: 0.7,
  idleGoal: 0.55,
  leftovers: 0.8,
}
const finished = (g: ProjectGoal) => g.status === 'completed' || g.status === 'succeeded'
const live = (g: ProjectGoal) => g.status === 'active' || g.status === 'paused'
const ref = (kind: OpportunityEvidence['kind'], id: string): OpportunityEvidence => ({ kind, id })

function candidate(
  f: InitiativeFacts,
  detector: DetectorId,
  signature: string,
  evidence: OpportunityEvidence[],
  confidence = 1,
): OpportunityCandidate {
  const relevance = f.goal.status === 'active' ? 1 : f.goal.status === 'paused' ? 0.6 : 0.4
  return {
    detector,
    subject: { goalId: f.goal.id },
    dedupeKey: JSON.stringify([detector, f.goal.id, signature]),
    evidence: evidence.slice(0, 12),
    summary: initiativeFindingCopy('en', detector).summary,
    // New candidates have novelty 1. A cooldown repeat updates its existing record.
    score: SEVERITY[detector] * confidence * relevance,
  }
}

/** Remove locations and volatile values while retaining the actual error words. */
export function normalizeFailureText(text: string): string {
  return redactSecrets(text)
    .replace(/\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?/gi, '<time>')
    .replace(/(["'])(?:[A-Z]:[\\/]|\\\\|\/)[^\r\n]*?\1/gi, '<path>')
    .replace(/(?:\b[A-Z]:[\\/]|\\\\)[^\r\n"'<>|,;]+?(?=:\d|[\s)"'<>|,;]|$)/gi, '<path>')
    .replace(/(^|[\s("'=])\/(?:[^\s"'<>|,;():]+\/)*[^\s"'<>|,;():]+/g, '$1<path>')
    .replace(/\b(?:tmp|temp|whaledot-verify|whalemaid-verify)[-_][\w.-]+/gi, '<temp>')
    .replace(/\b0x[0-9a-f]+\b/gi, '<address>')
    .replace(/:\d+(?::\d+)?\b/g, ':<line>')
    .replace(/\b(line|column)\s+\d+\b/gi, '$1 <line>')
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
}
export function failureSignature(result: CommandResult, hash: (value: string) => string): string | undefined {
  if (
    result.status !== 'failed' ||
    result.exitCode === null ||
    !result.command.trim() ||
    !result.tail?.trim()
  )
    return
  return hash(
    JSON.stringify([
      normalizeFailureText(result.command),
      result.exitCode,
      normalizeFailureText(result.tail),
    ]),
  )
}

export function repeatedFailure(
  f: InitiativeFacts,
  now: number,
  hash: (value: string) => string,
): OpportunityCandidate[] {
  if (!live(f.goal)) return []
  const tasks = new Set(f.tasks?.map((task) => task.id))
  const groups = new Map<string, Map<string, OpportunityEvidence>>()
  for (const v of f.verifications ?? []) {
    if (!tasks.has(v.taskId) || v.createdAt > now || v.judgment.verdict !== 'FAIL') continue
    for (const [index, command] of v.current.entries()) {
      const signature = failureSignature(command, hash)
      if (!signature) continue
      const group = groups.get(signature) ?? new Map<string, OpportunityEvidence>()
      group.set(v.id, { kind: 'verification', id: v.id, commandIndex: index, hash: signature })
      groups.set(signature, group)
    }
  }
  return [...groups].flatMap(([signature, group]) =>
    group.size < 3
      ? []
      : [
          candidate(
            f,
            'repeatedFailure',
            signature,
            [...group.values()].slice(-12).reverse(),
            Math.min(1, 0.85 + (group.size - 3) * 0.05),
          ),
        ],
  )
}

export function stallWarning(f: InitiativeFacts, now: number): OpportunityCandidate[] {
  const stalled = f.goal.stalled
  if (
    f.goal.createdAt > now ||
    f.goal.status !== 'active' ||
    stalled === undefined ||
    !f.limits ||
    stalled < 1 ||
    stalled !== f.limits.maxStallRounds - 1
  )
    return []
  return [candidate(f, 'stallWarning', String(f.limits.maxStallRounds), [ref('goal', f.goal.id)])]
}

export function noAcceptance(f: InitiativeFacts, now: number): OpportunityCandidate[] {
  if (!live(f.goal) || !f.tasks?.length) return []
  const latest = new Map<string, Verification>()
  for (const v of f.verifications ?? []) {
    if (v.createdAt <= now && (latest.get(v.taskId)?.createdAt ?? -1) <= v.createdAt) latest.set(v.taskId, v)
  }
  const notScorable = f.tasks.flatMap((task) => {
    const v = latest.get(task.id)
    return v?.judgment.verdict === 'NOT_SCORABLE' ? [ref('verification', v.id)] : []
  })
  const reports = f.tasks.filter((task) => task.kind === 'analyze' || task.kind === 'research')
  if (notScorable.length < 2 && reports.length * 2 < f.tasks.length) return []
  return [
    candidate(f, 'noAcceptance', 'limited-acceptance', [
      ...notScorable,
      ...reports.map((task) => ref('task', task.id)),
    ]),
  ]
}

export function budgetBurn(f: InitiativeFacts, now: number): OpportunityCandidate[] {
  if (!live(f.goal) || !f.limits || !f.tasks?.length || !f.todayRuns?.length) return []
  if (f.tasks.filter((t) => t.state === 'SUCCEEDED').length * 2 > f.tasks.length) return []
  const tasks = new Set(f.tasks.map((task) => task.id))
  const runs = f.todayRuns.filter((r) => r.startedAt <= now && tasks.has(r.taskId))
  const attemptsUsed = f.limits.maxRunsPerDay > 0 && runs.length >= 0.8 * f.limits.maxRunsPerDay
  const long = runs.filter((run) => {
    const ended = run.endedAt ?? (run.status === 'running' ? now : undefined)
    const minutes = run.runScope?.limits.maxRunMinutes ?? f.limits!.maxRunMinutes
    return ended !== undefined && Math.min(ended, now) - run.startedAt >= 0.8 * minutes * 60000
  })
  if (!attemptsUsed && !long.length) return []
  return [
    candidate(
      f,
      'budgetBurn',
      'run-limits',
      (attemptsUsed ? runs : long)
        .slice(-12)
        .reverse()
        .map((r) => ref('run', r.run_id)),
    ),
  ]
}

export function pendingBacklog(f: InitiativeFacts, now: number): OpportunityCandidate[] {
  if (!f.waitingOnDecision || f.goal.status !== 'active') return []
  return (f.decisions ?? []).flatMap((n) => {
    if (
      n.goalId !== f.goal.id ||
      !['decision', 'blocked'].includes(n.kind) ||
      n.deliveredAt === undefined ||
      now - n.deliveredAt < INITIATIVE_DAY ||
      n.resolvedChoice !== undefined ||
      (n.resolvedAt !== undefined && !(n.resolvedReason === 'expired' && n.taskId))
    )
      return []
    const task = f.tasks?.find((t) => t.id === n.taskId)
    if (
      n.taskId &&
      (!task ||
        task.version !== n.taskVersion ||
        !['WAITING_APPROVAL', 'BLOCKED', 'FAILED', 'PAUSED'].includes(task.state))
    )
      return []
    return [
      candidate(f, 'pendingBacklog', n.id, [
        ref('notification', n.id),
        ...(task ? [ref('task', task.id)] : []),
      ]),
    ]
  })
}

export function idleGoal(f: InitiativeFacts, now: number): OpportunityCandidate[] {
  if (!live(f.goal) || !f.limits || f.idleSince === undefined || now - f.idleSince < 7 * INITIATIVE_DAY)
    return []
  return [candidate(f, 'idleGoal', String(f.idleSince), [ref('goal', f.goal.id)])]
}

export function leftovers(f: InitiativeFacts, now: number): OpportunityCandidate[] {
  if (!finished(f.goal)) return []
  const remaining = f.tasks?.filter((task) => task.state === 'CANCELLED' && task.createdAt <= now) ?? []
  if (!remaining.length) return []
  return [
    candidate(
      f,
      'leftovers',
      JSON.stringify(remaining.map((task) => task.id).sort()),
      remaining.map((task) => ref('task', task.id)),
    ),
  ]
}
