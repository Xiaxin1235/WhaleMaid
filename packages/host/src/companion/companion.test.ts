import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { PeerScope } from '@deepseek-ai/dsh-client-connection'
import { REDACTED } from '@whaledot/core'
import type { NotificationFacts } from '@whaledot/core'
import { makeGoal, makeTask } from '../../../core/tests/fixtures.js'
import { WhaleStore, productionClock, productionIdGen, sha256 } from '../store/index.js'
import { ScopeService } from '../scope-service.js'
import { RunRegistry } from '../execution/registry.js'
import { ToolGate } from '../execution/tool-gate.js'
import { CompanionService, COMPANION_PRESET, localTime } from './service.js'
import type { CompanionSettings } from './service.js'
import { CompanionSessionManager } from './session.js'
import type { CompanionHost } from './session.js'
import { COMPANION_TOOL_NAMES, companionTools } from './tools.js'

const cleanup: (() => Promise<void> | void)[] = []
afterEach(async () => {
  for (const f of cleanup.splice(0).reverse()) await f()
})
const owner = { principal: { kind: 'owner' }, signal: new AbortController().signal } as PeerScope

type Ev = { type: string; seq: number; data: unknown }
const user = (seq: number, text: string): Ev => ({
  type: 'user/message',
  seq,
  data: { content: [{ type: 'text', text }] },
})
const title = (seq: number, value: string): Ev => ({ type: 'session/title', seq, data: { title: value } })

async function setup(settings: Partial<CompanionSettings> = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'whaledot-companion-'))
  cleanup.push(() => rm(dir, { recursive: true, force: true }))
  const store = new WhaleStore(dir, { log: vi.fn() })
  cleanup.push(() => store.close())
  const goal = makeGoal({ projectRoot: dir, title: '让测试全部通过' })
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
      allowedActions: ['read-file', 'write-file'],
      forbiddenActions: [],
      verifyCommands: ['pnpm test'],
      permissionPreset: 'workspace-write',
    },
    owner,
  )
  store.tasks.insert(makeTask('task_1', { title: '分析失败原因' }))
  const sessions: Record<string, { updatedAt: number; running?: boolean; events: Ev[]; blank?: boolean }> = {
    s_work: { updatedAt: 3000, events: [title(0, '修 README'), user(1, 'key sk-test1234567890abcdefXYZ')] },
    s_other: { updatedAt: 2000, running: true, events: [title(0, '私密项目'), user(1, 'secret plans')] },
    s_whaledot: { updatedAt: 1500, events: [title(0, '[WhaleDot] 让测试全部通过')] },
    s_companion: { updatedAt: 1000, events: [title(0, '大肥鱼')] },
    s_blank: { updatedAt: 900, blank: true, events: [] },
  }
  const notFound = Object.assign(new Error('missing'), { name: 'ApiSessionNotFound' })
  const controller = {
    list: vi.fn(async () => ({
      items: Object.entries(sessions).map(([sessionId, s]) => ({
        sessionId,
        updatedAt: s.updatedAt,
        running: !!s.running,
        blank: !!s.blank,
        agentAvailable: false,
      })),
    })),
    inspect: vi.fn(async (id: string) => {
      const s = sessions[id]
      if (!s) throw notFound
      return { meta: { id }, inheritedEventCount: 0, events: s.events }
    }),
  }
  const ctx = {
    get: (key: string) => (key === 'sessionController' ? controller : undefined),
  } as unknown as Context
  const full: CompanionSettings = {
    shareSessionTitles: true,
    readSessionContent: true,
    excludedSessions: [],
    ...settings,
  }
  const service = new CompanionService(ctx, store, {
    locale: () => 'zh-CN',
    settings: () => full,
    facts: (): NotificationFacts => ({ goalTitle: goal.title }),
    companionSessionId: () => 's_companion',
    ownedSessions: () => new Set(['s_whaledot']),
    log: vi.fn(),
  })
  return { dir, store, goal, service, controller, settings: full }
}

