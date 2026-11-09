import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
import {
  DEFAULT_INTAKE_ACTIONS,
  DEFAULT_LIMITS,
  DEFAULT_PROTECTED_NAMES,
  INITIATIVE_ADOPTIONS,
  I1_DETECTORS,
  INITIATIVE_DAY,
  INITIATIVE_HOUR,
  GoalIdSchema,
  NotificationIdSchema,
  SuggestionIdSchema,
  VerificationSchema,
  RunSchema,
  decideNext,
  defaultInitiativeSettings,
} from '@whalemaid/core'
import type { DetectorId, InitiativeChoice } from '@whalemaid/core'
import type { PeerScope } from '@deepseek-ai/dsh-client-connection'
import { makeGoal, makeTask } from '../../../core/tests/fixtures.js'
import { GoalIntake } from '../goal-intake/service.js'
import { NotificationDeliverer } from '../notify/deliverer.js'
import { NotificationRouter } from '../notify/router.js'
import type { InboxPort } from '../notify/inbox-session.js'
import { ScopeService } from '../scope-service.js'
import { WhaleStore, productionClock, productionIdGen, sha256 } from '../store/index.js'
import { InitiativeCards } from './cards.js'
import { isLegacyInitiativePanelSnapshot } from './config.js'

const cleanups: (() => unknown)[] = []
const now = new Date(2026, 10, 8, 12).getTime()

test('recognizes I1 saved placeholders without interpreting explicit 1.4 or partial opt-outs as defaults', () => {
  const settings = defaultInitiativeSettings()
  const channels = { ...settings.channels, cards: false }
  const detectors = Object.fromEntries(I1_DETECTORS.map((id) => [id, settings.detectors[id]]))
  expect(isLegacyInitiativePanelSnapshot({ enabled: true, detectors, channels })).toBe(true)
  expect(isLegacyInitiativePanelSnapshot({ channels: { cards: false } })).toBe(false)
  expect(isLegacyInitiativePanelSnapshot({ ...settings, channels })).toBe(false)
})
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
  vi.useRealTimers()
})

function setup() {
  vi.useFakeTimers({ now, toFake: ['Date'] })
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'whalemaid-i2-')))
  const store = new WhaleStore(dir, { log: vi.fn() })
  cleanups.push(() => {
    store.close()
    rmSync(dir, { recursive: true, force: true })
  })
  const scopes = new ScopeService(store, {
    log: vi.fn(),
    clock: productionClock,
    idGen: productionIdGen,
    hasher: sha256,
    revoked: vi.fn(),
  })
  const peer = { principal: { kind: 'owner' }, signal: new AbortController().signal } as PeerScope
  const model = { generate: vi.fn() }
  const intake = new GoalIntake(store, scopes, model, productionClock, productionIdGen, async () => ({
    projectRoot: dir,
    isGit: true,
    clean: true,
    branch: 'main',
    candidateCommands: [],
  }))
  const addGoal = (id = 'goal_1') => {
    const goal = makeGoal({ id: GoalIdSchema.parse(id), projectRoot: dir })
    store.goals.insert(goal)
    scopes.grant(
      {
        goalId: goal.id,
        allowedPaths: [dir],
        protectedPaths: [],
        allowedActions: [...DEFAULT_INTAKE_ACTIONS],
        forbiddenActions: [],
        permissionPreset: 'read-only',
        verifyCommands: [],
        limits: DEFAULT_LIMITS,
      },
      peer,
    )
    return store.goals.get(goal.id)!
  }
  const goal = addGoal()
  const settings = defaultInitiativeSettings()
  const cards = new InitiativeCards(
    store,
    scopes,
    intake,
    () => settings,
    () => 'en',
  )
  const router = new NotificationRouter(
    store,
    scopes,
    { resolveDecision: vi.fn() },
    () => 'en',
    vi.fn(),
    undefined,
    cards,
  )
  const record = (
    detector: DetectorId,
    input: { key?: string; id?: typeof goal.id; at?: number; score?: number } = {},
  ) => {
    const goalId = input.id ?? goal.id
    return store.opportunities.save(
      {
        detector,
        subject: { goalId },
        dedupeKey: `${goalId}:${detector}:${input.key ?? ''}`,
        evidence: [],
        summary: '',
        score: input.score ?? 0.9,
      },
      'L2',
      input.at ?? Date.now(),
    )
  }
  const notice = () => store.notifications.list().findLast((n) => n.kind === 'initiative')!
  const option = (choice: InitiativeChoice) =>
    router.options(notice()).find((s) => s.initiative?.choice === choice)!
  const choose = (choice: InitiativeChoice) =>
    router.route({ suggestionId: option(choice).id, source: 'panel', peer })
  const deliverer = (inbox: InboxPort) => {
    const deliverer = new NotificationDeliverer(store, scopes, inbox, router, () => 'en', vi.fn())
    cleanups.push(() => deliverer.dispose())
    deliverer.start()
    return deliverer
  }
  return {
    store,
    scopes,
    peer,
    goal,
    settings,
    cards,
    intake,
    model,
    router,
    record,
    notice,
    option,
    choose,
    deliverer,
    addGoal,
    dir,
  }
}

