import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, it, vi } from 'vitest'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { CompanionJournal, TranscriptEvent } from '@whalemaid/core'
import { renderRecall, NotificationIdSchema } from '@whalemaid/core'
import { WhaleStore } from '../store/index.js'
import { MIGRATIONS } from '../store/migrations.js'
import { CompanionRecall } from './recall.js'
import { createPanelHandler } from '../panel-api/index.js'
import type { PanelRuntime } from '../panel-api/index.js'
import { makeGoal, makeTask } from '../../../core/tests/fixtures.js'

const clean: (() => Promise<unknown> | void)[] = []
afterEach(async () => {
  for (const f of clean.splice(0).reverse()) await f()
})
const human = (seq: number, text: string): TranscriptEvent => ({
  type: 'user/message',
  seq,
  data: { source: { kind: 'user' }, content: [{ type: 'text', text }] },
})
const end = (seq: number, time: number): TranscriptEvent => ({ type: 'turn/end', seq, time })
async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'whaledot-recall-'))
  clean.push(() => rm(dir, { recursive: true, force: true }))
  const store = new WhaleStore(dir, { log: vi.fn() })
  clean.push(() => store.close())
  let now = 2000000,
    current = 'old',
    n = 0
  const settings = { enabled: true, summarize: true }
  const events: Record<string, TranscriptEvent[]> = {
    old: [human(1, '周五前帮我看 C02 方案'), end(2, 0)],
    next: [],
  }
  const model = {
    generate: vi.fn(async (prompt: string, signal: AbortSignal) => {
      expect(prompt).toContain('DATA')
      signal.throwIfAborted()
      return '{"text":"我们聊了 C02 方案，答应周五前看看，仍未完成。"}'
    }),
  }
  const read = vi.fn(async (id: string) => events[id] ?? [])
  const deps = {
    settings: () => settings,
    locale: () => 'zh-CN' as const,
    sessionIds: () => Object.keys(events),
    currentSession: () => current,
    owns: (id: string) => id in events,
    read,
    log: vi.fn(),
    now: () => now,
    id: () => `journal-${++n}`,
  }
  const recall = new CompanionRecall(store, model, deps)
  clean.push(() => recall.dispose())
  const exec = (id = 'old') => ({ agent: { session: { id } } as Agent, signal: new AbortController().signal })
  return {
    dir,
    store,
    model,
    read,
    deps,
    recall,
    settings,
    events,
    exec,
    setNow: (v: number) => {
      now = v
    },
    switch: (id: string) => {
      current = id
      store.setCompanionSession({ sessionId: id, createdAt: now, previous: ['old'] })
    },
  }
}
it('summarizes on startup and switch, consumes only new seq, and deletion never replays it', async () => {
  const s = await setup()
  s.recall.start()
  await vi.waitFor(() => expect(s.store.journal.list()).toHaveLength(1))
  expect(s.store.journal.list()[0]).toMatchObject({ fromSeq: 0, toSeq: 2, kind: 'conversation' })
  s.store.journal.delete()
  s.setNow(4000000)
  await s.recall.summarize('old')
  expect(s.model.generate).toHaveBeenCalledTimes(1)
  s.events.old!.push(human(3, '新的约定'), end(4, 4000000))
  s.switch('next')
  await vi.waitFor(() => expect(s.model.generate).toHaveBeenCalledTimes(2))
  expect(s.model.generate.mock.calls.at(-1)![0]).not.toContain('周五前帮我看')
  expect(s.store.journal.list().at(-1)).toMatchObject({ fromSeq: 3, toSeq: 4 })
})
it('idle requires a finished turn and 30 minutes; interval invokes the same trigger', async () => {
  vi.useFakeTimers()
  try {
    const s = await setup()
    s.settings.summarize = false
    s.recall.start()
    s.settings.summarize = true
    s.setNow(1000)
    await s.recall.idle()
    expect(s.model.generate).not.toHaveBeenCalled()
    s.events.old!.push({ type: 'turn/start', seq: 3, time: 1000 })
    s.setNow(4000000)
    await s.recall.idle()
    expect(s.model.generate).not.toHaveBeenCalled()
    s.events.old!.push(end(4, 4000000))
    await s.recall.idle()
    expect(s.model.generate).not.toHaveBeenCalled()
    s.setNow(5800000)
    await vi.advanceTimersByTimeAsync(60000)
    expect(s.model.generate).toHaveBeenCalledTimes(1)
  } finally {
    vi.useRealTimers()
  }
})

