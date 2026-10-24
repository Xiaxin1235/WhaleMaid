import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, test, vi } from 'vitest'
import { WhaleStore } from '../store/index.js'
import { MIGRATIONS } from '../store/migrations.js'
import { CompanionMemory, MemoryProposeSchema } from './memory.js'
import type { MemoryDependencies, MemoryExecution } from './memory.js'
import { createPanelHandler } from '../panel-api/index.js'
import type { PanelRuntime } from '../panel-api/index.js'
import type { PeerScope } from '@deepseek-ai/dsh-client-connection'
import { ToolGate } from '../execution/tool-gate.js'
import { RunRegistry } from '../execution/registry.js'
const clean: (() => void)[] = []
afterEach(() => {
  for (const f of clean.splice(0).reverse()) f()
})
function fixture(ask?: MemoryDependencies['ask']) {
  const dir = mkdtempSync(join(tmpdir(), 'p12-memory-'))
  clean.push(() => rmSync(dir, { recursive: true, force: true }))
  const store = new WhaleStore(dir, { log: vi.fn() })
  clean.push(() => store.close())
  const settings = { enabled: true, suggest: true, maxChars: 2000, draftProjectLessons: false }
  const actor = {
    agent: { session: { id: 'companion' } },
    signal: new AbortController().signal,
  } as MemoryExecution
  const askFn = vi.fn<MemoryDependencies['ask']>(
    ask ?? (async (_agent, q) => ({ answers: [{ id: q.id, selected: ['记住'] }] })),
  )
  const memory = new CompanionMemory(store, {
    settings: () => settings,
    locale: () => 'zh-CN',
    owns: (id) => id === 'companion',
    ask: askFn,
    now: () => 1000,
    timeoutMs: 10,
  })
  return { store, memory, actor, settings, askFn, dir }
}
const input = { scope: 'personal', kind: 'preference', text: '叫我阿星' }
test('memory tool gate rejects ordinary and execution identities, including inherited calls', async () => {
  const f = fixture()
  f.store.setCompanionSession({ sessionId: 'companion', createdAt: 1, previous: [] })
  const gate = new ToolGate(new RunRegistry(f.store), () => 'en'),
    next = vi.fn(async () => ({ kind: 'allow' as const }))
  for (const name of ['whaledot_memory_list', 'whaledot_memory_propose', 'whaledot_memory_forget']) {
    expect(await gate.check({ name, arguments: {}, agent: { session: { id: 'companion' } } }, next)).toEqual({
      kind: 'allow',
    })
    for (const id of ['ordinary', 'execution'])
      expect(await gate.check({ name, arguments: {}, agent: { session: { id } } }, next)).toMatchObject({
        kind: 'deny',
      })
  }
  expect(next).toHaveBeenCalledTimes(3)
})
test('confirmation cannot overwrite a newer version or survive a memory disable', async () => {
  const f = fixture()
  const old = f.memory.save({ kind: 'personal' }, 'preference', 'old', { via: 'panel' })
  f.askFn.mockImplementation(async (_a, q) => {
    f.memory.update(old.id, old.version, { text: 'newer' })
    return { answers: [{ id: q.id, selected: ['记住'] }] }
  })
  expect(await f.memory.propose({ ...input, replaces: old.id }, f.actor)).toMatchObject({
    status: 'rejected:stale-version',
  })
  expect(f.store.memories.list().map((m) => m.text)).toEqual(['newer'])
  f.askFn.mockImplementation(async (_a, q) => {
    f.settings.enabled = false
    return { answers: [{ id: q.id, selected: ['记住'] }] }
  })
  expect(await f.memory.propose(input, f.actor)).toEqual({ status: 'declined' })
  expect(f.store.memories.list()).toHaveLength(1)
})
test('only same companion agent human answer can save; model consent arguments cannot', async () => {
  const f = fixture()
  expect(MemoryProposeSchema.safeParse({ ...input, confirmed: true }).success).toBe(false)
  expect(await f.memory.propose(input, f.actor)).toMatchObject({ status: 'saved' })
  expect(f.askFn.mock.calls[0]?.[0]).toBe(f.actor.agent)
  expect(f.store.memories.list()[0]?.text).toBe('叫我阿星')
  expect(f.memory.block()).toContain('叫我阿星')
  await expect(
    f.memory.propose(input, { ...f.actor, agent: { session: { id: 'ordinary' } } } as MemoryExecution),
  ).rejects.toThrow('companion-only')
})
test.each(['decline', 'cancel', 'timeout', 'abort'] as const)('%s never writes', async (kind) => {
  const f = fixture(async (_a, q, signal) => {
    if (kind === 'decline') return { answers: [{ id: q.id, selected: ['不用记'] }] }
    if (kind === 'cancel') throw Error('ASK_ABORTED')
    return new Promise((_, reject) =>
      signal.addEventListener('abort', () => reject(Error('aborted')), { once: true }),
    )
  })
  const controller = new AbortController()
  const pending = f.memory.propose(input, { ...f.actor, signal: controller.signal })
  if (kind === 'abort') controller.abort()
  expect(await pending).toEqual({ status: 'declined' })
  expect(f.store.memories.list()).toEqual([])
})
test('custom text is independently validated and replacement is atomic against reviewed version', async () => {
  const f = fixture(async (_a, q) => ({ answers: [{ id: q.id, selected: [], custom: '叫我阿月' }] }))
  expect(await f.memory.propose(input, f.actor)).toMatchObject({ status: 'edited-and-saved' })
  const old = f.store.memories.list()[0]!
  expect(old.text).toBe('叫我阿月')
  expect(await f.memory.propose({ ...input, replaces: old.id }, f.actor)).toMatchObject({
    status: 'edited-and-saved',
  })
  expect(f.store.memories.get(old.id)?.status).toBe('archived')
  const bad = fixture(async (_a, q) => ({
    answers: [{ id: q.id, selected: [], custom: 'sk-test1234567890abcdefghijkl' }],
  }))
  expect(await bad.memory.propose(input, bad.actor)).toMatchObject({ status: 'rejected:contains-secret' })
  expect(bad.store.memories.list()).toHaveLength(0)
})
test('forget archives only; disabled tools cannot save, list or inject memory', async () => {
  const f = fixture()
  await f.memory.propose(input, f.actor)
  const row = f.store.memories.list()[0]!
  f.askFn.mockImplementation(async (_a, q) => ({ answers: [{ id: q.id, selected: ['忘掉'] }] }))
  expect(await f.memory.forget({ id: row.id }, f.actor)).toEqual({ status: 'saved' })
  expect(f.store.memories.get(row.id)?.status).toBe('archived')
  f.settings.enabled = false
  expect(f.memory.block()).toBe('')
  expect(f.memory.list({ scope: 'personal' }, f.actor)).toMatchObject({ disabled: true })
  expect(await f.memory.propose(input, f.actor)).toMatchObject({ status: 'rejected:disabled' })
})
test('v6 migration preserves v5 old table bytes, scope index and optimistic versioning survive restart', () => {
  const dir = mkdtempSync(join(tmpdir(), 'p12-v5-'))
  clean.push(() => rmSync(dir, { recursive: true, force: true }))
  const old = new WhaleStore(dir, { log: vi.fn(), migrations: MIGRATIONS.slice(0, 5) })
  old.setPaused(false)
  old.close()
  const db = new DatabaseSync(join(dir, 'whaledot.db'))
  const before = db.prepare('SELECT * FROM kv_settings').all()
  db.close()
  const store = new WhaleStore(dir, { log: vi.fn() })
  clean.push(() => store.close())
  const f = fixture()
  const row = f.memory.save({ kind: 'personal' }, 'fact', '阿星', { via: 'panel' })
  store.memories.insert(row)
  expect(store.memories.list('personal')).toHaveLength(1)
  expect(store.memories.list('project:d:\\x')).toHaveLength(0)
  store.memories.update({ ...row, text: '阿月', version: 2 }, 1)
  expect(() => store.memories.update({ ...row, version: 2 }, 1)).toThrow('stale-version')
  const check = new DatabaseSync(join(dir, 'whaledot.db'))
  expect(check.prepare('SELECT * FROM kv_settings').all()).toEqual(before)
  check.close()
  store.memories.delete(row.id)
  expect(store.memories.get(row.id)).toBeUndefined()
})
test('owner panel editing validates versions, archives/restores/deletes and export is authenticated', async () => {
  const f = fixture()
  const row = f.memory.save({ kind: 'personal' }, 'fact', '阿星', { via: 'companion' })
  const handler = createPanelHandler({ memory: f.memory } as PanelRuntime),
    signal = new AbortController().signal
  const peer = { principal: { kind: 'owner' }, signal } as PeerScope
  expect(await handler('memories-export', { format: 'json' }, signal, undefined as never)).toMatchObject({
    ok: false,
  })
  expect(
    await handler('memory-update', { id: row.id, version: 1, text: '阿月' }, signal, peer),
  ).toMatchObject({ ok: true, value: { source: { via: 'panel' }, text: '阿月' } })
  expect(
    await handler('memory-update', { id: row.id, version: 1, text: 'stale' }, signal, peer),
  ).toMatchObject({ ok: false, error: { code: 'whaledot/stale-version' } })
  expect(
    await handler('memory-delete', { id: row.id, version: 2, confirm: false }, signal, peer),
  ).toMatchObject({ ok: false })
  expect(
    await handler('memory-delete', { id: row.id, version: 2, confirm: true }, signal, peer),
  ).toMatchObject({ ok: true })
  expect(f.memory.block()).toBe('')
})
