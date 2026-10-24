import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, test, vi } from 'vitest'
import type { PeerScope } from '@deepseek-ai/dsh-client-connection'
import { WhaleStore, productionClock, productionIdGen, sha256 } from '../store/index.js'
import { ScopeService } from '../scope-service.js'
import { makeGoal } from '../../../core/tests/fixtures.js'
import { CompanionMemory } from './memory.js'
import { MemoryDrafts } from './drafts.js'
import { NotificationIdSchema, lessonTrigger, decideDelivery } from '@whaledot/core'
import { MIGRATIONS } from '../store/migrations.js'
import { notificationDeliveryHistory } from '../notify/history.js'
const cleanup: (() => void | Promise<void>)[] = []
afterEach(async () => {
  for (const f of cleanup.splice(0).reverse()) await f()
})
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'p12-drafts-'))
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }))
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
  scopes.grant(
    {
      goalId: goal.id,
      allowedPaths: [dir],
      protectedPaths: [],
      allowedActions: ['read-file'],
      forbiddenActions: [],
      verifyCommands: [],
      permissionPreset: 'read-only',
    },
    { principal: { kind: 'owner' }, signal: new AbortController().signal } as PeerScope,
  )
  const settings = { enabled: true, suggest: true, maxChars: 2000, draftProjectLessons: true }
  let now = 1000000000
  const memory = new CompanionMemory(store, {
    locale: () => 'zh-CN',
    settings: () => settings,
    owns: () => true,
    ask: vi.fn(),
    now: () => now,
  })
  const generate = vi.fn(async (prompt: string, signal: AbortSignal) => {
    signal.throwIfAborted()
    if (!prompt.trim()) throw Error('empty fixture prompt')
    return JSON.stringify({ kind: 'decision', text: '完成后先核对验收事实。' })
  })
  const inbox = {
    ask: vi.fn(
      async (_p: unknown, _q: unknown, signal: AbortSignal) =>
        new Promise<never>((_, reject) => {
          signal.addEventListener('abort', () => reject(Error('cancelled')), { once: true })
        }),
    ),
  }
  const drafts = new MemoryDrafts(memory, { generate }, inbox, vi.fn())
  cleanup.push(() => drafts.dispose())
  return {
    store,
    goal,
    memory,
    drafts,
    settings,
    generate,
    inbox,
    advance: (ms: number) => {
      now += ms
    },
  }
}
test('three structured triggers draft once, dedupe for 24 hours, cap 3 pending per project', async () => {
  const f = fixture()
  for (const trigger of ['completed', 'blocked', 'decision'] as const) {
    await f.drafts.draftLesson(f.goal.id, trigger)
    await f.drafts.draftLesson(f.goal.id, trigger)
  }
  expect(f.generate).toHaveBeenCalledTimes(3)
  expect(f.drafts.list()).toHaveLength(3)
  expect(f.store.memories.list()).toHaveLength(0)
  f.advance(86400001)
  await f.drafts.draftLesson(f.goal.id, 'completed')
  expect(f.generate).toHaveBeenCalledTimes(3)
  f.advance(7 * 86400000)
  expect(f.drafts.list()).toHaveLength(0)
  expect(f.store.memoryProposals.list().every((p) => p.status === 'expired')).toBe(true)
  await f.drafts.draftLesson(f.goal.id, 'completed')
  expect(f.generate).toHaveBeenCalledTimes(4)
})
test('off/disabled never calls model; failure consumes allowance and never retries', async () => {
  const f = fixture()
  f.settings.draftProjectLessons = false
  await f.drafts.draftLesson(f.goal.id, 'completed')
  expect(f.generate).not.toHaveBeenCalled()
  f.settings.draftProjectLessons = true
  f.settings.enabled = false
  await f.drafts.draftLesson(f.goal.id, 'blocked')
  expect(f.generate).not.toHaveBeenCalled()
  f.settings.enabled = true
  f.generate.mockRejectedValue(Error('model unavailable'))
  await f.drafts.draftLesson(f.goal.id, 'blocked')
  await f.drafts.draftLesson(f.goal.id, 'blocked')
  expect(f.generate).toHaveBeenCalledTimes(1)
  expect(f.drafts.list()).toHaveLength(0)
})
test('model receives only structured facts, with notes redacted, and no session reader', async () => {
  const f = fixture()
  f.store.userNotes.insert({
    id: 'note',
    goalId: f.goal.id,
    notificationId: NotificationIdSchema.parse('notification_1'),
    at: 1,
    text: 'token=verysecret123',
  })
  await f.drafts.draftLesson(f.goal.id, 'completed')
  const prompt = f.generate.mock.calls[0]![0]
  expect(prompt).not.toContain('verysecret123')
  const facts = JSON.parse(prompt.slice(prompt.indexOf('{"goal":')))
  expect(Object.keys(facts)).toEqual(['goal', 'trigger', 'checkpoint', 'verification', 'failures', 'notes'])
  expect(facts).not.toHaveProperty('messages')
})
test('existing goal and notification events and future structured decision outcomes trigger drafts', async () => {
  const f = fixture()
  f.drafts.start()
  const g = f.store.goals.get(f.goal.id)!
  f.store.goals.update({ ...g, status: 'completed', version: g.version + 1 }, g.version)
  await vi.waitFor(() => expect(f.generate).toHaveBeenCalledTimes(1))
  f.store.notifications.insert({
    id: NotificationIdSchema.parse('notification_unknown'),
    kind: 'blocked',
    goalId: g.id,
    priority: 'high',
    channel: 'panel',
    createdAt: 1,
    dedupeKey: 'unknown',
    reason: 'verification-unknown',
  })
  await vi.waitFor(() => expect(f.generate).toHaveBeenCalledTimes(2))
  f.store.notificationChoices.insert({
    id: 'choice',
    goalId: g.id,
    notificationId: NotificationIdSchema.parse('notification_unknown'),
    suggestionId: 'choice',
    reason: 'test structured outcome',
    action: 'change-direction',
    source: 'panel',
    at: 1,
    result: 'succeeded',
  })
  await vi.waitFor(() => expect(f.generate).toHaveBeenCalledTimes(3))
  expect(lessonTrigger({ kind: 'choice', status: 'succeeded', action: 'free text 放弃' })).toBeUndefined()
})
async function consolidateFixture(start = false) {
  const f = fixture()
  if (start) f.drafts.start()
  for (let i = 0; i < 61; i++)
    f.memory.save({ kind: 'personal' }, 'preference', `偏好 ${i}`, { via: 'panel' })
  f.generate.mockImplementation(async (prompt) => {
    const rows = JSON.parse(prompt.slice(prompt.lastIndexOf('\n') + 1)) as { id: string }[]
    return JSON.stringify({
      proposals: [{ kind: 'preference', text: '合并后的偏好', replaces: rows.slice(0, 2).map((r) => r.id) }],
    })
  })
  return f
}
test('61 memories produce proposals only; two UI confirmations settle once and archive reviewed sources', async () => {
  const f = await consolidateFixture()
  expect(await f.drafts.consolidate({ kind: 'personal' })).toEqual({ status: 'pending' })
  expect(f.store.memories.list()).toHaveLength(61)
  const p = f.drafts.list()[0]!
  expect(p.replaces).toHaveLength(2)
  expect(p.replaces.every((ref) => !!ref.text)).toBe(true)
  const results = await Promise.all([
    Promise.resolve().then(() => f.drafts.resolve(p.id, 'confirm', undefined, 'panel')),
    Promise.resolve().then(() => f.drafts.resolve(p.id, 'confirm', undefined, 'inbox')),
  ])
  expect(results[0]?.memoryId).toBe(results[1]?.memoryId)
  expect(f.store.memories.list()).toHaveLength(60)
  expect(f.store.memories.list(undefined, { includeArchived: true })).toHaveLength(62)
  expect(f.store.memories.get(results[0]!.memoryId!)?.supersedes).toBe(p.replaces[0]?.id)
})
test('expired, stale and invalid custom confirmations never mutate memories; stale draft can be rejected', async () => {
  const f = await consolidateFixture()
  await f.drafts.consolidate({ kind: 'personal' })
  const p = f.drafts.list()[0]!,
    old = f.store.memories.get(p.replaces[0]!.id)!
  expect(() => f.drafts.resolve(p.id, 'confirm', 'password=verysecret')).toThrow()
  expect(f.store.memories.list()).toHaveLength(61)
  f.memory.update(old.id, old.version, { text: 'new value' })
  expect(() => f.drafts.resolve(p.id, 'confirm')).toThrow('stale-version')
  expect(f.store.memories.list()).toHaveLength(61)
  expect(f.drafts.resolve(p.id, 'decline').status).toBe('declined')
  await f.drafts.consolidate({ kind: 'personal' })
  const next = f.drafts.list()[0]!
  f.advance(8 * 86400000)
  expect(f.drafts.resolve(next.id, 'confirm').status).toBe('expired')
  expect(f.store.memories.list()).toHaveLength(61)
})
test('P04 muted policy defers proposal delivery and persistent attempt prevents a second dispatch', async () => {
  const f = fixture()
  await f.drafts.draftLesson(f.goal.id, 'completed')
  f.store.setNotificationPreferences({ muted: true, maxPerHour: 4 })
  await f.drafts.deliver()
  expect(f.inbox.ask).not.toHaveBeenCalled()
  f.store.setNotificationPreferences({ muted: false, maxPerHour: 4 })
  await f.drafts.deliver()
  expect(f.inbox.ask).toHaveBeenCalledTimes(1)
  await f.drafts.deliver()
  expect(f.inbox.ask).toHaveBeenCalledTimes(1)
  expect(f.store.memoryProposals.list()[0]?.notifiedAt).toBeDefined()
  expect(f.store.memories.list()).toHaveLength(0)
  expect(
    decideDelivery(
      { id: 'new', kind: 'decision', goalId: f.goal.id, dedupeKey: 'new' },
      {
        now: f.memory.now(),
        localMinutes: 0,
        nextQuietEnd: f.memory.now() + 60000,
        preferences: { muted: false, maxPerHour: 1 },
        recent: notificationDeliveryHistory(f.store),
        history: [],
      },
    ).reason,
  ).toBe('hourly-limit')
})