test('merges same-goal findings in score order and keeps subsequent findings for the next L2 window', () => {
  const f = setup()
  const low = f.record('repeatedFailure', { score: 0.72 })
  const secondFailure = f.record('repeatedFailure', { key: 'second-signature', score: 0.71 })
  const high = f.record('stallWarning', { score: 0.8 })
  f.cards.tick(now)
  const n = f.notice()
  expect(n.initiative?.ids).toEqual([high.id, low.id, secondFailure.id])
  f.cards.delivered(n, now)
  expect(f.cards.panel(f.store.opportunities.list(), now).metrics[0]?.week.delivered).toBe(1)
  f.store.notifications.update({ ...n, deliveredAt: now })
  f.record('pendingBacklog', { at: now + 1 })
  f.cards.tick(now + 4 * INITIATIVE_HOUR - 1)
  expect(f.store.notifications.list()).toHaveLength(1)
  f.cards.tick(now + 4 * INITIATIVE_HOUR)
  expect(f.store.notifications.list()).toHaveLength(2)
})

test.each(
  I1_DETECTORS.map((detector): [DetectorId, readonly InitiativeChoice[]] => [
    detector,
    INITIATIVE_ADOPTIONS[detector],
  ]),
)('%s exposes only its mapped adoptions plus fixed feedback', (detector, adoptions) => {
  const f = setup()
  f.settings.detectors[detector].maxLevel = detector === 'budgetBurn' ? 'L3' : 'L2'
  f.settings.channels.asks = true
  f.record(detector)
  f.cards.tick(now)
  expect(f.router.options(f.notice()).map((s) => s.initiative?.choice)).toEqual([
    ...adoptions,
    'snooze',
    'dismiss',
    'mute',
    'inaccurate',
    'evidence',
  ])
})

test.each([
  ['repeatedFailure', 'pause', 'paused', 0],
  ['stallWarning', 'pause', 'paused', 0],
  ['budgetBurn', 'pause', 'paused', 0],
  ['idleGoal', 'idle-pause', 'paused', 1],
  ['idleGoal', 'idle-keep', 'active', 1],
] as const)('%s applies %s via existing goal controls', async (detector, choice, status, notes) => {
  const f = setup()
  f.settings.detectors[detector].maxLevel = 'L2'
  f.record(detector)
  f.cards.tick(now)
  expect((await f.choose(choice)).ok).toBe(true)
  expect(f.store.goals.get(f.goal.id)?.status).toBe(status)
  expect(f.store.userNotes.list(f.goal.id)).toHaveLength(notes)
})

test('navigation selects the right goal or decision without resolving the decision', async () => {
  const f = setup()
  const other = f.addGoal('goal_backlog')
  f.settings.detectors.noAcceptance.maxLevel = 'L2'
  f.record('noAcceptance')
  f.cards.tick(now)
  expect(await f.choose('open-goal')).toMatchObject({ ok: true, openPanel: true, goalId: f.goal.id })
  const decision = NotificationIdSchema.parse('decision_waiting')
  f.store.notifications.insert({
    id: decision,
    kind: 'decision',
    priority: 'high',
    dedupeKey: 'waiting',
    goalId: other.id,
    channel: 'panel',
    createdAt: now - INITIATIVE_DAY,
  })
  f.record('pendingBacklog', { id: other.id })
  f.cards.tick(now + 1)
  expect(await f.choose('open-decision')).toMatchObject({ ok: true, openPanel: true, decisionId: decision })
  expect(f.store.notifications.get(decision)?.resolvedAt).toBeUndefined()
})

