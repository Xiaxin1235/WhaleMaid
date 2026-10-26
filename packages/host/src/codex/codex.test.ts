import { mkdtemp, mkdir, realpath, rm, writeFile, readFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { Context } from '@deepseek-ai/cordis'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { afterEach, expect, test, vi } from 'vitest'
import { CodexArgumentsSchema, CodexSettingsSchema } from './contract.js'
import { CodexRunner, codexArguments, codexEnvironment, codexRedactor, windowsSandboxFrom } from './runner.js'
import { ConversationCodex, installConversationCodex } from './service.js'
import { WhaleStore } from '../store/index.js'
const cleanups: (() => unknown | Promise<unknown>)[] = []
afterEach(async () => {
  for (const fn of cleanups.splice(0).reverse()) await fn()
})
const fake = fileURLToPath(new URL('../../tests/fake-codex.mjs', import.meta.url))
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'whalemaid-codex-')))
  cleanups.push(() => rm(root, { recursive: true, force: true, maxRetries: 5 }))
  const dir = join(root, 'project')
  await mkdir(dir)
  await writeFile(join(dir, 'README.md'), 'fictional baseline\n')
  execFileSync('git', ['init', dir], { stdio: 'ignore', windowsHide: true })
  const runner = new CodexRunner(join(root, 'data'), {
    executable: process.execPath,
    prefix: [fake],
    env: { ...process.env, DEEPSEEK_API_KEY: 'fake-env-private-value', DSH_SECRET: 'fake-dsh-value' },
  })
  cleanups.push(() => runner.dispose())
  const input = {
    task: JSON.stringify({ message: 'fictional result' }),
    mode: 'read-only' as const,
    cwd: dir,
    sessionId: 'ordinary',
    signal: new AbortController().signal,
    timeoutMs: 30000,
  }
  return { dir, runner, input }
}
test('strict task/mode schema, defaults and timeout limits', () => {
  expect(CodexArgumentsSchema.parse({ task: 'list files' }).mode).toBe('read-only')
  for (const value of [
    { task: '' },
    { task: 'x'.repeat(8001) },
    { task: 'list', mode: 'danger-full-access' },
    { task: 'list', cwd: 'C:/outside' },
    { task: 'list', directory: 'C:/outside' },
  ])
    expect(CodexArgumentsSchema.safeParse(value).success).toBe(false)
  expect(CodexSettingsSchema.parse({})).toEqual({ enabled: false, timeoutMinutes: 15 })
  for (const timeoutMinutes of [0, 61, 1.5])
    expect(CodexSettingsSchema.safeParse({ timeoutMinutes }).success).toBe(false)
})
test.each(['read-only', 'workspace-write'] as const)(
  'only restrictive flags, literal directory and stdin task: %s',
  (mode) => {
    const args = codexArguments('C:/project with spaces', mode)
    expect(args).toContain(mode)
    expect(args).toContain('C:/project with spaces')
    expect(args.at(-1)).toBe('-')
    expect(args.join(' ')).not.toMatch(/bypass|danger-full-access|--add-dir|-c /)
    expect(args).toContain('--ignore-user-config')
  },
)
test('only the Windows sandbox backend is carried over, never a wider policy', () => {
  const args = codexArguments('C:/project', 'workspace-write', 'elevated')
  expect(args.filter((arg) => arg === '-c')).toHaveLength(1)
  expect(args[args.indexOf('-c') + 1]).toBe('windows.sandbox="elevated"')
  expect(args.join(' ')).not.toMatch(/bypass|danger-full-access|--add-dir/)
  expect(
    windowsSandboxFrom(
      'sandbox_mode = "danger-full-access"\n[windows]\n# note\nsandbox = "elevated" # set up\n[features]\nsandbox = "unelevated"\n',
    ),
  ).toBe('elevated')
  expect(windowsSandboxFrom('[windows]\nsandbox = "danger-full-access"\n')).toBeUndefined()
  expect(windowsSandboxFrom('sandbox = "elevated"\n')).toBeUndefined()
  expect(windowsSandboxFrom('[windows.extra]\nsandbox = "elevated"\n')).toBeUndefined()
})
test('environment is an allowlist and does not inherit DSH, provider or arbitrary secrets', () => {
  expect(
    codexEnvironment({
      PATH: 'path',
      USERPROFILE: 'home',
      DEEPSEEK_API_KEY: 'fake-value',
      OPENAI_API_KEY: 'fake-value',
      DSH_HOME: 'test',
      OTHER_TOKEN: 'private',
      CODEX_THREAD_ID: 'parent',
    }),
  ).toEqual({ PATH: 'path', USERPROFILE: 'home' })
})
test('fake CLI final result, safe full JSON log, hidden env, and 8000-character truncation', async () => {
  const f = await fixture()
  const result = await f.runner.run({
    ...f.input,
    task: JSON.stringify({
      message: 'x'.repeat(8100) + 'fake-env-private-value',
      inspectEnv: true,
      stderr: 'fake-env-private-value',
    }),
  })
  expect(result.status).toBe('completed')
  expect(result.message).toContain('truncated')
  expect(result.message).not.toContain('private reasoning')
  const log = await readFile(result.record.logPath, 'utf8')
  expect(log).not.toContain('fake-env-private-value')
  expect(log).not.toContain('DSH_SECRET')
  expect(log).not.toContain('DEEPSEEK_API_KEY')
  expect(log).toContain('thread.started')
  expect(log).toContain('turn.completed')
  expect((await f.runner.history())[0]?.id).toBe(result.record.id)
})
test('workspace-write returns actual porcelain status differences, without file contents', async () => {
  const f = await fixture()
  execFileSync('git', ['-C', f.dir, 'add', 'README.md'], { windowsHide: true })
  execFileSync(
    'git',
    [
      '-C',
      f.dir,
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.test',
      'commit',
      '-m',
      'baseline',
    ],
    { stdio: 'ignore', windowsHide: true },
  )
  const result = await f.runner.run({
    ...f.input,
    mode: 'workspace-write',
    task: JSON.stringify({ append: true }),
  })
  expect(result.record.files.join('\n')).toContain('README.md')
  expect(result.record.files.join('\n')).not.toContain('fictional appended line')
})
test('policy denial is reported even when the CLI exits zero', async () => {
  const f = await fixture()
  expect((await f.runner.run({ ...f.input, task: JSON.stringify({ blocked: true }) })).status).toBe(
    'sandbox-blocked',
  )
})
test('read-only denial on stderr is not mistaken for a successful writable task', async () => {
  const f = await fixture()
  const result = await f.runner.run({
    ...f.input,
    mode: 'workspace-write',
    task: JSON.stringify({
      stderr: 'patch rejected: writing is blocked by read-only sandbox; rejected by user approval settings',
      message: '无法修改',
    }),
  })
  expect(result.status).toBe('sandbox-blocked')
  expect(result.record.exitCode).toBe(0)
  expect(result.record.files).toEqual([])
})
test.each(['cancelled', 'timeout'] as const)(
  '%s terminates fake CLI and its child before returning',
  async (reason) => {
    const f = await fixture(),
      controller = new AbortController()
    const pending = f.runner.run({
      ...f.input,
      task: JSON.stringify({ hang: true }),
      signal: controller.signal,
      timeoutMs: reason === 'timeout' ? 2000 : 30000,
    })
    await vi.waitFor(
      async () => {
        await access(join(f.dir, 'child.pid'))
      },
      { timeout: 5000 },
    )
    if (reason === 'cancelled') controller.abort()
    const result = await pending
    expect(result.status, await readFile(result.record.logPath, 'utf8')).toBe(reason)
    const pid = Number(await readFile(join(f.dir, 'child.pid'), 'utf8'))
    expect(() => process.kill(pid, 0)).toThrow()
  },
  30000,
)
test('runner admits only one running process', async () => {
  const f = await fixture(),
    controller = new AbortController()
  const first = f.runner.run({ ...f.input, signal: controller.signal, task: JSON.stringify({ hang: true }) })
  await vi.waitFor(async () => {
    await access(join(f.dir, 'child.pid'))
  })
  expect((await f.runner.run(f.input)).status).toBe('busy')
  controller.abort()
  await first
}, 30000)
test('logs retain the latest 100 complete calls', async () => {
  const f = await fixture()
  for (let i = 0; i < 101; i++) await f.runner.skipped({ ...f.input, task: 'call ' + i }, 'rejected')
  const records = await f.runner.history()
  expect(records).toHaveLength(100)
  expect(records.some((r) => r.task === 'call 0')).toBe(false)
}, 30000)

