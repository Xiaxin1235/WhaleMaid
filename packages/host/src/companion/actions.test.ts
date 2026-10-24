import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, test, vi } from 'vitest'
import type { PeerScope } from '@deepseek-ai/dsh-client-connection'
import type { MemoryDependencies, MemoryExecution } from './memory.js'
import { CompanionMemory } from './memory.js'
import { CompanionActions } from './actions.js'
import { GoalIntake } from '../goal-intake/service.js'
import { AutopilotScheduler } from '../autopilot/scheduler.js'
import { WhaleStore, productionClock, productionIdGen, sha256 } from '../store/index.js'
import { ScopeService } from '../scope-service.js'
import { exportTrace } from '../autopilot/trace.js'
import { makeGoal, makeTask } from '../../../core/tests/fixtures.js'
import { buildTaskPrompt, deriveRunScope, CompanionActionSchema } from '@whaledot/core'
import { draft } from '../../../core/tests/draft-fixtures.js'
import { ToolGate } from '../execution/tool-gate.js'
import { RunRegistry } from '../execution/registry.js'
import { companionTools } from './tools.js'
import type { CompanionApi } from './service.js'
import { MIGRATIONS } from '../store/migrations.js'
const clean: (() => void)[] = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const f of clean.splice(0).reverse()) f()
})
const owner = { principal: { kind: 'owner' }, signal: new AbortController().signal } as PeerScope
function fixture(ask?: MemoryDependencies['ask']) {
  const dir = mkdtempSync(join(tmpdir(), 'p13-actions-')),
    store = new WhaleStore(join(dir, 'data'), { log: vi.fn() })
  clean.push(
    () => rmSync(dir, { recursive: true, force: true }),
    () => store.close(),
  )
  store.goals.insert(makeGoal({ projectRoot: dir }))
  const scopes = new ScopeService(store, {
    clock: productionClock,
    idGen: productionIdGen,
    hasher: sha256,
    log: vi.fn(),
    revoked: vi.fn(),
  })
  const scope = scopes.grant(
    {
      goalId: makeGoal().id,
      allowedPaths: [dir],
      protectedPaths: [],
      allowedActions: ['read-file'],
      forbiddenActions: [],
      verifyCommands: [],
      permissionPreset: 'read-only',
    },
    owner,
  )
  const actor = {
    agent: { session: { id: 'companion' } },
    signal: new AbortController().signal,
  } as MemoryExecution
  const askFn = vi.fn<MemoryDependencies['ask']>(
    ask ?? (async (_a, q) => ({ answers: [{ id: q.id, selected: ['确认'] }] })),
  )
  const memory = new CompanionMemory(store, {
    owns: (id) => id === 'companion',
    ask: askFn,
    locale: () => 'zh-CN',
    settings: () => ({ enabled: true, suggest: true, maxChars: 2000, draftProjectLessons: false }),
    timeoutMs: 10,
  })
  const model = { generate: vi.fn(async () => '```json\n' + JSON.stringify(draft) + '\n```') }
  const intake = new GoalIntake(store, scopes, model)
  // No scheduler is started: production service validation is exercised without background execution.
  const autopilot = new AutopilotScheduler(
    store,
    scopes,
    {} as ConstructorParameters<typeof AutopilotScheduler>[2],
    { locale: () => 'zh-CN', log: vi.fn() },
  )
  let enabled = true
  const actions = new CompanionActions(store, {
    owns: (id) => id === 'companion',
    enabled: () => enabled,
    locale: () => 'zh-CN',
    confirm: (e, q) => memory.confirm(e, q),
    intake,
    autopilot,
    setPaused: (p) => store.setPaused(p),
    now: () => 1000,
  })
  clean.push(
    () => intake.dispose(),
    () => actions.dispose(),
  )
  return {
    dir,
    store,
    scope,
    scopes,
    actor,
    askFn,
    intake,
    model,
    autopilot,
    actions,
    disable: () => {
      enabled = false
    },
  }
}
const pause = { kind: 'goal-pause', goalId: 'goal_1', paused: true }
test.each(['decline', 'custom', 'wrong-id', 'cancel', 'timeout', 'abort'] as const)(
  '%s never mutates state or writes a confirmed event',
  async (mode) => {
    const f = fixture(async (_a, q, signal) => {
      if (mode === 'cancel') throw Error('ASK_ABORTED')
      if (mode === 'timeout' || mode === 'abort')
        return new Promise((_, reject) =>
          signal.addEventListener('abort', () => reject(Error('aborted')), { once: true }),
        )
      return {
        answers: [
          {
            id: mode === 'wrong-id' ? 'wrong' : q.id,
            selected: [mode === 'decline' ? '不用了' : '确认'],
            ...(mode === 'custom' ? { custom: '确认' } : {}),
          },
        ],
      }
    })
    const controller = new AbortController(),
      pending = f.actions.propose(pause, { ...f.actor, signal: controller.signal })
    if (mode === 'abort') controller.abort()
    expect(await pending).toMatchObject({ status: 'declined' })
    expect(f.store.goals.get(makeGoal().id)?.status).toBe('active')
    expect(f.store.autopilotEvents.list()).toEqual([])
  },
)
test('confirmed pause uses the existing service; no-op refuses; sequential asks share exact agent and fresh ids', async () => {
  const f = fixture(),
    spy = vi.spyOn(f.intake, 'setPaused')
  expect(await f.actions.propose(pause, f.actor)).toMatchObject({ status: 'succeeded' })
  expect(spy).toHaveBeenCalledTimes(1)
  expect(f.store.goals.get(makeGoal().id)?.status).toBe('paused')
  expect(await f.actions.propose(pause, f.actor)).toMatchObject({ status: 'rejected' })
  expect(f.askFn).toHaveBeenCalledTimes(1)
  await f.actions.propose({ ...pause, paused: false }, f.actor)
  expect(f.askFn).toHaveBeenCalledTimes(2)
  expect(f.askFn.mock.calls.every((c) => c[0] === f.actor.agent)).toBe(true)
  expect(f.askFn.mock.calls[0]![1].id).not.toBe(f.askFn.mock.calls[1]![1].id)
  const events = f.store.autopilotEvents.list()
  expect(events).toHaveLength(2)
  expect(events[0]).toMatchObject({
    actor: 'companion-proposal',
    confirmedAt: 1000,
    sessionId: 'companion',
    reason: 'succeeded',
  })
  expect(exportTrace(f.store, makeGoal().id).markdown).toContain(events[0]!.proposalId)
})
test.each(['goal', 'scope', 'global', 'notes', 'disabled'] as const)(
  'state %s changes during confirmation refuse execution',
  async (mode) => {
    const f = fixture()
    f.askFn.mockImplementation(async (_a, q) => {
      if (mode === 'goal') {
        const g = f.store.goals.get(makeGoal().id)!
        f.store.goals.update({ ...g, title: 'changed', version: g.version + 1 }, g.version)
      }
      if (mode === 'scope') f.scopes.revoke(f.scope.id, owner)
      if (mode === 'global') {
        f.store.setPaused(true)
        f.store.setPaused(false)
      }
      if (mode === 'notes')
        f.store.userNotes.insert({
          id: 'other',
          goalId: makeGoal().id,
          source: 'companion',
          at: 1,
          text: 'other',
        })
      if (mode === 'disabled') f.disable()
      return { answers: [{ id: q.id, selected: ['确认'] }] }
    })
    const result = await f.actions.propose(pause, f.actor)
    expect(result.status).toBe(mode === 'disabled' ? 'disabled' : 'rejected')
    expect(f.store.goals.get(makeGoal().id)?.status).toBe('active')
  },
)
test('autopilot uses the exact reviewed scope hash and no model-supplied scope or confirmation', async () => {
  const f = fixture(),
    spy = vi.spyOn(f.autopilot, 'setAutopilot')
  await f.actions.propose({ kind: 'autopilot', goalId: 'goal_1', enabled: true }, f.actor)
  expect(spy).toHaveBeenCalledWith({
    goalId: 'goal_1',
    enabled: true,
    confirm: true,
    scopeHash: f.scope.hash,
  })
  expect(f.askFn.mock.calls[0]![1].detail).toContain(f.scope.allowedPaths[0]!.replaceAll('\\', '\\'))
  expect(() =>
    f.autopilot.setAutopilot({ goalId: makeGoal().id, enabled: true, confirm: true, scopeHash: 'wrong' }),
  ).toThrow('autopilot-confirmation-required')
  expect(
    CompanionActionSchema.safeParse({ kind: 'autopilot', goalId: 'goal_1', enabled: true, confirmed: true })
      .success,
  ).toBe(false)
})
test('note is secret-checked, has no fabricated notification id, and appears in the next task prompt', async () => {
  const f = fixture()
  expect(
    await f.actions.propose({ kind: 'goal-note', goalId: 'goal_1', text: 'token=verysecret123' }, f.actor),
  ).toMatchObject({ status: 'rejected' })
  expect(f.askFn).not.toHaveBeenCalled()
  await f.actions.propose({ kind: 'goal-note', goalId: 'goal_1', text: '先别动 utils.ts' }, f.actor)
  const notes = f.store.userNotes.list(makeGoal().id)
  expect(notes[0]).toMatchObject({ source: 'companion', text: '先别动 utils.ts' })
  expect(notes[0]?.notificationId).toBeUndefined()
  const runScope = deriveRunScope(f.scope, f.scope.allowedPaths[0]!, f.scope.allowedPaths[0]!)
  expect(
    buildTaskPrompt(
      f.store.goals.get(makeGoal().id)!,
      makeTask(),
      runScope,
      'zh-CN',
      notes.map((n) => n.text),
    ),
  ).toContain('先别动 utils.ts')
})
test('draft uses P07 start, remains a draft and cannot use a companion capability to grant authorization', async () => {
  const f = fixture(),
    spy = vi.spyOn(f.intake, 'start')
  const r = await f.actions.propose({ kind: 'draft-goal', text: '补全README', projectRoot: f.dir }, f.actor)
  expect(r.status).toBe('draft-started')
  expect(spy).toHaveBeenCalledTimes(1)
  const draftId = (r.result as { draftId: string }).draftId
  await vi.waitFor(() => expect(f.intake.status({ draftId }, owner).state).toBe('ready'))
  expect(f.intake.companionDrafts(owner)).toMatchObject([{ draftId, proposalId: r.proposalId }])
  expect(f.store.goals.list()).toHaveLength(1)
  expect(f.store.tasks.list(makeGoal().id)).toEqual([])
  await expect(f.intake.confirm({}, spy.mock.calls[0]![1] as PeerScope)).rejects.toThrow(
    'Authenticated owner required',
  )
})
test('enabled setting, 3 pending cap, exact tool ownership and gate retain file/command denial', async () => {
  const f = fixture(async () => new Promise(() => {}))
  const pending = Array.from({ length: 3 }, () => f.actions.propose(pause, f.actor))
  expect(await f.actions.propose(pause, f.actor)).toMatchObject({
    status: 'rejected',
    message: expect.stringContaining('3'),
  })
  f.actions.dispose()
  await Promise.all(pending)
  const off = fixture()
  off.disable()
  expect(await off.actions.propose(pause, off.actor)).toMatchObject({ status: 'disabled' })
  expect(off.askFn).not.toHaveBeenCalled()
  await expect(
    off.actions.propose(pause, { ...off.actor, agent: { session: { id: 'ordinary' } } } as MemoryExecution),
  ).rejects.toThrow('companion-only')
  off.store.setCompanionSession({ sessionId: 'companion', createdAt: 1, previous: [] })
  const gate = new ToolGate(new RunRegistry(off.store), () => 'en'),
    next = vi.fn(async () => ({ kind: 'allow' as const }))
  const names = companionTools({ actions: off.actions } as CompanionApi)
    .filter((t) => t.name.startsWith('whaledot_propose_'))
    .map((t) => t.name)
  expect(names).toHaveLength(5)
  for (const name of names) {
    expect(
      await gate.check({ name, arguments: {}, agent: { session: { id: 'companion' } } }, next),
    ).toMatchObject({ kind: 'allow' })
    for (const id of ['ordinary', 'execution'])
      expect(await gate.check({ name, arguments: {}, agent: { session: { id } } }, next)).toMatchObject({
        kind: 'deny',
      })
  }
  for (const name of [
    'read',
    'write',
    'pwsh',
    'whaledot_propose_abandon',
    'whaledot_propose_change_direction',
  ])
    expect(
      await gate.check({ name, arguments: {}, agent: { session: { id: 'companion' } } }, next),
    ).toMatchObject({ kind: 'deny' })
})
test('v8 preserves old event bytes and can read goal-less companion audit rows after reopening', () => {
  const dir = mkdtempSync(join(tmpdir(), 'p13-v8-'))
  clean.push(() => rmSync(dir, { recursive: true, force: true }))
  const old = new WhaleStore(dir, { log: vi.fn(), migrations: MIGRATIONS.slice(0, 7) })
  old.goals.insert(makeGoal())
  old.autopilotEvents.insert({ id: 'old', goalId: makeGoal().id, action: 'enabled', at: 1, reason: 'user' })
  old.close()
  const raw = () => {
    const db = new DatabaseSync(join(dir, 'whaledot.db'))
    try {
      return db.prepare("SELECT data FROM autopilot_events WHERE id='old'").get()?.data
    } finally {
      db.close()
    }
  }
  const before = raw(),
    upgraded = new WhaleStore(dir, { log: vi.fn() })
  clean.push(() => upgraded.close())
  expect(raw()).toBe(before)
  upgraded.autopilotEvents.insert({
    id: 'global',
    actor: 'companion-proposal',
    action: 'global-pause',
    at: 2,
    reason: 'succeeded',
    proposalId: 'p',
    sessionId: 's',
    confirmedAt: 2,
  })
  expect(upgraded.autopilotEvents.list()).toHaveLength(2)
  expect(upgraded.status().corruptRows).toBe(0)
})
test('confirmed global pause/resume uses the same persistent service and emits goal-less audit', async () => {
  const f = fixture(),
    set = vi.spyOn(f.store, 'setPaused')
  for (const paused of [true, false]) {
    expect(await f.actions.propose({ kind: 'global-pause', paused }, f.actor)).toMatchObject({
      status: 'succeeded',
    })
    expect(f.store.paused()).toBe(paused)
  }
  expect(set.mock.calls).toEqual([[true], [false]])
  expect(f.store.pauseVersion()).toBe(2)
  expect(
    f.store.autopilotEvents.list().every((e) => e.goalId === undefined && e.actor === 'companion-proposal'),
  ).toBe(true)
})