test('leftovers adoption persists an unapproved follow-up draft for a completed goal', async () => {
  const f = setup()
  f.store.goals.update({ ...f.goal, version: f.goal.version + 1, status: 'completed' }, f.goal.version)
  f.settings.detectors.leftovers.maxLevel = 'L2'
  const row = f.record('leftovers')
  f.cards.tick(now)
  expect(await f.choose('draft-followup')).toMatchObject({ ok: true, draftId: `initiative:${row.id}` })
  expect(f.store.opportunities.get(row.id)?.draft?.content.title).toMatch(/remaining work/)
  expect(f.store.goals.list()).toHaveLength(1)
  expect(f.model.generate).not.toHaveBeenCalled()
})

test('panel and inbox race one claim, and the deterministic draft needs a separate read-only owner grant', async () => {
  const f = setup()
  const row = f.record('repeatedFailure')
  f.cards.tick(now)
  const s = f.option('draft-diagnosis')
  const [panel, inbox] = await Promise.all([
    f.router.route({ suggestionId: s.id, source: 'panel', peer: f.peer }),
    f.router.route({ suggestionId: s.id, source: 'inbox' }),
  ])
  expect([panel.ok, inbox.ok]).toEqual([true, false])
  expect(f.store.goals.list()).toHaveLength(1)
  expect(f.store.notificationChoices.list()).toHaveLength(1)
  expect(f.model.generate).not.toHaveBeenCalled()
  const { draft } = await f.intake.preparedStatus({ draftId: panel.draftId }, f.peer)
  const { proposedVerifyCommands: _commands, proposedProtectedPaths: _paths, ...editable } = draft!
  expect(_commands).toEqual([])
  expect(_paths).toEqual([])
  const form = {
    ...editable,
    draftId: panel.draftId,
    projectRoot: f.dir,
    allowedPaths: [f.dir],
    protectedPaths: [join(f.dir, '.git'), join(f.dir, '.env*')],
    protectedNames: DEFAULT_PROTECTED_NAMES,
    allowedActions: DEFAULT_INTAKE_ACTIONS,
    verifyCommands: [],
    limits: DEFAULT_LIMITS,
    permissionPreset: 'read-only',
    confirm: true,
    limitsExpandedConfirmed: false,
  }
  await expect(f.intake.confirm({ ...form, permissionPreset: 'workspace-write' }, f.peer)).rejects.toThrow(
    'initiative-draft-requires-read-only',
  )
  const authorized = await f.intake.confirm(form, f.peer)
  expect(authorized.scope.permissionPreset).toBe('read-only')
  expect(authorized.goal.autopilot.enabled).toBe(false)
  await expect(f.intake.confirm(form, f.peer)).rejects.toThrow('draft-expired')
  expect(f.store.opportunities.get(row.id)?.progressGoal).toBe(authorized.goal.id)
  vi.setSystemTime(now + 1)
  f.store.goals.update(
    { ...authorized.goal, version: authorized.goal.version + 1, status: 'completed' },
    authorized.goal.version,
  )
  f.cards.tick(now + 2)
  expect(f.store.journal.list()[0]?.kind).toBe('experience')
  expect(f.store.journal.list()[0]).toMatchObject({ refs: [row.id, authorized.goal.id] })
})

