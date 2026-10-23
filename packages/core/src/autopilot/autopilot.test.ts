import { expect, test } from 'vitest'
import { makeGoal, makeScope, makeTask } from '../../tests/fixtures.js'
import { planTick } from './tick.js'
import type { TickSnapshot } from './tick.js'
import { buildPlannerPrompt, parsePlannerResponse, mergePlannerTasks } from './planner.js'
import { fixedClock, sequenceIdGen } from '../infra.js'
import { hashScope } from '../scope.js'
import { createHash } from 'node:crypto'
const snapshot = (patch: Partial<TickSnapshot> = {}): TickSnapshot => ({
  goal: makeGoal({ autopilot: { enabled: true } }),
  hasScope: true,
  globalPaused: false,
  tasks: [makeTask('task_1', { state: 'READY' })],
  runningTaskIds: [],
  runsToday: 0,
  occupied: 0,
  maxConcurrentRuns: 1,
  pendingDecisions: 0,
  plannerCallsToday: 0,
  limits: makeScope().limits,
  projectTasks: [],
  plannerComplete: false,
  latestVerificationPassed: false,
  verifierBusy: false,
  ...patch,
})
test.each([
  [{ globalPaused: true }, 'global-paused'],
  [{ goal: makeGoal({ status: 'paused', autopilot: { enabled: true } }) }, 'goal-paused'],
  [{ goal: makeGoal() }, 'autopilot-off'],
  [{ hasScope: false }, 'no-scope'],
  [{ pendingDecisions: 1 }, 'awaiting-decision'],
  [{ runsToday: 20 }, 'budget-exhausted'],
  [{ occupied: 1 }, 'capacity-busy'],
  [{ verifierBusy: true }, 'capacity-busy'],
  [{ runningTaskIds: ['task_1'] }, 'run-in-progress'],
] as const)('idle gate %j -> %s', (patch, reason) => {
  expect(planTick(snapshot(patch as Partial<TickSnapshot>))).toEqual({ type: 'idle', reason })
})
test('controls and pending decisions dominate execution, reconciliation and completion', () => {
  expect(planTick(snapshot({ globalPaused: true, hasScope: false, pendingDecisions: 2 }))).toEqual({
    type: 'idle',
    reason: 'global-paused',
  })
  expect(
    planTick(snapshot({ pendingDecisions: 1, tasks: [makeTask('task_1', { state: 'UNKNOWN' })] })),
  ).toEqual({ type: 'idle', reason: 'awaiting-decision' })
  expect(
    planTick(
      snapshot({
        tasks: [makeTask('task_1', { state: 'VERIFYING' }), makeTask('task_2', { state: 'UNKNOWN' })],
      }),
    ),
  ).toEqual({ type: 'reconcile', taskId: 'task_2' })
  expect(planTick(snapshot({ tasks: [makeTask('task_1', { state: 'VERIFYING' })] }))).toEqual({
    type: 'verify',
    taskId: 'task_1',
  })
})
test('execute/promote, suggest, plan and evidence-gated completion', () => {
  expect(planTick(snapshot()).type).toBe('execute')
  expect(planTick(snapshot({ tasks: [makeTask()] })).type).toBe('execute')
  expect(planTick(snapshot({ goal: makeGoal({ mode: 'suggest', autopilot: { enabled: true } }) })).type).toBe(
    'suggest-next',
  )
  const tasks = [makeTask('task_1', { state: 'SUCCEEDED' })]
  expect(planTick(snapshot({ tasks })).type).toBe('plan')
  expect(planTick(snapshot({ tasks, plannerComplete: true, latestVerificationPassed: false })).type).toBe(
    'plan',
  )
  expect(planTick(snapshot({ tasks, plannerComplete: true, latestVerificationPassed: true })).type).toBe(
    'complete',
  )
  expect(planTick(snapshot({ tasks, plannerCallsToday: 5 }))).toEqual({
    type: 'idle',
    reason: 'budget-exhausted',
  })
  expect(planTick(snapshot({ tasks: [makeTask('task_1', { state: 'WAITING_APPROVAL' })] }))).toEqual({
    type: 'idle',
    reason: 'awaiting-decision',
  })
})
test.each([
  'no fence',
  '```json\n{}\n```',
  '```json\n{"status":"continue","tasks":[]}\n```',
  '```json\n{"status":"continue","tasks":[{"title":"a","kind":"edit","dependsOn":[0]}]}\n```',
  '```json\n{"status":"complete","reason":"done","allowedPaths":["C:/"]}\n```',
])('planner rejects malformed or authority-bearing output %s', (text) => {
  expect(parsePlannerResponse(text).ok).toBe(false)
})
test('planner supports need-user, completion and references to earlier/known tasks', () => {
  expect(
    parsePlannerResponse('```json\n{"status":"need-user","question":"Which scope?"}\n```'),
  ).toMatchObject({ ok: true, value: { status: 'need-user' } })
  expect(parsePlannerResponse('```json\n{"status":"complete","reason":"All checks pass"}\n```').ok).toBe(true)
  const proposal = parsePlannerResponse(
    '```json\n{"status":"continue","tasks":[{"title":"inspect","kind":"analyze","dependsOn":["task_old"]},{"title":"fix","kind":"edit","dependsOn":[0]}]}\n```',
  )
  if (!proposal.ok || proposal.value.status !== 'continue') throw Error('fixture')
  const merged = mergePlannerTasks(
    makeGoal(),
    makeScope(),
    [makeTask('task_old', { state: 'SUCCEEDED' })],
    proposal.value,
    { clock: fixedClock(1), idGen: sequenceIdGen() },
  )
  expect(merged.added).toHaveLength(2)
  expect(merged.added[1]?.dependsOn).toEqual([merged.added[0]?.id])
  expect(
    mergePlannerTasks(
      makeGoal(),
      makeScope({ permissionPreset: 'read-only' }),
      [makeTask('task_old')],
      proposal.value,
      { clock: fixedClock(1), idGen: sequenceIdGen() },
    ).rejected,
  ).toContainEqual({ title: 'fix', reason: 'read-only-scope' })
})
test('planner cannot revive duplicate work, reference foreign tasks, or leak raw file/model content through its contract', () => {
  const proposal = {
    status: 'continue' as const,
    tasks: [
      { title: 'old', kind: 'analyze' as const, dependsOn: [] },
      { title: 'foreign', kind: 'edit' as const, dependsOn: ['task_missing' as never] },
    ],
  }
  const merged = mergePlannerTasks(
    makeGoal(),
    makeScope(),
    [makeTask('task_old', { title: 'old', kind: 'analyze' })],
    proposal,
    { clock: fixedClock(1), idGen: sequenceIdGen() },
  )
  expect(merged.added).toHaveLength(0)
  expect(merged.rejected.map((r) => r.reason)).toEqual(['duplicate', 'dangling-dependency'])
  const scope = makeScope()
  const prompt = buildPlannerPrompt(
    makeGoal(),
    scope,
    [
      {
        id: 'task_1',
        title: 'inspect',
        kind: 'analyze',
        state: 'SUCCEEDED',
        verdict: 'PASS',
        reasons: ['report-only'],
        counts: [],
        failureSummary: '',
      },
    ],
    'en',
  )
  expect(prompt).toContain('No tools')
  expect(prompt).not.toContain('finalReply')
  expect(prompt).not.toContain('fileContents')
})
test('default planner budget preserves old scope hashes; nondefault budgets change authorization', () => {
  const scope = makeScope(),
    hash = { hash: (x: string) => createHash('sha256').update(x).digest('hex') }
  const old = structuredClone(scope)
  delete (old.limits as Partial<typeof scope.limits>).plannerCallsPerDay
  expect(hashScope(old, hash)).toEqual(hashScope(scope, hash))
  expect(hashScope({ ...scope, limits: { ...scope.limits, plannerCallsPerDay: 6 } }, hash)).not.toEqual(
    hashScope(scope, hash),
  )
})