it('startup can recall the available messages after an interrupted unfinished turn', async () => {
  const s = await setup()
  s.events.old = [{ type: 'turn/start', seq: 0, time: 1 }, human(1, '宿主中断前的约定')]
  s.recall.start()
  await vi.waitFor(() => expect(s.store.journal.list()).toHaveLength(1))
  expect(s.model.generate.mock.calls[0]![0]).toContain('宿主中断前的约定')
})
it('persists throttle and failed/skip cursors across service restarts without retry', async () => {
  const s = await setup()
  s.model.generate.mockRejectedValueOnce(Error('offline'))
  await s.recall.summarize('old')
  expect(s.store.journal.list()).toEqual([])
  const restarted = new CompanionRecall(s.store, s.model, s.deps)
  clean.push(() => restarted.dispose())
  s.events.old!.push(human(3, 'only-new'))
  await restarted.summarize('old')
  expect(s.model.generate).toHaveBeenCalledTimes(1)
  s.setNow(4000000)
  s.model.generate.mockResolvedValueOnce('{"skip":true}')
  await restarted.summarize('old')
  expect(s.store.journal.list()).toEqual([])
  s.setNow(6000000)
  await restarted.summarize('old')
  expect(s.model.generate).toHaveBeenCalledTimes(2)
})
it('limits all sessions to 30 model attempts per UTC day, including failures', async () => {
  const s = await setup()
  s.model.generate.mockRejectedValue(Error('failed'))
  for (let i = 0; i < 31; i++) {
    const id = `s${i}`
    s.events[id] = [human(1, 'remember')]
    await s.recall.summarize(id)
  }
  expect(s.model.generate).toHaveBeenCalledTimes(30)
  s.setNow(86400000)
  await s.recall.summarize('s30')
  expect(s.model.generate).toHaveBeenCalledTimes(31)
})
it('keeps tool payloads and other sessions out, rejects secret output, and obeys both toggles', async () => {
  const s = await setup()
  s.events.old!.push({
    type: 'tool/result',
    seq: 3,
    data: { message: { content: [{ type: 'text', text: 'NEVER_TOOL_RAW' }] } },
  })
  s.events.next = [human(1, 'NEVER_OTHER_SESSION')]
  s.model.generate.mockResolvedValueOnce('{"text":"token=abcdefgh1234"}')
  await s.recall.summarize('old')
  expect(s.store.journal.list()).toEqual([])
  expect(s.model.generate.mock.calls[0]![0]).not.toMatch(/NEVER_TOOL_RAW|NEVER_OTHER_SESSION/)
  s.settings.summarize = false
  await s.recall.summarize('next')
  expect(s.model.generate).toHaveBeenCalledTimes(1)
  s.settings.enabled = false
  expect(s.recall.block()).toBe('')
  expect(s.recall.search({}, s.exec())).toMatchObject({ disabled: true })
  await expect(s.recall.summarize('next')).resolves.toBeUndefined()
  expect(() => s.recall.search({}, s.exec('ordinary'))).toThrow('companion-only')
  expect(() => s.recall.search({}, s.exec('execution'))).toThrow('companion-only')
})
it('generates structured proposal and related-goal experience without model calls or unrelated goals', async () => {
  const s = await setup()
  s.settings.summarize = false
  const goal = makeGoal()
  s.store.goals.insert(goal)
  s.store.autopilotEvents.insert({
    id: 'e',
    goalId: goal.id,
    actor: 'companion-proposal',
    action: 'goal-pause',
    reason: 'succeeded',
    at: 1,
  })
  s.recall.start()
  expect(s.store.journal.list()).toHaveLength(1)
  expect(s.store.journal.get('event:e')!.text).toContain('调整目标暂停状态')
  s.store.goals.update({ ...goal, status: 'paused', version: goal.version + 1 }, goal.version)
  await vi.waitFor(() => expect(s.store.journal.list()).toHaveLength(2))
  const rows = s.store.journal.list()
  expect(rows.every((r) => r.kind === 'experience')).toBe(true)
  expect(s.model.generate).not.toHaveBeenCalled()
  expect(s.recall.block()).toBe(renderRecall(rows, 'zh-CN'))
  expect(s.recall.search({}, s.exec())).toMatchObject({
    items: expect.arrayContaining([expect.objectContaining({ kind: 'experience' })]),
  })
  s.store.journal.delete()
  await s.recall.dispose()
  const restart = new CompanionRecall(s.store, s.model, s.deps)
  clean.push(() => restart.dispose())
  restart.start()
  expect(restart.panelList().items).toEqual([])
})
it('keeps at most 300 rows of each kind including tombstones', async () => {
  const s = await setup()
  s.store.transaction(() => {
    for (const kind of ['conversation', 'experience'] as const)
      for (let i = 0; i < 302; i++)
        s.store.journal.insert({
          id: `${kind}-${i}`,
          kind,
          text: '测试',
          createdAt: i,
          status: 'active',
          ...(kind === 'conversation' ? { sessionId: 'old', fromSeq: 0, toSeq: 1 } : { refs: ['e'] }),
        } as CompanionJournal)
  })
  expect(s.store.journal.list()).toHaveLength(600)
  expect(s.store.journal.get('conversation-0')).toBeUndefined()
  expect(s.store.journal.get('experience-301')).toBeDefined()
})
it('v9 adds tables without rewriting any v8 rows', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'whaledot-v9-'))
  clean.push(() => rm(dir, { recursive: true, force: true }))
  const old = new WhaleStore(dir, { log: vi.fn(), migrations: MIGRATIONS.slice(0, 8) })
  old.goals.insert(makeGoal())
  old.tasks.insert(makeTask())
  old.memories.insert({
    id: 'confirmed-memory',
    scope: { kind: 'personal' },
    kind: 'fact',
    text: '原有已确认内容',
    source: { via: 'panel' },
    confirmedAt: 1,
    createdAt: 1,
    updatedAt: 1,
    status: 'active',
    version: 1,
  })
  old.memoryProposals.insert({
    id: 'pending-proposal',
    kind: 'memory-proposal',
    scope: { kind: 'personal' },
    memoryKind: 'fact',
    text: '原有待确认内容',
    origin: 'consolidation',
    replaces: [],
    createdAt: 1,
    expiresAt: 100,
    status: 'pending',
    version: 1,
  })
  old.autopilotEvents.insert({
    id: 'old-audit',
    goalId: makeGoal().id,
    actor: 'companion-proposal',
    action: 'goal-note',
    reason: 'succeeded',
    at: 1,
  })
  old.setPaused(true)
  old.setCompanionSession({ sessionId: 'old-companion', createdAt: 1, previous: [] })
  old.setMemoryMeta({ calls: [1], references: { 'confirmed-memory': 1 }, drafts: { old: 1 } })
  old.close()
  const snapshot = () => {
    const db = new DatabaseSync(join(dir, 'whaledot.db'))
    try {
      return Object.fromEntries(
        db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT IN ('schema_migrations','companion_journal','companion_recall_state') ORDER BY name",
          )
          .all()
          .map((r) => [String(r.name), db.prepare(`SELECT * FROM ${String(r.name)} ORDER BY rowid`).all()]),
      )
    } finally {
      db.close()
    }
  }
  const before = JSON.stringify(snapshot()),
    next = new WhaleStore(dir, { log: vi.fn() })
  clean.push(() => next.close())
  expect(next.status().state).toBe('ok')
  expect(JSON.stringify(snapshot())).toBe(before)
})
it('owner panel controls reject other principals, require clear confirmation, and retain cursors', async () => {
  const s = await setup()
  await s.recall.summarize('old')
  const handler = createPanelHandler({ recall: s.recall } as PanelRuntime),
    signal = new AbortController().signal
  const peer = { principal: { kind: 'owner' }, signal } as Parameters<typeof handler>[3]
  expect((await handler('recall-clear', {}, signal, peer)).ok).toBe(false)
  expect(
    (await handler('recall-list', {}, signal, { principal: { kind: 'remote' }, signal } as never)).ok,
  ).toBe(false)
  expect((await handler('recall-clear', { confirm: true }, signal, peer)).ok).toBe(true)
  s.setNow(4000000)
  await s.recall.summarize('old')
  expect(s.model.generate).toHaveBeenCalledTimes(1)
})

