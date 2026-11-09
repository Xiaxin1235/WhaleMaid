import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  budgetBurn,
  decideDelivery,
  defaultInitiativeSettings,
  DEFAULT_LIMITS,
  GoalSchema,
  TaskSchema,
  idleGoal,
  INITIATIVE_DAY as DAY,
  INITIATIVE_HOUR as HOUR,
  initiativeBatch,
  initiativeInCooldown,
  initiativeMetrics,
  learnInitiative,
  leftovers,
  noAcceptance,
  pendingBacklog,
  repeatedFailure,
  resolveLevel,
  stallWarning,
} from '../packages/core/lib/index.js'

const now = Date.UTC(2026, 10, 8, 12)
const goal = GoalSchema.parse({
  id: 'goal_eval',
  title: 'Fixture',
  objective: 'Fixture',
  expectedOutcome: 'Fixture',
  projectRoot: '/fixture',
  acceptance: ['Report'],
  stopConditions: ['Stop'],
  mode: 'suggest',
  status: 'active',
  createdAt: 1,
  version: 0,
})
const task = (id, changes = {}) =>
  TaskSchema.parse({
    id,
    goalId: goal.id,
    key: id,
    title: id,
    kind: 'edit',
    dependsOn: [],
    state: 'PENDING',
    acceptance: [],
    attempts: 0,
    createdBy: 'user',
    createdAt: 1,
    version: 0,
    ...changes,
  })
const base = { goal }
const t = task('task_edit')
const report = (id, tail = 'ENOENT missing fixture') => ({
  id,
  taskId: t.id,
  createdAt: now - 1,
  judgment: { verdict: 'FAIL' },
  current: [{ command: 'node verify.mjs', status: 'failed', exitCode: 1, tail }],
})
const run = (id, duration) => ({
  run_id: id,
  taskId: t.id,
  status: 'ended',
  startedAt: now - duration,
  endedAt: now,
})
const decision = (at) => ({ id: 'notice_eval', goalId: goal.id, kind: 'decision', deliveredAt: at })
const failure = (facts, at) =>
  repeatedFailure(facts, at, (value) => createHash('sha256').update(value).digest('hex'))
const stall = (n) => ({ goal: { ...goal, stalled: n }, limits: DEFAULT_LIMITS })
const budget = (runs) => ({
  goal,
  tasks: [t],
  todayRuns: runs,
  limits: { ...DEFAULT_LIMITS, maxRunsPerDay: 5, maxRunMinutes: 1 },
})
const backlog = (at) => ({ goal, waitingOnDecision: true, decisions: [decision(at)] })
const idle = (at) => ({ goal, idleSince: at, limits: DEFAULT_LIMITS })
const remaining = (state, at) => ({
  goal: { ...goal, status: 'completed' },
  tasks: [task('task_rest', { state, createdAt: at })],
})

// Each detector has a clear hit, a clear miss and a boundary that can catch an off-by-one change.
const fixtures = [
  [
    'repeatedFailure',
    failure,
    [{ goal, tasks: [t], verifications: [report('1'), report('2'), report('3'), report('4')] }, true],
    [{ goal, tasks: [t], verifications: [report('1'), report('2'), report('3', 'EACCES blocked')] }, false],
    [{ goal, tasks: [t], verifications: [report('1'), report('2'), report('3')] }, true],
  ],
  ['stallWarning', stallWarning, [stall(2), true], [stall(0), false], [stall(1), false]],
  [
    'noAcceptance',
    noAcceptance,
    [{ goal, tasks: [task('task_a', { kind: 'analyze' })] }, true],
    [{ goal, tasks: [t] }, false],
    [{ goal, tasks: [t, task('task_a', { kind: 'analyze' })] }, true],
  ],
  [
    'budgetBurn',
    budgetBurn,
    [budget([1, 2, 3, 4].map((i) => run(String(i), 100))), true],
    [budget([run('1', 100)]), false],
    [budget([run('1', 48000)]), true],
  ],
  [
    'pendingBacklog',
    pendingBacklog,
    [backlog(now - 2 * DAY), true],
    [base, false],
    [backlog(now - DAY + 1), false],
  ],
  ['idleGoal', idleGoal, [idle(now - 8 * DAY), true], [idle(now - DAY), false], [idle(now - 7 * DAY), true]],
  [
    'leftovers',
    leftovers,
    [remaining('CANCELLED', now - 1), true],
    [remaining('SUCCEEDED', now - 1), false],
    [remaining('CANCELLED', now + 1), false],
  ],
]
let correct = 0
const hits = []
const results = fixtures.map(([detector, runDetector, ...cases]) => {
  const evaluated = cases.map(([facts, expected]) => {
    const found = runDetector(facts, now)
    if (expected && found.length) hits.push(found[0])
    const match = found.length > 0 === expected && found.every((item) => item.detector === detector)
    correct += Number(match)
    return match ? 'pass' : 'fail'
  })
  return { detector, hit: evaluated[0], miss: evaluated[1], boundary: evaluated[2] }
})
console.table(results)
assert.equal(correct, fixtures.length * 3, 'The fixed detector suite requires 100% accuracy')

