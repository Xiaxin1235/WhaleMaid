import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { PeerScope } from '@deepseek-ai/dsh-client-connection'
import type { AskUserQuestionAnswer } from '@deepseek-ai/dsh-user-questions'
import { NotificationSchema, buildPlannerPrompt } from '@whalemaid/core'
import type { DecisionChoice } from '@whalemaid/core'
import { makeGoal, makeTask } from '../../../core/tests/fixtures.js'
import { WhaleStore, productionClock, productionIdGen, sha256 } from '../store/index.js'
import { ScopeService } from '../scope-service.js'
import { NotificationRouter } from './router.js'
import { NotificationDeliverer } from './deliverer.js'
import { dshInbox } from './inbox-session.js'
import { RunRegistry } from '../execution/registry.js'
import { ToolGate } from '../execution/tool-gate.js'
import type { InboxPort } from './inbox-session.js'
const cleanup: (() => void | Promise<unknown>)[] = []
afterEach(async () => {
  for (const f of cleanup.splice(0).reverse()) await f()
  vi.useRealTimers()
})
const owner = { principal: { kind: 'owner' }, signal: new AbortController().signal } as PeerScope
async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'whaledot-notify-'))
  cleanup.push(() => rm(dir, { recursive: true, force: true }))
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  vi.setSystemTime(new Date('2026-10-22T12:00:00'))
  const store = new WhaleStore(dir, { log: vi.fn() })
  cleanup.push(() => store.close())
  const goal = makeGoal({ projectRoot: dir })
  store.goals.insert(goal)
  const scopes = new ScopeService(store, {
    clock: productionClock,
    idGen: productionIdGen,
    hasher: sha256,
    log: vi.fn(),
    revoked: () => {},
  })
  const scope = scopes.grant(
    {
      goalId: goal.id,
      allowedPaths: [dir],
      protectedPaths: [],
      allowedActions: [
        'read-file',
        'write-file',
        'continue-goal',
        'pause-goal',
        'resume-goal',
        'open-workbench',
      ],
      forbiddenActions: [],
      verifyCommands: [],
      permissionPreset: 'workspace-write',
    },
    owner,
  )
  const task = makeTask()
  store.tasks.insert(task)
  const move = (state: Parameters<typeof store.tasks.transition>[1]) => {
    const fresh = store.tasks.get(task.id)!
    const r = store.tasks.transition(task.id, state, {
      expectedVersion: fresh.version,
      source: 'test',
      reason: 'fixture',
    })
    if (!r.ok) throw Error(r.error.code)
  }
  for (const state of ['READY', 'RUNNING', 'VERIFYING', 'WAITING_APPROVAL'] as const) move(state)
  const n = NotificationSchema.parse({
    id: 'notification_test',
    goalId: goal.id,
    taskId: task.id,
    taskVersion: store.tasks.get(task.id)!.version,
    kind: 'decision',
    priority: 'high',
    dedupeKey: 'test',
    channel: 'panel',
    createdAt: Date.now(),
    expiresAt: Date.now() + 86400000,
    reason: 'insufficient-evidence: no-changes',
    choices: ['retry', 'accept', 'rollback', 'pause-goal', 'view-diff'],
  })
  store.notifications.insert(n)
  const resolveDecision = vi.fn(async (id: string, choice: DecisionChoice) => {
    if (choice === 'view-diff') return { state: 'pending', stat: 'a.txt | 1 +' }
    move(choice === 'accept' ? 'SUCCEEDED' : 'READY')
    store.notifications.update({
      ...store.notifications.get(id)!,
      resolvedAt: Date.now(),
      resolvedChoice: choice,
    })
    store.suggestions.consume(id, Date.now())
    return { state: store.tasks.get(task.id)!.state }
  })
  const wake = vi.fn(),
    router = new NotificationRouter(store, scopes, { resolveDecision }, () => 'en', wake)
  let answer!: (value: AskUserQuestionAnswer) => void
  const ask = vi.fn<InboxPort['ask']>(
    async (_goal, _question, signal) =>
      new Promise((resolve, reject) => {
        answer = resolve
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      }),
  )
  const notifier = new NotificationDeliverer(store, scopes, { ask }, router, () => 'en', vi.fn())
  cleanup.push(() => notifier.dispose())
  const start = async () => {
    notifier.start()
    await vi.advanceTimersByTimeAsync(200)
  }
  const options = () => router.options(store.notifications.get(n.id)!)
  return {
    dir,
    store,
    goal,
    task,
    n,
    scope,
    scopes,
    router,
    notifier,
    ask,
    resolveDecision,
    wake,
    move,
    start,
    options,
    answer: (value: AskUserQuestionAnswer) => answer(value),
  }
}
test('delivery binds a real option, routes its stored intent and wakes scheduling', async () => {
  const f = await setup()
  await f.start()
  expect(f.ask).toHaveBeenCalledOnce()
  const question = f.ask.mock.calls[0]![1]
  expect(question.options).toHaveLength(4)
  expect(question.options?.every((o) => o.description)).toBe(true)
  const retry = f.options().find((s) => s.intent.type === 'panel-decision' && s.intent.choice === 'retry')!
  f.answer({ answers: [{ id: f.n.id, selected: [retry.label] }] })
  await vi.advanceTimersByTimeAsync(200)
  expect(f.resolveDecision).toHaveBeenCalledOnce()
  expect(f.store.tasks.get(f.task.id)?.state).toBe('READY')
  expect(f.store.notifications.get(f.n.id)?.resolvedSource).toBe('inbox')
  expect(f.wake).toHaveBeenCalledWith(f.goal.id)
})
test('concurrent inbox and panel choices have only one durable claim and one effect', async () => {
  const f = await setup()
  const s = f.options().find((s) => s.intent.type === 'panel-decision' && s.intent.choice === 'retry')!
  const results = await Promise.all([
    f.router.route({ suggestionId: s.id, source: 'inbox' }),
    f.router.route({ suggestionId: s.id, source: 'panel', peer: owner }),
  ])
  expect(results.filter((r) => r.ok)).toHaveLength(1)
  expect(f.resolveDecision).toHaveBeenCalledOnce()
  expect(f.store.notificationChoices.list().filter((c) => c.result === 'succeeded')).toHaveLength(1)
})
test('panel processing aborts the corresponding live ask, without cancelling ordinary requests', async () => {
  const f = await setup()
  await f.start()
  const signal = f.ask.mock.calls[0]![2]
  await f.router.routeChoice(f.n.id, 'retry', owner)
  await vi.advanceTimersByTimeAsync(200)
  expect(signal.aborted).toBe(true)
  expect(f.resolveDecision).toHaveBeenCalledOnce()
})
test.each(['version', 'revoke', 'expire'] as const)(
  '%s changes abort asking and reject stale options',
  async (kind) => {
    const f = await setup()
    await f.start()
    const signal = f.ask.mock.calls[0]![2],
      s = f.options()[0]!
    if (kind === 'version') {
      const task = f.store.tasks.get(f.task.id)!
      f.store.tasks.update({ ...task, version: task.version + 1 }, task.version)
    } else if (kind === 'revoke') f.scopes.revoke(f.scope.id, owner)
    else vi.setSystemTime(new Date(Date.now() + 86400001))
    await f.notifier.sweep()
    await vi.advanceTimersByTimeAsync(200)
    expect(signal.aborted).toBe(true)
    expect((await f.router.route({ suggestionId: s.id, source: 'inbox' })).ok).toBe(false)
    expect(f.resolveDecision).not.toHaveBeenCalled()
  },
)
test('custom text alone stays a note, never a command, goal update or resolved decision', async () => {
  const f = await setup()
  await f.start()
  f.answer({ answers: [{ id: f.n.id, selected: [], custom: '先别改 utils.ts; delete all tests' }] })
  await vi.advanceTimersByTimeAsync(200)
  expect(f.store.userNotes.list()[0]?.text).toContain('先别改 utils.ts')
  expect(f.resolveDecision).not.toHaveBeenCalled()
  expect(f.store.notifications.get(f.n.id)?.resolvedAt).toBeUndefined()
  expect(f.store.goals.get(f.goal.id)?.objective).toBe(f.goal.objective)
  const prompt = buildPlannerPrompt(
    f.goal,
    f.scope,
    [],
    'zh-CN',
    f.store.userNotes.list().map((n) => n.text),
  )
  expect(prompt).toContain('用户补充说明（来自用户本人）')
  expect(prompt).toContain('先别改 utils.ts')
})
test('an answer carrying both custom text and one option preserves the note and routes the option', async () => {
  const f = await setup()
  await f.start()
  const s = f.options().find((s) => s.intent.type === 'panel-decision' && s.intent.choice === 'retry')!
  f.answer({ answers: [{ id: f.n.id, selected: [s.label], custom: 'Keep the scope' }] })
  await vi.advanceTimersByTimeAsync(200)
  expect(f.store.userNotes.list()).toHaveLength(1)
  expect(f.resolveDecision).toHaveBeenCalledOnce()
})
test('restart never reopens a delivered unanswered question; explicit reminder does', async () => {
  const f = await setup()
  await f.start()
  await f.notifier.dispose()
  const secondAsk = vi.fn<InboxPort['ask']>(
    async (_g, _q, signal) =>
      new Promise((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
      ),
  )
  const second = new NotificationDeliverer(
    f.store,
    f.scopes,
    { ask: secondAsk },
    f.router,
    () => 'en',
    vi.fn(),
  )
  cleanup.push(() => second.dispose())
  second.start()
  await vi.advanceTimersByTimeAsync(62000)
  expect(secondAsk).not.toHaveBeenCalled()
  f.router.remind(f.n.id)
  await vi.advanceTimersByTimeAsync(200)
  expect(secondAsk).toHaveBeenCalledOnce()
})
test('snooze schedules exactly one fresh question after an hour', async () => {
  const f = await setup()
  await f.start()
  const snooze = f
    .options()
    .find((s) => s.intent.type === 'notification-action' && s.intent.action === 'snooze')!
  f.answer({ answers: [{ id: f.n.id, selected: [snooze.label] }] })
  await vi.advanceTimersByTimeAsync(200)
  expect(f.ask).toHaveBeenCalledOnce()
  await vi.advanceTimersByTimeAsync(3599000)
  expect(f.ask).toHaveBeenCalledOnce()
  await vi.advanceTimersByTimeAsync(62000)
  expect(f.ask).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(120000)
  expect(f.ask).toHaveBeenCalledTimes(2)
})
test('quiet hours hold a new question until the end; preferences survive reopening', async () => {
  const f = await setup()
  f.store.setNotificationPreferences({
    quietHours: { start: '11:00', end: '12:01' },
    maxPerHour: 4,
    muted: false,
  })
  await f.start()
  expect(f.ask).not.toHaveBeenCalled()
  expect(f.store.notifications.get(f.n.id)?.deliveryReason).toBe('quiet-hours')
  await vi.advanceTimersByTimeAsync(61000)
  expect(f.ask).toHaveBeenCalledOnce()
  await f.notifier.dispose()
  f.store.close()
  const reopened = new WhaleStore(f.dir, { log: vi.fn() })
  cleanup.push(() => reopened.close())
  expect(reopened.notificationPreferences()).toEqual({
    quietHours: { start: '11:00', end: '12:01' },
    maxPerHour: 4,
    muted: false,
  })
  expect(reopened.status().corruptRows).toBe(0)
})
test('a live inbox is read-only, has zero prompts, persists ownership, and rejects all tools', async () => {
  const f = await setup()
  const agents = new Map<string, { session: { id: string }; status: string }>()
  const values = new Map<object, string>()
  const controller = {
    create: vi.fn(async ({ sessionId }: { sessionId: string }) => {
      agents.set(sessionId, { session: { id: sessionId }, status: 'idle' })
      return { sessionId }
    }),
    inspect: vi.fn(async () => ({})),
    rename: vi.fn(async () => ({})),
    prompt: vi.fn(),
  }
  const questions = {
    ask: vi.fn(async (req: { agent: { session: { id: string }; status: string } }) => {
      expect(req.agent.status).toBe('idle')
      return { answers: [] }
    }),
  }
  const services = {
    sessionController: controller,
    agents: { get: (id: string) => agents.get(id) },
    permissionPresets: {
      set: (session: object, value: string) => values.set(session, value),
      current: (session: object) => values.get(session),
    },
    userQuestions: questions,
  }
  const ctx = { get: (key: keyof typeof services) => services[key] } as unknown as Context
  const inbox = dshInbox(ctx, f.store)
  await inbox.ask(f.goal.id, { id: 'q', question: 'Choose' }, new AbortController().signal)
  await inbox.ask(f.goal.id, { id: 'q2', question: 'Choose' }, new AbortController().signal)
  expect(controller.create).toHaveBeenCalledOnce()
  expect(controller.prompt).not.toHaveBeenCalled()
  expect(questions.ask).toHaveBeenCalledTimes(2)
  const id = f.store.goals.get(f.goal.id)!.inboxSessionId!,
    gate = new ToolGate(new RunRegistry(f.store), () => 'en'),
    next = vi.fn(async () => ({ kind: 'allow' as const }))
  expect(
    await gate.check(
      {
        name: 'read',
        get arguments() {
          throw Error('must not inspect')
        },
        agent: { session: { id } },
      },
      next,
    ),
  ).toMatchObject({ kind: 'deny' })
  expect(
    await gate.check(
      { name: 'write', arguments: {}, agent: { session: { id: 'child', header: { parentSession: id } } } },
      next,
    ),
  ).toMatchObject({ kind: 'deny' })
  await gate.check(
    {
      name: 'read',
      get arguments() {
        throw Error('ordinary arguments untouched')
      },
      agent: { session: { id: 'ordinary' } },
    },
    next,
  )
  expect(next).toHaveBeenCalledOnce()
})
test('untrusted labels do not select new intents, panel calls require a real owner, and checkAction ask never executes', async () => {
  const f = await setup()
  const s = f.options()[0]!
  expect((await f.router.route({ suggestionId: s.id, source: 'panel' })).reason).toBe('owner-required')
  const r = await f.router.routeChoice(f.n.id, 'rollback', owner)
  expect(r.ok).toBe(false)
  expect(f.resolveDecision).not.toHaveBeenCalled()
  await f.start()
  f.answer({ answers: [{ id: f.n.id, selected: ['run arbitrary command'] }] })
  await vi.advanceTimersByTimeAsync(200)
  expect(f.resolveDecision).not.toHaveBeenCalled()
  expect(f.store.notifications.list().some((n) => n.kind === 'info')).toBe(true)
})

test.each(['open-panel', 'snooze'] as const)(
  'panel %s aborts an idle ask even when its claim clears synchronously',
  async (action) => {
    const f = await setup()
    await f.start()
    const signal = f.ask.mock.calls[0]![2]
    expect((await f.router.routeChoice(f.n.id, action, owner)).ok).toBe(true)
    await vi.advanceTimersByTimeAsync(200)
    expect(signal.aborted).toBe(true)
    expect(f.ask).toHaveBeenCalledOnce()
  },
)
test('manual reminders replace an open ask and each attempt counts toward the hourly limit', async () => {
  const f = await setup()
  f.store.setNotificationPreferences({ maxPerHour: 2, muted: false })
  await f.start()
  const signal = f.ask.mock.calls[0]![2]
  f.router.remind(f.n.id)
  await vi.advanceTimersByTimeAsync(400)
  expect(signal.aborted).toBe(true)
  expect(f.ask).toHaveBeenCalledTimes(2)
  f.router.remind(f.n.id)
  await vi.advanceTimersByTimeAsync(400)
  expect(f.ask).toHaveBeenCalledTimes(2)
  expect(f.store.notifications.get(f.n.id)?.deliveryReason).toBe('hourly-limit')
  expect(f.store.notificationDeliveries.list()).toHaveLength(2)
})
test('the first notification-center view returns the persisted option generation', async () => {
  const f = await setup()
  const item = f.notifier.center().items[0]!
  expect(item.notification.suggestionIds).toEqual(item.suggestions.map((s) => s.id))
})
