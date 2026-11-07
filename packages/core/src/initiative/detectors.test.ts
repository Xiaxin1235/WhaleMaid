import { createHash } from 'node:crypto'
import { expect, test } from 'vitest'
import { makeGoal, makeTask } from '../../tests/fixtures.js'
import { DEFAULT_LIMITS } from '../model/limits.js'
import { RunSchema } from '../model/execution.js'
import { NotificationSchema } from '../model/notification.js'
import { VerificationSchema } from '../verify/model.js'
import type { CommandResult } from '../verify/parse.js'
import { decideNext } from '../verify/decide.js'
import type { Verdict } from '../model/common.js'
import {
  budgetBurn,
  failureSignature,
  idleGoal,
  leftovers,
  noAcceptance,
  pendingBacklog,
  repeatedFailure,
  stallWarning,
} from './detectors.js'
import type { InitiativeFacts } from './detectors.js'
import {
  defaultInitiativeSettings,
  INITIATIVE_DAY,
  INITIATIVE_TTL,
  opportunityNovelty,
  resolveLevel,
} from './model.js'
import type { DetectorId, InitiativeLevel, InitiativeSettings } from './model.js'

const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const NOW = INITIATIVE_TTL * 3
const failure: CommandResult = {
  command: 'node verify.mjs',
  exitCode: 1,
  status: 'failed',
  tail: 'ENOENT: missing reference',
}
const task = makeTask()
const goal = makeGoal()
const facts: InitiativeFacts = { goal }
const verification = (id: string, taskId = task.id, verdict: Verdict = 'FAIL') => {
  const judgment = { verdict, progress: 'unchanged' as const, reasons: [] }
  return VerificationSchema.parse({
    id,
    taskId,
    createdAt: NOW - 1,
    checkpoint: 'head',
    baseline: [],
    current: verdict === 'FAIL' ? [failure] : [],
    judgment,
    decision: decideNext({ judgment, attempts: 0, stalled: 0, tampered: false, limits: DEFAULT_LIMITS }),
  })
}
const reports = ['r1', 'r2', 'r3'].map((id) => verification(id))
const run = (id: string, durationMs = 5) =>
  RunSchema.parse({
    run_id: id,
    taskId: task.id,
    sessionId: id,
    worktreePath: 'C:\\project',
    baseCommit: 'head',
    startedAt: NOW - durationMs,
    endedAt: NOW,
    status: 'ended',
  })
const notice = (deliveredAt?: number) =>
  NotificationSchema.parse({
    id: 'notice_1',
    kind: 'decision',
    priority: 'high',
    dedupeKey: 'decision',
    goalId: goal.id,
    channel: 'dsh-question',
    createdAt: NOW - INITIATIVE_DAY,
    deliveredAt,
  })
const cases: [
  DetectorId,
  (f: InitiativeFacts, now: number) => unknown[],
  InitiativeFacts,
  InitiativeFacts,
][] = [
  [
    'repeatedFailure',
    (f, now) => repeatedFailure(f, now, hash),
    { goal, tasks: [task], verifications: reports },
    { goal, tasks: [task], verifications: reports.slice(0, 2) },
  ],
  [
    'stallWarning',
    stallWarning,
    { goal: makeGoal({ stalled: 2 }), limits: DEFAULT_LIMITS },
    { goal: makeGoal({ stalled: 1 }), limits: DEFAULT_LIMITS },
  ],
  [
    'noAcceptance',
    noAcceptance,
    { goal, tasks: [task, makeTask('report', { kind: 'analyze' })] },
    { goal, tasks: [task, makeTask('report', { kind: 'analyze' }), makeTask('other')] },
  ],
  [
    'budgetBurn',
    budgetBurn,
    {
      goal,
      tasks: [task, makeTask('done', { state: 'SUCCEEDED' })],
      limits: { ...DEFAULT_LIMITS, maxRunsPerDay: 5 },
      todayRuns: ['1', '2', '3', '4'].map((id) => run(id)),
    },
    {
      goal,
      tasks: [task],
      limits: { ...DEFAULT_LIMITS, maxRunsPerDay: 5 },
      todayRuns: ['1', '2', '3'].map((id) => run(id)),
    },
  ],
  [
    'pendingBacklog',
    pendingBacklog,
    { goal, waitingOnDecision: true, decisions: [notice(NOW - INITIATIVE_DAY)] },
    { goal, waitingOnDecision: true, decisions: [notice(NOW - INITIATIVE_DAY + 1)] },
  ],
  [
    'idleGoal',
    idleGoal,
    { goal: makeGoal({ status: 'paused' }), idleSince: NOW - INITIATIVE_TTL, limits: DEFAULT_LIMITS },
    { goal, idleSince: NOW - INITIATIVE_TTL + 1, limits: DEFAULT_LIMITS },
  ],
  [
    'leftovers',
    leftovers,
    { goal: makeGoal({ status: 'completed' }), tasks: [makeTask('cancelled', { state: 'CANCELLED' })] },
    { goal: makeGoal({ status: 'completed' }), tasks: [makeTask('done', { state: 'SUCCEEDED' })] },
  ],
]