const settings = defaultInitiativeSettings()
const opportunities = hits.map((row, i) => ({
  ...row,
  id: `finding-${i}`,
  createdAt: now,
  expiresAt: now + 7 * DAY,
  status: 'open',
  actions: [],
  level: resolveLevel(row, settings),
}))
const batch = initiativeBatch(opportunities, now, -Infinity, settings.limits.cardIntervalHours)
assert.ok(batch.length > 1)
assert.ok(batch.every((row, i) => i === 0 || batch[i - 1].score >= row.score))
assert.equal(initiativeBatch(opportunities, now, now - 4 * HOUR + 1, 4).length, 0)
assert.deepEqual(initiativeBatch(opportunities, now, now - 4 * HOUR, 4), batch)
const older = { ...batch[0], id: 'old', deliveredAt: now - 7 * DAY + 1 }
assert.equal(initiativeInCooldown(batch[0], [older], now, 7), true)
assert.equal(initiativeInCooldown(batch[0], [older], now + 1, 7), false)
settings.channels.asks = true
const budgetFinding = opportunities.find((row) => row.detector === 'budgetBurn')
assert.equal(resolveLevel(budgetFinding, settings), 'L3')
assert.deepEqual(
  initiativeBatch([{ ...budgetFinding, level: 'L3' }], now, now, 4).map((row) => row.id),
  [budgetFinding.id],
)

const policy = {
  now,
  localMinutes: 720,
  nextQuietEnd: now + HOUR,
  recent: [],
  history: [],
  preferences: { maxPerHour: 4, muted: false },
}
const card = (i, kind = 'initiative') => ({
  id: `notice-${i}`,
  kind,
  goalId: `goal-${i}`,
  dedupeKey: `key-${i}`,
})
const quiet = {
  ...policy,
  preferences: { ...policy.preferences, quietHours: { start: '11:00', end: '13:00' } },
}
assert.equal(decideDelivery(card(0), quiet).reason, 'quiet-hours')
const notices = [card(0, 'decision'), ...[1, 2, 3, 4, 5].map((i) => card(i))]
for (const notice of notices) {
  if (decideDelivery(notice, policy).action === 'deliver-now')
    policy.recent.push({ ...notice, deliveredAt: now })
}
assert.equal(policy.recent.length, 4)

const history = Array.from({ length: 10 }, (_, i) => ({
  ...batch[0],
  id: `past-${i}`,
  deliveredAt: now - DAY + i,
  status: i < 2 ? 'accepted' : i === 2 ? 'muted' : i === 3 ? 'expired' : 'dismissed',
  ...(i === 0 ? { progressAt: now - 1 } : {}),
  ...(i === 4 ? { falsePositive: true } : {}),
}))
const stats = initiativeMetrics(history, now, 30)
const learned = learnInitiative(history, now, 'L2', 0)
assert.equal(learned?.level, 'L1')
assert.equal(learned?.minimumScore, 0.4)
assert.deepEqual(stats, {
  delivered: 10,
  accepted: 2,
  interruptions: 8,
  progressed: 1,
  inaccurate: 1,
  modelCost: 0,
})
console.table([
  {
    accuracy: `${correct}/${fixtures.length * 3} (100%)`,
    mergedFindings: batch.length,
    interruptionsAdmitted: policy.recent.length,
    quietInterruptions: 0,
    ...stats,
    adoptionRate: '20%',
    unhelpfulRate: '80%',
    progressRate: '50%',
    inaccurateRate: '10%',
    adjustedLevel: learned.level,
  },
])
