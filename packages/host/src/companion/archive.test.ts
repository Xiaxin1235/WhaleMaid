import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { CompanionArchives } from './archive.js'
import type { CompanionArchiveHost } from './archive.js'
import { CompanionSessionManager } from './session.js'
import { WhaleStore } from '../store/index.js'
import { RunRegistry } from '../execution/registry.js'
import { createPanelHandler } from '../panel-api/index.js'
import type { PanelRuntime } from '../panel-api/index.js'
import { exportTrace } from '../autopilot/trace.js'
import { makeGoal } from '../../../core/tests/fixtures.js'
import type { CompanionArchiveIdentity } from '@whaledot/core'
const clean: (() => unknown | Promise<unknown>)[] = []
afterEach(async () => {
  for (const f of clean.splice(0).reverse()) await f()
})
async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'whaledot-archive-'))
  clean.push(() => rm(dir, { recursive: true, force: true }))
  const store = new WhaleStore(dir, { log: vi.fn() })
  clean.push(() => store.close())
  store.setCompanionSession({
    sessionId: 'current',
    previous: ['old', 'ordinary', 'unknown', 'derived', 'wrong-cwd'],
    createdAt: 1,
  })
  const archived = new Set<string>(),
    calls: string[] = [],
    cwd = join(dir, 'companion')
  const identities: Record<string, CompanionArchiveIdentity> = {
    current: { agentPreset: 'whaledot-companion', cwd },
    old: { agentPreset: 'whaledot-companion', cwd },
    ordinary: { agentPreset: 'standard', cwd },
    unknown: { cwd },
    derived: { agentPreset: 'whaledot-companion', cwd, origin: 'subagent' },
    'wrong-cwd': { agentPreset: 'whaledot-companion', cwd: dir },
    unowned: { agentPreset: 'whaledot-companion', cwd },
  }
  const host: CompanionArchiveHost = {
    workspace: () => ({ path: cwd, sessionIds: Object.keys(identities) }),
    archived: () => [...archived],
    inspect: vi.fn(async (id) => identities[id] ?? {}),
    archive: vi.fn(async (id) => {
      calls.push('archive:' + id)
      archived.add(id)
    }),
    restore: vi.fn(async (id) => {
      calls.push('restore:' + id)
      archived.delete(id)
    }),
  }
  let enabled = true,
    n = 0
  const summarize = vi.fn(async (id: string) => {
    calls.push('recall:' + id)
  })
  const manager = new CompanionSessionManager(
    store,
    {
      exists: async () => true,
      create: async (id) => {
        identities[id] = { agentPreset: 'whaledot-companion', cwd }
        return id
      },
      pinReadOnly: () => {},
    },
    { dataDir: dir, enabled: () => true, title: () => '', log: vi.fn() },
  )
  const service = new CompanionArchives(store, host, {
    dataDir: dir,
    current: () => manager.sessionId(),
    owned: () => manager.allSessionIds(),
    enabled: () => enabled,
    summarize,
    log: vi.fn(),
    now: () => 100,
    id: () => `event-${++n}`,
  })
  clean.push(() => service.dispose())
  return {
    dir,
    store,
    manager,
    service,
    host,
    archived,
    calls,
    identities,
    summarize,
    setEnabled: (v: boolean) => {
      enabled = v
    },
  }
}
it('startup archives only proven earlier companions after P15 and never touches current or ordinary sessions', async () => {
  const s = await setup()
  await s.service.startup()
  expect(s.calls).toEqual(['recall:old', 'archive:old'])
  expect(s.service.view().items.map((i) => i.id)).toEqual(['old'])
  expect(s.archived.has('current')).toBe(false)
  expect(s.store.autopilotEvents.list()[0]).toMatchObject({
    actor: 'companion',
    action: 'archive-companion-session',
    sessionId: 'old',
    reason: 'succeeded',
  })
  await s.service.startup()
  expect(s.calls).toEqual(['recall:old', 'archive:old'])
  expect(s.store.autopilotEvents.list()).toHaveLength(1)
})
it('rotation archives the predecessor, leaves the new current unarchived and awaits the existing recall', async () => {
  const s = await setup()
  await s.manager.rebuild()
  await s.service.rotated('current')
  expect(s.calls).toEqual(['recall:current', 'archive:current'])
  expect(s.archived.has(s.manager.sessionId()!)).toBe(false)
})
it('disabled automatic archival preserves old state while restoring an archived current companion', async () => {
  const s = await setup()
  s.setEnabled(false)
  s.archived.add('current')
  s.archived.add('old')
  await s.service.startup()
  expect(s.calls).toEqual(['restore:current'])
  expect(s.archived.has('old')).toBe(true)
  expect(s.summarize).not.toHaveBeenCalled()
})
it('restore all and one are reversible, owner-only, confirmed and visible in exported trace', async () => {
  const s = await setup()
  await s.service.startup()
  const signal = new AbortController().signal
  const handler = createPanelHandler({ archives: s.service } as PanelRuntime),
    peer = { principal: { kind: 'owner' }, signal } as Parameters<typeof handler>[3]
  expect((await handler('companion-restore', {}, signal, peer)).ok).toBe(false)
  expect(
    (
      await handler('companion-restore', { confirm: true }, signal, {
        principal: { kind: 'remote' },
        signal,
      } as never)
    ).ok,
  ).toBe(false)
  expect(await handler('companion-restore', { confirm: true }, signal, peer)).toMatchObject({
    ok: true,
    value: { restored: 1, failed: 0 },
  })
  expect(s.archived.size).toBe(0)
  await s.service.rotated('old')
  expect(await s.service.restore('old')).toEqual({ restored: 1, failed: 0 })
  expect(await s.service.restore('unowned')).toEqual({ restored: 0, failed: 0 })
  const goal = makeGoal()
  s.store.goals.insert(goal)
  const trace = exportTrace(s.store, goal.id).markdown
  expect(trace).toContain('archive-companion-session')
  expect(trace).toContain('restore-companion-session')
  expect(trace).toContain('"actor": "companion"')
})
it('archived ownership remains gated after it leaves the recent twenty-session record', async () => {
  const s = await setup()
  await s.service.startup()
  s.store.setCompanionSession({ sessionId: 'newest', createdAt: 200, previous: [] })
  expect(s.manager.allSessionIds()).toContain('old')
  expect(new RunRegistry(s.store).isCompanion('old')).toBe(true)
})
it('rechecks identity and currentness after waiting for recall', async () => {
  const s = await setup()
  s.summarize.mockImplementationOnce(async () => {
    s.identities.old = { agentPreset: 'standard', cwd: join(s.dir, 'companion') }
  })
  await s.service.rotated('old')
  expect(s.archived.size).toBe(0)
})
it('unavailable/failed archive APIs never turn a successfully created new companion into an error', async () => {
  const s = await setup()
  vi.mocked(s.host.archive).mockRejectedValue(Error('active turn or unavailable'))
  const manager = new CompanionSessionManager(
    s.store,
    {
      exists: async () => true,
      create: async (id) => {
        s.identities[id] = { agentPreset: 'whaledot-companion', cwd: join(s.dir, 'companion') }
        return id
      },
      pinReadOnly: () => {},
    },
    {
      dataDir: s.dir,
      enabled: () => true,
      title: () => '',
      log: vi.fn(),
      afterReady: async (old) => s.service.rotated(old),
    },
  )
  expect((await manager.rebuild()).state).toBe('ready')
  expect(s.store.autopilotEvents.list()).toHaveLength(0)
  s.host.workspace = () => {
    throw Error('service unavailable')
  }
  expect((await manager.rebuild()).state).toBe('ready')
})