describe('companion read model', () => {
  test('persona follows the locale file, a custom path, and never leaks prompt variable syntax', async () => {
    const f = await setup()
    await f.service.loadPersona()
    expect(f.service.persona()).toContain('大肥鱼')
    const custom = join(f.dir, 'persona.md')
    await writeFile(custom, '我是自定义的鲸鱼 {{model}}')
    f.settings.personaPath = custom
    await f.service.loadPersona()
    expect(f.service.persona()).toBe('我是自定义的鲸鱼 { {model}}')
    f.settings.personaPath = join(f.dir, 'missing.md')
    await f.service.loadPersona()
    expect(f.service.persona()).toContain('大肥鱼')
  })

  test('goal overview and detail report stored facts only', async () => {
    const f = await setup()
    expect(f.service.goalsOverview()).toEqual([
      expect.objectContaining({ title: '让测试全部通过', tasksDone: 0, tasksTotal: 1, pendingDecisions: 0 }),
    ])
    const detail = f.service.goalDetail(f.goal.id)!
    expect(detail.scope).toEqual({
      permission: 'workspace-write',
      allowedPaths: [f.dir],
      verifyCommands: ['pnpm test'],
    })
    expect(detail.tasks).toEqual([{ title: '分析失败原因', kind: 'edit', state: 'PENDING' }])
    expect(f.service.goalDetail('让测试全部通过')?.id).toBe(f.goal.id)
    expect(f.service.goalDetail('nope')).toBeUndefined()
  })

  test('recent sessions hide WhaleDot, companion, blank and excluded sessions', async () => {
    const f = await setup({ excludedSessions: ['私密'] })
    const recent = await f.service.recentSessions()
    expect(recent).toEqual({
      titlesShared: true,
      sessions: [{ id: 's_work', title: '修 README', status: 'idle', lastActive: localTime(3000) }],
    })
  })

  test('without title sharing only counts are returned', async () => {
    const f = await setup({ shareSessionTitles: false })
    // WhaleDot-owned, companion and blank sessions are excluded from the counts too.
    expect(await f.service.recentSessions()).toEqual({ titlesShared: false, total: 2, running: 1, idle: 1 })
    expect(f.controller.inspect).not.toHaveBeenCalled()
    // Reading a session by id must not reveal its title either.
    const read = await f.service.readSession('s_work')
    expect(read.ok).toBe(true)
    expect(read).not.toHaveProperty('title')
  })

  test('reading a session redacts secrets and refuses hidden, excluded or disabled cases', async () => {
    const f = await setup({ excludedSessions: ['s_other'] })
    const read = await f.service.readSession('s_work')
    expect(read).toMatchObject({ ok: true, title: '修 README' })
    expect(JSON.stringify(read)).toContain(REDACTED)
    expect(JSON.stringify(read)).not.toContain('sk-test1234567890')
    for (const id of ['s_other', 's_whaledot', 's_companion'])
      expect(await f.service.readSession(id)).toEqual({ ok: false, reason: 'session-not-readable' })
    expect(await f.service.readSession('ghost')).toEqual({ ok: false, reason: 'session-not-found' })
    f.settings.readSessionContent = false
    expect(await f.service.readSession('s_work')).toEqual({
      ok: false,
      reason: 'reading-session-content-disabled',
    })
  })
})

describe('companion tools', () => {
  test('exposes exactly the read-only tools and validates arguments', async () => {
    const f = await setup()
    const tools = companionTools(f.service)
    expect(tools.map((t) => t.name)).toEqual([...COMPANION_TOOL_NAMES])
    const exec = { signal: new AbortController().signal } as Parameters<(typeof tools)[number]['execute']>[1]
    const detail = tools.find((t) => t.name === 'whaledot_goal_detail')!
    await expect(detail.execute({}, exec)).rejects.toThrow('Invalid arguments')
    await expect(detail.execute({ goal: f.goal.id, extra: 1 }, exec)).rejects.toThrow('Invalid arguments')
    expect(JSON.parse((await detail.execute({ goal: f.goal.id }, exec)) as string).title).toBe(
      '让测试全部通过',
    )
    const read = tools.find((t) => t.name === 'read_session')!
    expect((await read.execute({ sessionId: 's_work' }, exec)) as string).toContain(REDACTED)
    expect(read.output.render({}, 'x')).toEqual([{ type: 'text', text: 'x' }])
  })
})