test('stale goal versions, unoffered options, and retired authorization cannot execute a selection', async () => {
  const f = setup()
  f.record('repeatedFailure')
  f.cards.tick(now)
  const option = f.option('pause')
  const goal = f.store.goals.get(f.goal.id)!
  f.store.goals.update({ ...goal, inboxSessionId: 'new-transport', version: goal.version + 1 }, goal.version)
  expect((await f.router.route({ suggestionId: option.id, source: 'inbox' })).ok).toBe(false)
  const fresh = f.option('pause')
  expect(fresh.id).not.toBe(option.id)
  expect((await f.router.route({ suggestionId: 'fabricated', source: 'inbox' })).ok).toBe(false)
  const fakeId = SuggestionIdSchema.parse('fabricated_option')
  f.store.suggestions.insert({ ...fresh, id: fakeId })
  expect((await f.router.route({ suggestionId: fakeId, source: 'inbox' })).ok).toBe(false)
  f.scopes.revoke(f.scopes.activeScopeFor(goal.id)!.id, f.peer)
  expect((await f.router.route({ suggestionId: fresh.id, source: 'inbox' })).ok).toBe(false)
  expect(f.store.goals.get(goal.id)?.status).toBe('active')
})

test('mute is goal-scoped, snoozed cards return with fresh options, and inaccurate feedback is counted', async () => {
  const f = setup()
  const a = f.record('repeatedFailure')
  f.cards.tick(now)
  const old = f.option('snooze')
  expect((await f.choose('snooze')).ok).toBe(true)
  expect(f.notice().remindAt).toBe(now + INITIATIVE_HOUR)
  expect(f.store.opportunities.get(a.id)?.status).toBe('snoozed')
  expect((await f.router.route({ suggestionId: old.id, source: 'inbox' })).ok).toBe(false)
  vi.setSystemTime(now + INITIATIVE_HOUR)
  expect((await f.choose('mute')).ok).toBe(true)
  const other = f.addGoal('goal_other')
  f.record('repeatedFailure', { key: 'new' })
  f.record('repeatedFailure', { id: other.id })
  f.cards.tick(Date.now() + 1)
  expect(f.notice().goalId).toBe(other.id)
  expect((await f.choose('inaccurate')).ok).toBe(true)
  expect(f.cards.panel(f.store.opportunities.list(), Date.now() + 1).metrics[0]?.week.inaccurate).toBe(1)
  f.cards.restore({ detector: 'repeatedFailure', goalId: f.goal.id }, Date.now())
  f.cards.tick(Date.now() + 2)
  expect(f.notice().goalId).toBe(f.goal.id)
})

test('P21 applies quiet hours, recovery, and snooze generation to L3 initiative questions', async () => {
  const f = setup()
  f.settings.channels.asks = true
  const row = f.record('budgetBurn')
  f.cards.tick(now)
  expect(f.notice().initiative?.level).toBe('L3')
  const questions: Parameters<InboxPort['ask']>[1][] = []
  const ask: InboxPort['ask'] = async (_id, question, signal) => {
    questions.push(question)
    return new Promise((_, reject) =>
      signal.addEventListener('abort', () => reject(Error('cancelled')), { once: true }),
    )
  }
  f.store.setNotificationPreferences({
    quietHours: { start: '11:00', end: '13:00' },
    maxPerHour: 2,
    muted: false,
  })
  const first = f.deliverer({ ask })
  await first.sweep()
  expect(f.notice().deliveryReason).toBe('quiet-hours')
  expect(questions).toHaveLength(0)
  vi.setSystemTime(new Date(2026, 10, 8, 13).getTime())
  await first.sweep()
  await vi.waitFor(() => expect(questions).toHaveLength(1))
  expect(f.store.opportunities.get(row.id)?.status).toBe('delivered')
  const initial = f.option('dismiss')
  await first.dispose()
  expect(f.notice().decisionDelivery?.reason).toBe('host-stopped')
  const second = f.deliverer({ ask })
  await second.sweep()
  await vi.waitFor(() => expect(questions).toHaveLength(2))
  expect(f.notice().decisionDelivery?.generation).toBe(2)
  expect((await f.router.route({ suggestionId: initial.id, source: 'inbox' })).ok).toBe(false)
  expect((await f.choose('snooze')).ok).toBe(true)
  await vi.waitFor(() => expect(f.notice().decisionDelivery?.outcome).not.toBe('asking'))
  vi.setSystemTime(f.notice().remindAt! - 1)
  await second.sweep()
  expect(questions).toHaveLength(2)
  vi.setSystemTime(Date.now() + 1)
  await second.sweep()
  await vi.waitFor(() => expect(questions).toHaveLength(3))
})