it('discarding an in-flight generation by clearing or disabling does not restore its content', async () => {
  const s = await setup()
  let finish!: (value: string) => void
  s.model.generate.mockImplementationOnce(
    () =>
      new Promise<string>((resolve) => {
        finish = resolve
      }),
  )
  const work = s.recall.summarize('old')
  await vi.waitFor(() => expect(s.model.generate).toHaveBeenCalledTimes(1))
  s.store.journal.delete()
  finish('{"text":"应丢弃的回顾"}')
  await work
  expect(s.store.journal.list()).toEqual([])
  s.setNow(4000000)
  s.events.old!.push(human(3, '新的内容'))
  s.model.generate.mockImplementationOnce(
    () =>
      new Promise<string>((resolve) => {
        finish = resolve
      }),
  )
  const disabled = s.recall.summarize('old')
  await vi.waitFor(() => expect(s.model.generate).toHaveBeenCalledTimes(2))
  s.settings.enabled = false
  finish('{"text":"关闭期间不能保存"}')
  await disabled
  expect(s.store.journal.list()).toEqual([])
})

it('deleting checkpoints existing unsummarized answers so quoted deleted recalls cannot regenerate', async () => {
  const s = await setup()
  await s.recall.summarize('old')
  s.events.next = [
    human(1, '上次聊到什么'),
    {
      type: 'assistant/message',
      seq: 2,
      data: { message: { content: [{ type: 'text', text: '复述将被删除的约定' }] } },
    },
  ]
  await s.recall.remove(s.store.journal.list()[0]!.id)
  s.setNow(4000000)
  await s.recall.summarize('next')
  expect(s.model.generate).toHaveBeenCalledTimes(1)
  s.events.next.push(human(3, '删除后新约定'))
  await s.recall.summarize('next')
  expect(s.model.generate).toHaveBeenCalledTimes(2)
  expect(s.model.generate.mock.calls.at(-1)![0]).not.toContain('复述将被删除')
  expect(s.store.journal.list().find((row) => row.status === 'active')).toMatchObject({
    fromSeq: 3,
    toSeq: 3,
  })
})