async function serviceFixture() {
  const f = await fixture(),
    ctx = new Context()
  cleanups.push(() => ctx.fiber.dispose())
  const store = new WhaleStore(join(f.dir, 'store'), { log: vi.fn() })
  cleanups.push(() => store.close())
  const events = [
    { type: 'session/title', data: { title: 'ordinary' } },
    { type: 'user/message', data: { content: [{ type: 'text', text: 'Hello' }] } },
  ]
  const scopeTools = { restrict: vi.fn(() => vi.fn()) }
  const agent = {
    session: {
      id: 'ordinary',
      header: { cwd: f.dir, agentPreset: 'standard', origin: undefined as string | undefined },
      snapshotEvents: () => events,
    },
    ctx: { get: () => scopeTools },
  }
  const agents = { get: () => agent, roots: () => [agent], list: () => [agent] }
  const workspace = { archivedSessionIds: [] as string[] }
  const approval = {
    request: vi.fn(async (request: unknown) => {
      void request
      return 'allowed-once'
    }),
  }
  ctx.provide('agents', agents as never)
  ctx.provide('workspaceRegistry', workspace as never)
  ctx.provide('approval', approval as never)
  const registry = { has: vi.fn(() => false) }
  const service = new ConversationCodex(ctx, store, registry, f.runner)
  const exec = { agent, callId: 'call-1', signal: new AbortController().signal } as unknown as ToolRunContext
  return { ...f, ctx, store, events, agent, approval, workspace, registry, service, exec, scopeTools }
}
test('disabled calls never ask or spawn; owner opt-in is persistent', async () => {
  const f = await serviceFixture(),
    run = vi.spyOn(f.runner, 'run')
  expect(JSON.parse(await f.service.call({ task: 'test' }, f.exec)).status).toBe('disabled')
  expect(run).not.toHaveBeenCalled()
  expect(f.approval.request).not.toHaveBeenCalled()
  await f.service.settings({ enabled: true, timeoutMinutes: 10 })
  expect(f.store.codexSettings()).toEqual({ enabled: true, timeoutMinutes: 10 })
})
test.each(['companion', 'new-title', 'old-title', 'prefix', 'registered', 'archived', 'subagent'])(
  'excluded session cannot get or invoke the capability: %s',
  async (kind) => {
    const f = await serviceFixture()
    await f.service.settings({ enabled: true, timeoutMinutes: 15 })
    if (kind === 'companion') f.agent.session.header.agentPreset = 'whaledot-companion'
    if (kind === 'new-title') f.events[0]!.data.title = '[WhaleMaid] task'
    if (kind === 'old-title') f.events[0]!.data.title = '[WhaleDot] task'
    if (kind === 'prefix')
      Object.assign(f.events[1]!.data, {
        content: [{ type: 'text', text: 'WhaleDot: execute this single task' }],
      })
    if (kind === 'registered') f.registry.has.mockReturnValue(true)
    if (kind === 'archived') f.workspace.archivedSessionIds.push('ordinary')
    if (kind === 'subagent') f.agent.session.header.origin = 'subagent'
    const register = vi.fn(() => vi.fn())
    f.ctx.provide('tools', { register } as never)
    installConversationCodex(f.ctx, f.service)
    await vi.waitFor(() => expect(register).toHaveBeenCalled())
    expect(f.scopeTools.restrict).toHaveBeenCalledWith({ deny: ['codex'] })
    expect(JSON.parse(await f.service.call({ task: 'test' }, f.exec)).status).toBe('excluded')
    expect(f.approval.request).not.toHaveBeenCalled()
  },
)
test.each(['rejected', 'unavailable', 'cancelled'])('native approval %s does not spawn', async (outcome) => {
  const f = await serviceFixture()
  await f.service.settings({ enabled: true, timeoutMinutes: 15 })
  f.approval.request.mockResolvedValue(outcome)
  const run = vi.spyOn(f.runner, 'run')
  const result = JSON.parse(await f.service.call({ task: 'list files' }, f.exec))
  expect(result.status).toBe(outcome)
  expect(run).not.toHaveBeenCalled()
  expect(result.record.pid).toBeUndefined()
  expect(f.approval.request.mock.calls[0]?.[0]).toMatchObject({ toolName: 'codex', callId: 'call-1' })
})
test('approved call fixes cwd from session and cannot accept a model directory', async () => {
  const f = await serviceFixture()
  await f.service.settings({ enabled: true, timeoutMinutes: 15 })
  const result = JSON.parse(await f.service.call({ task: JSON.stringify({ message: 'done' }) }, f.exec))
  expect(result.status).toBe('completed')
  expect(result.record.cwd).toBe(codexRedactor(process.env)(f.dir))
  await expect(f.service.call({ task: 'work', cwd: 'C:/other' }, f.exec)).rejects.toThrow()
  expect(f.approval.request).toHaveBeenCalledTimes(1)
})