for (const [id, detect, hit, miss] of cases) {
  test(id + ' fires on the threshold', () => {
    expect(detect(hit, NOW)).toMatchObject([{ detector: id, subject: { goalId: goal.id } }])
  })
  test(id + ' stays quiet just below the threshold', () => {
    expect(detect(miss, NOW)).toEqual([])
  })
  test(id + ' tolerates missing evidence', () => {
    expect(detect(facts, NOW)).toEqual([])
  })
}

test('same failure hashes alike across paths, temporary directories, timestamps, addresses and line numbers', () => {
  const a = {
    ...failure,
    command: 'node C:\\Users\\one\\tmp-123\\verify.mjs',
    tail: '2026-10-01T01:02:03Z ENOENT at C:\\Users\\one\\tmp-123\\verify.mjs:12:8 0x1234 test 45',
  }
  const b = {
    ...failure,
    command: 'node /home/two/temp-456/verify.mjs',
    tail: '2026-11-06T03:04:05Z ENOENT at /home/two/temp-456/verify.mjs:87:2 0xabc test 6',
  }
  const digest = failureSignature(a, hash)
  expect(digest).toBe(failureSignature(b, hash))
  expect(digest).not.toBe(failureSignature({ ...b, tail: b.tail.replace('ENOENT', 'EACCES') }, hash))
  expect(digest).not.toBe(failureSignature({ ...b, exitCode: 2 }, hash))
  expect(failureSignature({ ...failure, tail: '' }, hash)).toBeUndefined()
})

test('commands repeatedly killed by the time limit count as the same failure', () => {
  const timeout = (path: string): CommandResult => ({
    command: 'node ' + path + 'verify.mjs',
    exitCode: null,
    status: 'timeout',
  })
  const a = timeout('C:\\one\\tmp-1\\'),
    b = timeout('/two/temp-2/')
  expect(failureSignature(a, hash)).toBe(failureSignature(b, hash))
  expect(failureSignature(a, hash)).not.toBe(failureSignature({ ...failure, command: a.command }, hash))
  const unknown = ['r1', 'r2', 'r3'].map((id, i) => ({
    ...verification(id, task.id, 'UNKNOWN'),
    current: [i % 2 ? a : b],
  }))
  expect(repeatedFailure({ goal, tasks: [task], verifications: unknown }, NOW, hash)).toMatchObject([
    { detector: 'repeatedFailure' },
  ])
  expect(repeatedFailure({ goal, tasks: [task], verifications: unknown.slice(0, 2) }, NOW, hash)).toEqual([])
})