it('records direct memory and action declines once from tool ids, with disabled generation independent of experiences', async () => {
  const s = await setup()
  s.settings.summarize = false
  const goal = makeGoal()
  s.store.goals.insert(goal)
  const action = { kind: 'autopilot', goalId: goal.id, enabled: true }
  s.recall.toolOutcome('action', action, { status: 'declined' }, 'old', 'decline-call')
  s.recall.toolOutcome('action', action, { status: 'declined' }, 'old', 'decline-call')
  s.recall.toolOutcome('memory', {}, { status: 'saved', id: 'memory-id' }, 'old', 'memory-call')
  expect(s.store.journal.list()).toHaveLength(2)
  expect(s.store.journal.get('tool:memory-call')).toMatchObject({ refs: ['memory-call', 'memory-id'] })
  expect(s.model.generate).not.toHaveBeenCalled()
  s.settings.enabled = false
  s.recall.toolOutcome('memory', {}, { status: 'declined' }, 'old', 'disabled-call')
  expect(s.store.journal.list()).toHaveLength(2)
  expect(s.recall.panelList().items).toHaveLength(2)
  expect(s.recall.block()).toBe('')
})

it('resolved structured memory proposals and only related goal outcomes are recorded without model requests', async () => {
  const s = await setup()
  s.settings.summarize = false
  const related = makeGoal(),
    unrelated = makeGoal({ id: 'goal_other' as never })
  s.store.goals.insert(related)
  s.store.goals.insert(unrelated)
  s.store.autopilotEvents.insert({
    id: 'confirmed',
    goalId: related.id,
    actor: 'companion-proposal',
    action: 'goal-pause',
    companionOperation: 'pause',
    reason: 'succeeded',
    at: 1,
  })
  s.store.memoryProposals.insert({
    id: 'proposal',
    kind: 'memory-proposal',
    scope: { kind: 'personal' },
    memoryKind: 'fact',
    text: '不复制到经历的记忆原文',
    origin: 'consolidation',
    replaces: [],
    createdAt: 1,
    expiresAt: 100,
    status: 'declined',
    resolvedAt: 2,
    version: 1,
  })
  s.recall.start()
  expect(s.store.journal.list()).toHaveLength(2)
  expect(s.store.journal.get('event:confirmed')!.text).toContain('暂停目标')
  s.store.goals.update(
    { ...unrelated, status: 'completed', version: unrelated.version + 1 },
    unrelated.version,
  )
  await new Promise((resolve) => setImmediate(resolve))
  expect(s.store.journal.list()).toHaveLength(2)
  s.store.goals.update({ ...related, status: 'completed', version: related.version + 1 }, related.version)
  await vi.waitFor(() => expect(s.store.journal.list()).toHaveLength(3))
  expect(s.store.journal.list().some((row) => row.text.includes('不复制到经历'))).toBe(false)
  expect(s.model.generate).not.toHaveBeenCalled()
})

it('records an explicit abandon decision using the actual cancelled goal state and its choice reference', async () => {
  const s = await setup()
  s.settings.summarize = false
  const goal = makeGoal()
  s.store.goals.insert(goal)
  s.store.autopilotEvents.insert({
    id: 'related',
    goalId: goal.id,
    actor: 'companion-proposal',
    action: 'goal-note',
    reason: 'succeeded',
    at: 1,
  })
  s.recall.start()
  s.store.transaction(() => {
    s.store.notificationChoices.insert({
      id: 'choice',
      notificationId: NotificationIdSchema.parse('notice'),
      suggestionId: 'choice',
      reason: 'user-decision',
      source: 'panel',
      goalId: goal.id,
      action: 'abandon',
      at: 2,
      result: 'succeeded',
    })
    s.store.goals.update({ ...goal, status: 'cancelled', version: goal.version + 1 }, goal.version)
  })
  await vi.waitFor(() => expect(s.store.journal.list()).toHaveLength(2))
  expect(s.store.journal.list().at(-1)).toMatchObject({
    text: expect.stringContaining('放弃'),
    refs: [goal.id, 'choice'],
  })
})
