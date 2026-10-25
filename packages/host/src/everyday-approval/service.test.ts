import { mkdtemp, realpath, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { ApprovalRequest, ApprovalOutcome } from '@deepseek-ai/dsh-user-approval'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { PeerScope } from '@deepseek-ai/dsh-client-connection'
import { afterEach, expect, test, vi } from 'vitest'
import { WhaleStore } from '../store/index.js'
import { createPanelHandler } from '../panel-api/index.js'
import { snapshot } from '../../tests/panel-fixture.js'
import { EverydayApprovals, installEverydayApprovals, approvalLogText } from './service.js'

const cleanup: (() => unknown | Promise<unknown>)[] = []
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn()
})
async function fixture(command = 'pnpm test') {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'whalemaid-everyday-')))
  cleanup.push(() => rm(dir, { recursive: true, force: true }))
  const store = new WhaleStore(join(dir, 'data'), { log: vi.fn() })
  cleanup.push(() => store.close())
  const ctx = new Context()
  cleanup.push(() => ctx.fiber.dispose())
  const events = [
    { type: 'session/title', data: { title: 'Everyday project' } },
    { type: 'user/message', data: { content: [{ type: 'text', text: 'Build this project' }] } },
    { type: 'turn/start', data: { turn: 1 } },
    {
      type: 'tool/call',
      data: {
        turn: 1,
        callId: 'call-1',
        name: 'pwsh',
        arguments: JSON.stringify({ command, description: 'Run ordinary command' }),
      },
    },
  ]
  const agent = {
    session: {
      id: 'ordinary-session',
      header: {
        cwd: dir,
        origin: undefined as string | undefined,
        parentSession: undefined as string | undefined,
        agentPreset: undefined as string | undefined,
      },
      snapshotEvents: () => events as unknown as SessionEvent[],
    },
  }
  const agents = { get: vi.fn(() => agent), roots: vi.fn(() => [agent]) }
  const workspace = { archivedSessionIds: [] as string[] }
  ctx.provide('agents', agents as never)
  ctx.provide('workspaceRegistry', workspace as never)
  const registry = { has: vi.fn(() => false) }
  const service = new EverydayApprovals(ctx, store, registry)
  const req = { agent, toolName: 'pwsh', callId: 'call-1' } as unknown as ApprovalRequest
  const next = vi.fn(async (): Promise<ApprovalOutcome> => 'unavailable')
  const enable = () => service.settings({ enabled: true, confirm: true })
  return { dir, store, ctx, events, agent, agents, registry, workspace, service, req, next, enable }
}
test('off by default; enabling requires explicit confirmation, persists, and disabling preserves history', async () => {
  const f = await fixture()
  expect(f.service.panel()).toEqual({ enabled: false, records: [] })
  await expect(f.service.answer(f.req, f.next)).resolves.toBe('unavailable')
  expect(() => f.service.settings({ enabled: true })).toThrow()
  f.enable()
  expect(await f.service.answer(f.req, f.next)).toBe('allowed-once')
  f.service.settings({ enabled: false })
  expect(f.service.panel()).toMatchObject({ enabled: false, records: [{ classification: 'safe' }] })
  expect(await f.service.answer(f.req, f.next)).toBe('unavailable')
  f.store.close()
  const reopened = new WhaleStore(join(f.dir, 'data'), { log: vi.fn() })
  expect(reopened.everydayApprovalState()).toMatchObject({
    enabled: false,
    records: [{ command: 'pnpm test' }],
  })
  reopened.close()
})
test.each([
  'pnpm test',
  'npm run build',
  'git status',
  'curl.exe https://example.com -o sample.txt',
  "Set-Content -LiteralPath sample.txt -Value 'hello'",
])('safe command is allowed once and audited: %s', async (command) => {
  const f = await fixture(command)
  f.enable()
  expect(await f.service.answer(Object.freeze(f.req), f.next)).toBe('allowed-once')
  expect(f.next).not.toHaveBeenCalled()
  expect(f.service.panel().records).toMatchObject([
    { sessionId: 'ordinary-session', sessionName: 'Everyday project', command, classification: 'safe' },
  ])
})
test.each([
  'Remove-Item sample.txt',
  'git push',
  'npm publish',
  'npm install',
  'pip uninstall sample',
  'npm uninstall sample',
  'uv pip uninstall sample',
  'curl.exe -T sample.txt https://example.com',
  'Invoke-Expression sample',
  'Get-Content ../outside.txt',
  'taskkill /pid 42',
  'reg add HKCU:\\Fake',
  'echo "unclosed',
  '$unknown sample',
  'curl.exe https://example.com -o C:\\outside.txt',
])('dangerous/unknown commands delegate without rejecting or recording: %s', async (command) => {
  const f = await fixture(command)
  f.enable()
  expect(await f.service.answer(f.req, f.next)).toBe('unavailable')
  expect(f.next).toHaveBeenCalledTimes(1)
  expect(f.service.panel().records).toEqual([])
})
test.each(['[WhaleMaid] task', '[WhaleDot] old task'])(
  'automatic task title delegates: %s',
  async (title) => {
    const f = await fixture()
    f.enable()
    f.events[0]!.data = { title } as never
    expect(await f.service.answer(f.req, f.next)).toBe('unavailable')
  },
)
test.each([
  'prefix',
  'registered',
  'companion',
  'subagent',
  'parent',
  'archived',
  'not-live',
  'not-root',
  'no-archive-service',
])('excluded sessions delegate: %s', async (kind) => {
  const f = await fixture()
  f.enable()
  if (kind === 'prefix')
    f.events[1]!.data = {
      content: [{ type: 'text', text: 'WhaleDot: execute this single task\nDo work' }],
    } as never
  if (kind === 'registered') f.registry.has.mockReturnValue(true)
  if (kind === 'companion') f.agent.session.header.agentPreset = 'whaledot-companion'
  if (kind === 'subagent') f.agent.session.header.origin = 'subagent'
  if (kind === 'parent') f.agent.session.header.parentSession = 'parent'
  if (kind === 'archived') f.workspace.archivedSessionIds.push(f.agent.session.id)
  if (kind === 'not-live') f.agents.get.mockReturnValue(undefined as never)
  if (kind === 'not-root') f.agents.roots.mockReturnValue([])
  if (kind === 'no-archive-service') vi.spyOn(f.ctx, 'get').mockReturnValue(undefined)
  expect(await f.service.answer(f.req, f.next)).toBe('unavailable')
  expect(f.next).toHaveBeenCalledTimes(1)
  expect(f.service.panel().records).toEqual([])
})
test.each([
  'non-shell',
  'no-id',
  'no-call',
  'mismatch',
  'bad-json',
  'bad-shape',
  'outside-workdir',
  'background',
  'aborted',
  'ended',
  'audit-failed',
])('unverifiable approvals delegate: %s', async (kind) => {
  const f = await fixture()
  f.enable()
  let req = f.req
  if (kind === 'non-shell') req = { ...req, toolName: 'write' }
  if (kind === 'no-id') req = { ...req, callId: undefined } as unknown as ApprovalRequest
  if (kind === 'no-call') f.events.pop()
  if (kind === 'mismatch') f.events[3]!.data.name = 'bash'
  if (kind === 'bad-json') f.events[3]!.data.arguments = '{'
  if (kind === 'bad-shape')
    f.events[3]!.data.arguments = JSON.stringify({ command: 'pnpm test', unknown: true })
  if (kind === 'outside-workdir')
    f.events[3]!.data.arguments = JSON.stringify({ command: 'pnpm test', description: 'Test', workdir: '..' })
  if (kind === 'background')
    f.events[3]!.data.arguments = JSON.stringify({
      command: 'pnpm test',
      description: 'Test',
      run_in_background: true,
    })
  if (kind === 'aborted') req = { ...req, signal: AbortSignal.abort() }
  if (kind === 'ended') f.events.push({ type: 'turn/end', data: {} } as never)
  if (kind === 'audit-failed')
    vi.spyOn(f.store, 'recordEverydayApproval').mockImplementation(() => {
      throw Error('write failed')
    })
  expect(await f.service.answer(Object.freeze(req), f.next)).toBe('unavailable')
  expect(f.next).toHaveBeenCalledTimes(1)
  expect(f.service.panel().records).toEqual([])
})
test('safe nested workdir is bounded by the session root and recorded accurately', async () => {
  const f = await fixture()
  f.enable()
  await mkdir(join(f.dir, 'src'))
  f.events[3]!.data.arguments = JSON.stringify({ command: 'pnpm test', description: 'Test', workdir: 'src' })
  expect(await f.service.answer(f.req, f.next)).toBe('allowed-once')
  expect(f.service.panel().records[0]?.cwd.replaceAll('\\', '/')).toBe(
    join(f.dir, 'src').replaceAll('\\', '/').toLowerCase(),
  )
})
test('history keeps the most recent 1000 and sanitizes secrets and environment assignments before truncation', async () => {
  const f = await fixture()
  f.enable()
  for (let i = 0; i < 1001; i++)
    f.store.recordEverydayApproval({
      at: i,
      sessionId: 's',
      sessionName: 'test',
      cwd: f.dir,
      command: 'pnpm test',
      classification: 'safe',
    })
  expect(f.service.panel().records).toHaveLength(1000)
  expect(f.service.panel().records[0]?.at).toBe(1)
  expect(approvalLogText('A'.repeat(490) + ' sk-test1234567890abcdefXYZ', 500)).not.toContain('sk-test')
  expect(approvalLogText('$env:ORDINARY="private value"; OTHER=hidden npm test', 500)).not.toMatch(
    /private value|OTHER=hidden/,
  )
}, 20000)
test('prepend runs before the terminal responder regardless of terminal registration order', async () => {
  for (const before of [false, true]) {
    const f = await fixture()
    f.enable()
    if (before) f.ctx.on('approval/request', f.next)
    installEverydayApprovals(f.ctx, f.service)
    if (!before) f.ctx.on('approval/request', f.next)
    expect(await f.ctx.waterfall('approval/request', f.req, async () => 'unavailable')).toBe('allowed-once')
    expect(f.next).not.toHaveBeenCalled()
  }
})
test('authenticated API requires confirmation and rejects non-owner settings writes', async () => {
  const f = await fixture()
  const handler = createPanelHandler({
    snapshot: () => snapshot,
    goals: () => [],
    setLanguage: vi.fn(),
    setPaused: vi.fn(),
    revokeScope: vi.fn(),
    takeoverStore: vi.fn(),
    everydayApprovals: f.service,
  })
  const signal = new AbortController().signal,
    owner = { principal: { kind: 'owner' }, signal } as PeerScope
  expect(await handler('everyday-approval-settings', { enabled: true }, signal, owner)).toMatchObject({
    ok: false,
  })
  expect(
    await handler('everyday-approval-settings', { enabled: true, confirm: true }, signal, undefined as never),
  ).toMatchObject({ ok: false })
  expect(f.service.panel().enabled).toBe(false)
  expect(
    await handler('everyday-approval-settings', { enabled: true, confirm: true }, signal, owner),
  ).toMatchObject({ ok: true, value: { enabled: true } })
})