test('repeated occurrences in a single run do not count as separate attempts', () => {
  const sameRun = { ...reports[0]!, current: [failure, failure, failure] }
  expect(repeatedFailure({ goal, tasks: [task], verifications: [sameRun] }, NOW, hash)).toEqual([])
})
test('NOT_SCORABLE counts distinct tasks and follows their latest verdict', () => {
  const other = makeTask('other')
  const notScorable = [
    verification('n1', task.id, 'NOT_SCORABLE'),
    verification('n2', other.id, 'NOT_SCORABLE'),
  ]
  const f = { goal, tasks: [task, other], verifications: notScorable }
  expect(noAcceptance(f, NOW)).toHaveLength(1)
  expect(
    noAcceptance({ ...f, verifications: [...notScorable, verification('pass', other.id, 'PASS')] }, NOW),
  ).toEqual([])
})
test('elapsed run time can meet the budget threshold independently of the run count', () => {
  const f = {
    goal,
    tasks: [task],
    limits: { ...DEFAULT_LIMITS, maxRunMinutes: 1 },
    todayRuns: [run('r', 48000)],
  }
  expect(budgetBurn(f, NOW)).toHaveLength(1)
  expect(budgetBurn({ ...f, todayRuns: [run('r', 47999)] }, NOW)).toEqual([])
  expect(budgetBurn({ ...f, tasks: [{ ...task, state: 'SUCCEEDED' }] }, NOW)).toEqual([])
})
test('a resolved, undelivered, superseded or non-blocking notice cannot create backlog', () => {
  const n = notice(NOW - INITIATIVE_DAY)
  const f = { goal, waitingOnDecision: true, decisions: [n] }
  expect(pendingBacklog({ ...f, waitingOnDecision: false }, NOW)).toEqual([])
  expect(pendingBacklog({ ...f, decisions: [notice()] }, NOW)).toEqual([])
  expect(pendingBacklog({ ...f, decisions: [{ ...n, resolvedAt: NOW }] }, NOW)).toEqual([])
  expect(
    pendingBacklog({ ...f, decisions: [{ ...n, taskId: task.id, taskVersion: 10 }], tasks: [task] }, NOW),
  ).toEqual([])
})

const levels: [string, DetectorId, number, (settings: InitiativeSettings) => void, InitiativeLevel][] = [
  ['low score', 'budgetBurn', 0.29, () => {}, 'L0'],
  ['exact score threshold', 'budgetBurn', 0.3, () => {}, 'L1'],
  [
    'detector cap',
    'budgetBurn',
    1,
    (s) => {
      s.detectors.budgetBurn.maxLevel = 'L0'
    },
    'L0',
  ],
  [
    'default cap',
    'noAcceptance',
    1,
    (s) => {
      s.detectors.noAcceptance.maxLevel = 'L3'
      s.channels.asks = true
    },
    'L1',
  ],
  [
    'asks enabled',
    'budgetBurn',
    1,
    (s) => {
      s.channels.asks = true
    },
    'L3',
  ],
  [
    'cards enabled',
    'repeatedFailure',
    1,
    (s) => {
      s.channels.cards = true
    },
    'L2',
  ],
  [
    'no asks falls to brief even with cards on',
    'budgetBurn',
    1,
    (s) => {
      s.channels.cards = true
    },
    'L1',
  ],
  [
    'brief off after channel fallback',
    'repeatedFailure',
    1,
    (s) => {
      s.channels.brief = false
    },
    'L0',
  ],
  [
    'disabled engine',
    'budgetBurn',
    1,
    (s) => {
      s.enabled = false
      s.channels.asks = true
    },
    'L0',
  ],
  [
    'disabled detector',
    'budgetBurn',
    1,
    (s) => {
      s.detectors.budgetBurn.enabled = false
    },
    'L0',
  ],
]
for (const [name, detector, score, configure, expected] of levels) {
  test('resolveLevel: ' + name, () => {
    const settings = defaultInitiativeSettings()
    configure(settings)
    expect(resolveLevel({ detector, score }, settings)).toBe(expected)
  })
}
test('novelty is zero during cooldown and recovers at its boundary', () => {
  expect(opportunityNovelty(NOW, { cooldownUntil: NOW + 1 })).toBe(0)
  expect(opportunityNovelty(NOW, { cooldownUntil: NOW })).toBe(1)
  expect(opportunityNovelty(NOW, { snoozedUntil: NOW + INITIATIVE_TTL / 2 })).toBe(0.5)
})
