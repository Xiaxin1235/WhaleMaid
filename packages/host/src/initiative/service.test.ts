import { mkdtempSync, rmSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
import {
  defaultInitiativeSettings,
  DETECTORS,
  INITIATIVE_DAY,
  INITIATIVE_TTL,
  RunSchema,
  VerificationSchema,
  decideNext,
  DEFAULT_LIMITS,
} from '@whalemaid/core'
import type { DetectorId, OpportunityCandidate } from '@whalemaid/core'
import { makeGoal, makeScope, makeTask } from '../../../core/tests/fixtures.js'
import { CompanionDailyBrief } from '../companion/daily-brief.js'
import { exportTrace } from '../autopilot/trace.js'
import { MIGRATIONS } from '../store/migrations.js'
import { WhaleStore } from '../store/index.js'
import { InitiativeService } from './service.js'

const cleanups: (() => unknown)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
  vi.useRealTimers()
})
const START = new Date(2026, 10, 6, 12).getTime()
function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'whalemaid-initiative-'))
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
  let now = START
  const goal = makeGoal({ createdAt: START, autopilot: { enabled: true }, title: 'I1 fixture' })
  const task = makeTask()
  const scope = makeScope({ grantedAt: START })
  const log = vi.fn()
  const store = new WhaleStore(dir, { log, clock: { now: () => now } })
  cleanups.push(() => store.close())
  store.goals.insert(goal)
  store.tasks.insert(task)
  const settings = defaultInitiativeSettings()
  const scopes = { activeScopeFor: () => scope }
  const initiative = new InitiativeService(store, scopes, {
    now: () => now,
    settings: () => settings,
    locale: () => 'zh-CN',
    log,
  })
  cleanups.push(() => initiative.dispose())
  const addFailure = (id: string, tail = 'ENOENT file not found') => {
    const run = RunSchema.parse({
      run_id: id,
      taskId: task.id,
      sessionId: id,
      startedAt: now,
      endedAt: now,
      baseCommit: 'head',
      worktreePath: dir,
      status: 'ended',
      outcome: 'FAIL',
    })
    const judgment = { verdict: 'FAIL' as const, progress: 'unchanged' as const, reasons: [] }
    store.runs.insert(run)
    store.verifications.insert(
      VerificationSchema.parse({
        id,
        taskId: task.id,
        createdAt: now,
        checkpoint: 'head',
        baseline: [],
        current: [{ command: 'node verify.mjs', status: 'failed', exitCode: 1, tail }],
        judgment,
        decision: decideNext({ judgment, limits: DEFAULT_LIMITS, attempts: 0, stalled: 0, tampered: false }),
      }),
    )
  }
  const record = (detector: DetectorId, score: number, at = now) => {
    const candidate: OpportunityCandidate = {
      detector,
      score,
      subject: { goalId: goal.id },
      dedupeKey: detector,
      summary: '',
      evidence: [],
    }
    return store.opportunities.save(candidate, 'L1', at)
  }
  return {
    store,
    goal,
    task,
    scopes,
    initiative,
    settings,
    log,
    addFailure,
    record,
    now: () => now,
    setNow: (v: number) => {
      now = v
    },
  }
}

test('merges failure evidence by run, expires old findings and permits a new occurrence', async () => {
  const f = setup()
  const output = 'ENOENT missing reference sk-abcdefghijklmnopqrstuvwxyz'
  for (const id of ['r1', 'r2', 'r3']) f.addFailure(id, output)
  await f.initiative.scan()
  const first = f.store.opportunities.list()[0]!
  expect(first).toMatchObject({
    detector: 'repeatedFailure',
    level: 'L1',
    status: 'open',
    createdAt: START,
    expiresAt: START + INITIATIVE_TTL,
  })
  expect(first.evidence).toHaveLength(3)
  expect(JSON.stringify(first)).not.toContain(output)
  const evidence = JSON.stringify(f.initiative.evidence(first.id))
  expect(evidence).toContain('node verify.mjs')
  expect(evidence).toContain('[已隐藏]')
  expect(evidence).not.toContain('sk-abcdefghijklmnopqrstuvwxyz')
  expect(JSON.stringify(f.initiative.query())).not.toContain('node verify.mjs')
  f.addFailure('r4', output)
  f.initiative.refresh()
  await f.initiative.scan()
  expect(f.store.opportunities.list()).toEqual([
    expect.objectContaining({
      id: first.id,
      createdAt: START,
      evidence: expect.arrayContaining([expect.objectContaining({ id: 'r4' })]),
    }),
  ])
  f.setNow(START + INITIATIVE_TTL)
  f.addFailure('r5', output)
  f.initiative.refresh()
  await f.initiative.scan()
  expect(f.store.opportunities.list()).toEqual([
    expect.objectContaining({ id: first.id, status: 'expired' }),
    expect.objectContaining({ status: 'open', createdAt: START + INITIATIVE_TTL }),
  ])
})