test('crossing 60 starts one consolidation without mutating confirmed memories or polling a model', async () => {
  const f = await consolidateFixture(true)
  await vi.waitFor(() => expect(f.drafts.list()).toHaveLength(1))
  expect(f.generate).toHaveBeenCalledTimes(1)
  expect(f.store.memories.list()).toHaveLength(61)
  f.store.setPaused(true)
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(f.generate).toHaveBeenCalledTimes(1)
})
test('v6 to v7 preserves confirmed memory row bytes while adding the proposal ledger', () => {
  const f = fixture(),
    row = f.memory.save({ kind: 'personal' }, 'fact', 'old confirmed content', { via: 'panel' })
  const dir = mkdtempSync(join(tmpdir(), 'p12-v6-'))
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }))
  const old = new WhaleStore(dir, { log: vi.fn(), migrations: MIGRATIONS.slice(0, 6) })
  old.memories.insert(row)
  old.close()
  const read = () => {
    const db = new DatabaseSync(join(dir, 'whaledot.db'))
    try {
      return db.prepare('SELECT * FROM memories').all()
    } finally {
      db.close()
    }
  }
  const before = read(),
    upgraded = new WhaleStore(dir, { log: vi.fn() })
  cleanup.push(() => upgraded.close())
  expect(upgraded.status().state).toBe('ok')
  expect(read()).toEqual(before)
  expect(upgraded.memoryProposals.list()).toEqual([])
})