test('a decision and failed initiative attempt both use the shared hourly budget; retry recovers later', async () => {
  const f = setup()
  const other = f.addGoal('goal_decision')
  const nId = NotificationIdSchema.parse('notice_decision')
  f.store.notifications.insert({
    id: nId,
    kind: 'decision',
    priority: 'high',
    dedupeKey: 'fixture-decision',
    goalId: other.id,
    channel: 'dsh-question',
    createdAt: now - 1000,
    resolvedAt: now - 500,
  })
  f.store.notificationDeliveries.insert({
    id: 'delivery_fixture',
    goalId: other.id,
    notificationId: nId,
    at: now - 1000,
    result: 'answered',
    endedAt: now - 500,
    generation: 1,
  })
  const row = f.record('repeatedFailure')
  f.cards.tick(now)
  f.store.setNotificationPreferences({ maxPerHour: 1, muted: false })
  const ask = vi
    .fn<InboxPort['ask']>()
    .mockRejectedValueOnce(Error('service down'))
    .mockResolvedValue({ answers: [] })
  const delivery = f.deliverer({ ask })
  await delivery.sweep()
  expect(f.notice().deliveryReason).toBe('hourly-limit')
  expect(ask).not.toHaveBeenCalled()
  vi.setSystemTime(now + INITIATIVE_HOUR)
  await delivery.sweep()
  await vi.waitFor(() => expect(f.notice().decisionDelivery?.outcome).toBe('failed'))
  expect(f.store.opportunities.get(row.id)?.deliveredAt).toBeUndefined()
  vi.setSystemTime(f.notice().decisionDelivery!.retryAt!)
  await delivery.sweep()
  expect(f.notice().deliveryReason).toBe('hourly-limit')
  expect(ask).toHaveBeenCalledTimes(1)
  vi.setSystemTime(now + 2 * INITIATIVE_HOUR + 100)
  await delivery.sweep()
  await vi.waitFor(() => expect(f.notice().decisionDelivery?.outcome).toBe('unanswered'))
  expect(ask).toHaveBeenCalledTimes(2)
})

test('new verification evidence tracks progress and journal can be disabled; learning is reversible', async () => {
  const f = setup()
  const row = f.record('stallWarning')
  f.cards.tick(now)
  expect((await f.choose('split-note')).ok).toBe(true)
  expect(f.store.userNotes.list(f.goal.id)).toHaveLength(1)
  const task = makeTask('t', { goalId: f.goal.id })
  f.store.tasks.insert(task)
  f.store.runs.insert(
    RunSchema.parse({
      run_id: 'pass',
      taskId: task.id,
      sessionId: 'test',
      worktreePath: f.dir,
      baseCommit: 'head',
      startedAt: now,
      endedAt: now + 1,
      status: 'ended',
    }),
  )
  const judgment = { verdict: 'PASS' as const, progress: 'unchanged' as const, reasons: [] }
  f.store.verifications.insert(
    VerificationSchema.parse({
      id: 'pass',
      taskId: task.id,
      createdAt: now + 1,
      checkpoint: 'head',
      baseline: [],
      current: [],
      judgment,
      decision: decideNext({ judgment, attempts: 0, stalled: 0, tampered: false, limits: DEFAULT_LIMITS }),
    }),
  )
  f.settings.companion.journal = false
  f.cards.tick(now + 2)
  expect(f.store.opportunities.get(row.id)?.progressAt).toBe(now + 1)
  expect(f.store.journal.list()).toEqual([])
  for (let i = 0; i < 10; i++) {
    const at = now - INITIATIVE_DAY + i
    const history = f.record('repeatedFailure', { at, key: `history-${i}` })
    f.store.opportunities.update({
      ...history,
      deliveredAt: at,
      outcomeAt: at,
      status: i < 2 ? 'accepted' : 'dismissed',
    })
  }
  f.cards.tick(now + 3)
  expect(f.cards.level({ detector: 'repeatedFailure', score: 0.9 })).toBe('L1')
  expect(f.store.autopilotEvents.list().filter((e) => e.action === 'initiative-learning')).toHaveLength(1)
  f.cards.restore({ detector: 'repeatedFailure' }, now + 4)
  f.cards.tick(now + 5)
  expect(f.cards.level({ detector: 'repeatedFailure', score: 0.9 })).toBe('L2')
})