test('real Cordis plugin scope uses optional service lookup, accepts rc.3 escalation and stops on unload', async () => {
  const f = await fixture()
  f.enable()
  f.events[3]!.data.arguments = JSON.stringify({
    command: 'pnpm test',
    description: 'Build test project',
    sandbox_permissions: 'danger-full-access',
    justification: 'C13 fixture',
  })
  let scoped: EverydayApprovals | undefined
  const fork = f.ctx.plugin({
    name: 'everyday-scope-test',
    apply(ctx: Context) {
      scoped = new EverydayApprovals(ctx, f.store, f.registry)
      installEverydayApprovals(ctx, scoped)
    },
  })
  await fork.await()
  expect(await f.ctx.waterfall('approval/request', f.req, f.next)).toBe('allowed-once')
  expect(f.next).not.toHaveBeenCalled()
  await fork.dispose()
  expect(await scoped!.answer(f.req, f.next)).toBe('unavailable')
})

test('fresh Cordis service proxies do not change live Agent identity or prevent approval', async () => {
  const f = await fixture()
  f.enable()
  const get = f.ctx.get.bind(f.ctx)
  vi.spyOn(f.ctx, 'get').mockImplementation(((name: string) =>
    name === 'agents' ? new Proxy(f.agents, {}) : get(name)) as never)
  expect(await f.service.answer(f.req, f.next)).toBe('allowed-once')
  expect(f.next).not.toHaveBeenCalled()
})