describe('companion session lifecycle', () => {
  function fakeHost(existing = new Set<string>()) {
    const host: CompanionHost & { created: string[] } = {
      created: [],
      exists: vi.fn(async (id: string) => existing.has(id)),
      create: vi.fn(async (id: string) => {
        host.created.push(id)
        existing.add(id)
        return id
      }),
      pinReadOnly: vi.fn(),
    }
    return { host, existing }
  }

  test('creates once, reuses after restart, recreates when deleted and keeps old ownership', async () => {
    const f = await setup()
    const { host, existing } = fakeHost()
    const options = { dataDir: f.dir, enabled: () => true, title: () => '大肥鱼', log: vi.fn() }
    const first = new CompanionSessionManager(f.store, host, options)
    const a = await first.ensure()
    expect(a.state).toBe('ready')
    const restarted = new CompanionSessionManager(f.store, host, options)
    expect(await restarted.ensure()).toEqual(a)
    expect(host.created).toHaveLength(1)
    existing.clear()
    const b = await restarted.ensure()
    expect(b.state === 'ready' && a.state === 'ready' && b.sessionId !== a.sessionId).toBe(true)
    expect(restarted.allSessionIds()).toHaveLength(2)
    const registry = new RunRegistry(f.store)
    if (a.state === 'ready') expect(registry.isCompanion(a.sessionId)).toBe(true)
  })

  test('rebuild starts a fresh session; failures and disabled settings degrade without throwing', async () => {
    const f = await setup()
    const { host } = fakeHost()
    let enabled = true
    const manager = new CompanionSessionManager(f.store, host, {
      dataDir: f.dir,
      enabled: () => enabled,
      title: () => '大肥鱼',
      log: vi.fn(),
    })
    await manager.ensure()
    await manager.rebuild()
    expect(host.created).toHaveLength(2)
    vi.mocked(host.create).mockRejectedValueOnce(new Error('boom'))
    expect(await manager.rebuild()).toEqual({ state: 'error', message: 'boom' })
    enabled = false
    expect(manager.status()).toEqual({ state: 'disabled' })
    expect(await manager.ensure()).toEqual({ state: 'disabled' })
  })
})

describe('companion gate', () => {
  test('only read-only WhaleDot tools and ask_user_question run in the companion session', async () => {
    const f = await setup()
    f.store.setCompanionSession({ sessionId: 's_companion', createdAt: 1, previous: ['s_old'] })
    const gate = new ToolGate(new RunRegistry(f.store), () => 'en')
    const next = vi.fn(async () => ({ kind: 'allow' as const }))
    const call = (name: string, id: string) =>
      gate.check({ name, arguments: {}, agent: { session: { id } } }, next)
    for (const name of [
      'whaledot_goals_overview',
      'read_session',
      'ask_user_question',
      'whaledot_recall_search',
    ])
      expect(await call(name, 's_companion')).toEqual({ kind: 'allow' })
    for (const name of ['read', 'write', 'bash', 'pwsh', 'web_fetch', 'subagent'])
      expect(await call(name, 's_companion')).toMatchObject({ kind: 'deny' })
    expect(await call('write', 's_old')).toMatchObject({ kind: 'deny' })
    expect(await call('write', 's_unrelated')).toEqual({ kind: 'allow' })
    expect(await call('whaledot_recall_search', 's_unrelated')).toMatchObject({ kind: 'deny' })
    expect(next).toHaveBeenCalledTimes(5)
  })

  test('the preset id is stable for the pet plugin to recognise', () => {
    expect(COMPANION_PRESET).toBe('whaledot-companion')
  })
})