test('coalesces committed changes for 30 seconds and reads only the affected goal', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const f = setup()
  f.store.goals.insert(makeGoal({ ...f.goal, id: makeGoal().id.replace('1', '2') as typeof f.goal.id }))
  f.initiative.start()
  await vi.advanceTimersByTimeAsync(0)
  await f.initiative.scan()
  const read = vi.spyOn(f.store.verifications, 'forGoal')
  for (const id of ['r1', 'r2', 'r3']) f.addFailure(id)
  await Promise.resolve()
  await vi.advanceTimersByTimeAsync(29999)
  expect(read).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  await f.initiative.scan()
  expect(read).toHaveBeenCalledExactlyOnceWith(f.goal.id)
  expect(f.initiative.panel().counts.repeatedFailure).toBe(1)
})

test('disabling a detector retains existing records, and reserved channels never promote findings', async () => {
  const f = setup()
  for (const id of ['r1', 'r2', 'r3']) f.addFailure(id)
  f.settings.channels.cards = true
  await f.initiative.scan()
  const [first] = f.store.opportunities.list()
  expect(first?.level).toBe('L1')
  f.settings.detectors.repeatedFailure.enabled = false
  for (const id of ['r4', 'r5', 'r6']) f.addFailure(id, 'EACCES access denied')
  f.initiative.refresh()
  await f.initiative.scan()
  expect(f.store.opportunities.list()).toEqual([first])
  expect(f.initiative.brief(START)).toEqual([])
  f.settings.detectors.repeatedFailure.enabled = true
  f.initiative.refresh()
  await f.initiative.scan()
  expect(f.store.opportunities.list()).toHaveLength(2)
})

test('brief takes the three highest scores, freezes the day and respects both channel switches', () => {
  const f = setup()
  for (const [index, detector] of DETECTORS.slice(0, 4).entries()) f.record(detector, 0.4 + index * 0.1)
  const briefDeps = {
    locale: () => 'zh-CN' as const,
    owns: () => true,
    now: f.now,
    findings: (at: number) => f.initiative.brief(at),
  }
  let enabled = false
  const brief = new CompanionDailyBrief(f.store, f.scopes, { ...briefDeps, enabled: () => enabled })
  expect(brief.panel().today).toBeUndefined()
  enabled = true
  const first = brief.panel().today!
  expect(
    first.text
      .split('最近发现\n')[1]
      ?.split('\n')
      .map((row) => row.split(' · ')[0]),
  ).toEqual(['• 预算将尽', '• 验收依据不足', '• 停滞前兆'])
  f.record('pendingBacklog', 1)
  expect(brief.panel().today).toEqual(first)
  f.setNow(START + INITIATIVE_DAY)
  const second = brief.panel().today!
  expect(second.text).toContain('决定积压')
  f.setNow(START + 2 * INITIATIVE_DAY)
  f.settings.channels.brief = false
  expect(brief.panel().today).toBeUndefined()
})

test('migration 10 preserves a version 9 database and the addressed trace includes new findings', () => {
  const dir = mkdtempSync(join(tmpdir(), 'whalemaid-initiative-migration-'))
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
  const prior = new WhaleStore(dir, { migrations: MIGRATIONS.slice(0, 9), log: vi.fn() })
  const goal = makeGoal()
  try {
    prior.goals.insert(goal)
    prior.tasks.insert(makeTask())
  } finally {
    prior.close()
  }
  const store = new WhaleStore(dir, { log: vi.fn() })
  cleanups.push(() => store.close())
  expect(store.status().state).toBe('ok')
  expect(readdirSync(join(dir, 'backups'))).toHaveLength(1)
  expect(store.goals.get(goal.id)).toEqual(goal)
  expect(store.tasks.list(goal.id)).toEqual([makeTask()])
  const row = store.opportunities.save(
    {
      detector: 'stallWarning',
      subject: { goalId: goal.id },
      dedupeKey: 'test',
      summary: 'fixed text',
      score: 0.8,
      evidence: [],
    },
    'L1',
    START,
  )
  expect(
    exportTrace(store, goal.id).markdown.split('## Initiative findings')[1]?.split('\n## ')[0],
  ).toContain(row.id)
})
