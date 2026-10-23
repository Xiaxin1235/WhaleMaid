import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { PeerScope } from '@deepseek-ai/dsh-client-connection'
import { afterEach, expect, test, vi } from 'vitest'
import { RunSchema, RunIdSchema } from '@whaledot/core'
import { makeGoal, makeTask } from '../../../core/tests/fixtures.js'
import { WhaleStore, productionClock, productionIdGen, sha256 } from '../store/index.js'
import { ScopeService } from '../scope-service.js'
import { WorktreeManager } from './worktree.js'
import { TaskExecutor } from './execute-task.js'
import { ToolGate } from './tool-gate.js'
import { dshRunner } from './dsh-runner.js'
import type { DshRunner, LaunchRequest } from './dsh-runner.js'
const cleanups: (() => Promise<unknown> | void)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})
const owner = { principal: { kind: 'owner' }, signal: new AbortController().signal } as PeerScope
async function setup(git = true) {
  const dir = await mkdtemp(join(tmpdir(), 'whaledot-execution-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  const project = join(dir, 'project'),
    data = join(dir, 'data')
  await mkdir(project)
  await mkdir(data)
  const worktrees = new WorktreeManager(data)
  if (git) {
    await worktrees.git(project, ['init'])
    await writeFile(join(project, 'a.txt'), 'original')
    await worktrees.git(project, ['add', '-A'])
    await worktrees.git(project, ['commit', '-m', 'initial'])
  }
  const store = new WhaleStore(data, { log: vi.fn() })
  cleanups.push(() => store.close())
  const goal = makeGoal({ projectRoot: project })
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
      allowedPaths: [project],
      protectedPaths: [join(project, '.git')],
      allowedActions: ['read-file', 'write-file', 'run-command'],
      forbiddenActions: [],
      verifyCommands: ['pnpm test'],
      permissionPreset: git ? 'workspace-write' : 'read-only',
    },
    owner,
  )
  const runner: DshRunner = {
    launch: vi.fn(async (request: LaunchRequest) => {
      request.check()
      request.register('session-test')
      return 'session-test'
    }),
    cancel: vi.fn(),
  }
  const executor = new TaskExecutor(store, scopes, runner, data, () => 'zh-CN', vi.fn())
  cleanups.push(() => executor.dispose())
  return { dir, project, data, worktrees, store, goal, scopes, scope, runner, executor }
}
test('real worktree reuse, checkpoint/hook suppression and exact original workspace preservation', async () => {
  const { project, goal, worktrees } = await setup()
  const before = await worktrees.git(project, ['rev-parse', 'HEAD']),
    branch = await worktrees.git(project, ['symbolic-ref', 'HEAD'])
  const hook = join(project, '.git', 'hooks', 'pre-commit')
  await writeFile(hook, '#!/bin/sh\necho hooked > hook-ran\n', { mode: 0o755 })
  const work = await worktrees.prepare(goal)
  expect(work.path).not.toBe(project)
  expect((await worktrees.prepare(goal, work.baseCommit)).path).toBe(work.path)
  await writeFile(join(work.path, 'a.txt'), 'changed')
  const checkpoint = await worktrees.checkpoint(work, 'goal task run')
  expect(checkpoint.changed).toBe(true)
  expect(checkpoint.files).toEqual(['a.txt'])
  expect(checkpoint.diffStat).toContain('a.txt')
  expect(await readFile(join(project, 'a.txt'), 'utf8')).toBe('original')
  expect(await worktrees.git(project, ['status', '--porcelain'])).toBe('')
  expect(await worktrees.git(project, ['symbolic-ref', 'HEAD'])).toBe(branch)
  expect(await worktrees.git(project, ['rev-parse', 'HEAD'])).toBe(before)
  expect(await worktrees.git(work.path, ['status', '--porcelain'])).toBe('')
  await expect(worktrees.prepare(goal, work.baseCommit)).rejects.toThrow('external-modification')
  await writeFile(join(work.path, 'external.txt'), 'external')
  await expect(worktrees.prepare(goal, checkpoint.commit)).rejects.toThrow('external-modification')
})
test('gate passes unrelated calls without touching even a throwing argument getter', async () => {
  const { executor } = await setup(false)
  const gate = new ToolGate(executor.registry, () => 'en')
  const next = vi.fn(async () => ({ kind: 'allow' as const }))
  const exec = {
    name: 'write',
    get arguments(): unknown {
      throw new Error('MUST NOT READ')
    },
    agent: { session: { id: 'ordinary' } },
  }
  expect(await gate.check(exec, next)).toEqual({ kind: 'allow' })
  expect(next).toHaveBeenCalledOnce()
})
async function active() {
  const setupResult = await setup()
  const { executor, store, goal } = setupResult
  const task = makeTask()
  store.tasks.insert(task)
  const result = await executor.executeNextTask(goal.id, { kind: 'panel', peer: owner })
  expect(result.started).toBe(true)
  const run = store.runs.get(result.runId!)!
  const gate = new ToolGate(executor.registry, () => 'zh-CN')
  return { ...setupResult, gate, run, next: vi.fn(async () => ({ kind: 'allow' as const })) }
}
test('gate permits in-scope reads and rejects outside, protected, malformed, ended and revoked calls without recording raw args', async () => {
  const { gate, run, next, store, scopes, scope } = await active()
  const call = (name: string, args: unknown) =>
    gate.check({ name, arguments: args, agent: { session: { id: run.sessionId } } }, next)
  expect(await call('read', { file_path: 'a.txt' })).toEqual({ kind: 'allow' })
  for (const [name, args] of [
    ['write', { file_path: 'C:/outside/password', content: 'SECRET_CONTENT' }],
    ['read', { file_path: 'nested/.ENV.prod' }],
    ['read', { file_path: 'nested/id_rsa' }],
    ['unknown-tool', { password: 'SECRET_CONTENT' }],
    ['pwsh', { description: 'Read file', command: "Get-Content 'C:/outside/.env'" }],
  ] as const)
    expect(await call(name, args)).toMatchObject({ kind: 'deny' })
  expect(store.evidence.list(run.run_id)).toHaveLength(5)
  expect(JSON.stringify(store.evidence.list(run.run_id))).not.toContain('SECRET_CONTENT')
  expect(JSON.stringify(store.evidence.list(run.run_id))).not.toContain('outside/password')
  scopes.revoke(scope.id, owner)
  expect(await call('read', { file_path: 'a.txt' })).toMatchObject({ kind: 'deny' })
  store.runs.update({ ...store.runs.get(run.run_id)!, status: 'ended' })
  expect(await call('read', { file_path: 'a.txt' })).toMatchObject({ kind: 'deny' })
})
test('gate denies symlink escape including a nonexistent child; broad search cannot read a nested protected descendant', async () => {
  const { gate, run, next, dir } = await active()
  const outside = join(dir, 'outside')
  await mkdir(outside)
  await writeFile(join(outside, 'secret.txt'), 'secret')
  await symlink(outside, join(run.worktreePath, 'link'), 'junction')
  const call = (name: string, args: unknown) =>
    gate.check({ name, arguments: args, agent: { session: { id: run.sessionId } } }, next)
  expect(await call('read', { file_path: 'link/secret.txt' })).toMatchObject({ kind: 'deny' })
  expect(await call('write', { file_path: 'link/new.txt', content: 'x' })).toMatchObject({ kind: 'deny' })
  await mkdir(join(run.worktreePath, 'nested'))
  await writeFile(join(run.worktreePath, 'nested', '.env'), 'not-model-data')
  expect(await call('grep', { pattern: 'secret' })).toMatchObject({ kind: 'deny' })
  expect(next).not.toHaveBeenCalled()
})
test('gate errors fail closed and nested execution tokens inherit ownership', async () => {
  const { gate, run, next } = await active()
  const token = {}
  const root = {}
  await gate.check(
    {
      name: 'read',
      arguments: { file_path: 'a.txt' },
      agent: { session: { id: run.sessionId } },
      rootCallId: root,
      token,
    },
    next,
  )
  expect(
    await gate.check(
      {
        name: 'mystery',
        get arguments(): unknown {
          throw new Error('gate-error')
        },
        parent: token,
        rootCallId: root,
      },
      next,
    ),
  ).toMatchObject({ kind: 'deny' })
  expect(
    await gate.check(
      {
        name: 'read',
        arguments: { file_path: 'a.txt' },
        agent: { session: { id: 'child', header: { parentSession: run.sessionId } } },
      },
      next,
    ),
  ).toMatchObject({ kind: 'allow' })
})
test('concurrent clicks create one run; completion advances only to VERIFYING and retains diff evidence', async () => {
  const { store, executor, goal, runner } = await setup()
  store.tasks.insert(makeTask('task_1', { kind: 'analyze' }))
  const results = await Promise.all([
    executor.executeNextTask(goal.id, { kind: 'panel', peer: owner }),
    executor.executeNextTask(goal.id, { kind: 'panel', peer: owner }),
  ])
  expect(results.filter((r) => r.started)).toHaveLength(1)
  expect(runner.launch).toHaveBeenCalledOnce()
  const run = store.runs.all()[0]!
  expect(run.runScope?.permissionPreset).toBe('read-only')
  expect(run.runScope?.allowedActions).not.toContain('write-file')
  executor.accept({ sessionId: run.sessionId, kind: 'turn-end', at: Date.now(), endReason: 'completed' })
  await expect.poll(() => store.tasks.get(makeTask().id)?.state).toBe('VERIFYING')
  expect(store.runs.all()[0]?.status).toBe('ended')
  expect(store.evidence.list(run.run_id)[0]?.kind).toBe('diff')
})
test('worktree external modification blocks next independent task without launch', async () => {
  const { store, executor, goal, runner } = await setup()
  store.tasks.insert(makeTask('task_1', { kind: 'analyze' }))
  store.tasks.insert(makeTask('task_2', { kind: 'analyze' }))
  const first = await executor.executeNextTask(goal.id, { kind: 'panel', peer: owner })
  const run = store.runs.get(first.runId!)!
  executor.accept({ sessionId: run.sessionId, kind: 'turn-end', at: Date.now(), endReason: 'completed' })
  await expect.poll(() => store.runs.get(run.run_id)?.status).toBe('ended')
  await writeFile(join(run.worktreePath, 'external.txt'), 'external')
  expect(await executor.executeNextTask(goal.id, { kind: 'panel', peer: owner })).toMatchObject({
    started: false,
    reason: 'worktree-external-modification',
  })
  expect(store.tasks.get(makeTask('task_2').id)?.state).toBe('BLOCKED')
  expect(runner.launch).toHaveBeenCalledOnce()
})
test('unload closes the gate immediately and drains a checkpoint already being finalized', async () => {
  const { store, executor, run } = await active()
  const checkpoint = executor.worktrees.checkpoint.bind(executor.worktrees)
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  const entered = vi.spyOn(executor.worktrees, 'checkpoint').mockImplementation(async (...args) => {
    await held
    return checkpoint(...args)
  })
  executor.accept({ sessionId: run.sessionId, kind: 'turn-end', at: Date.now(), endReason: 'completed' })
  expect(entered).toHaveBeenCalledOnce()
  let drained = false
  const stopping = executor.dispose().then(() => {
    drained = true
  })
  expect(executor.registry.isOpen(run.sessionId)).toBe(false)
  await Promise.resolve()
  expect(drained).toBe(false)
  release()
  await stopping
  expect(drained).toBe(true)
  expect(store.runs.get(run.run_id)?.status).toBe('ended')
})

test('changed-file limit still commits evidence and blocks the task', async () => {
  const { store, executor, run } = await active()
  const scope = { ...run.runScope!, limits: { ...run.runScope!.limits, maxChangedFilesPerTask: 1 } }
  store.runs.update({ ...run, runScope: scope })
  await writeFile(join(run.worktreePath, 'b.txt'), 'b')
  await writeFile(join(run.worktreePath, 'c.txt'), 'c')
  executor.accept({ sessionId: run.sessionId, kind: 'turn-end', at: Date.now(), endReason: 'completed' })
  await expect.poll(() => store.tasks.get(run.taskId)?.state).toBe('BLOCKED')
  expect(store.checkpoints.list(makeGoal().id).at(-1)?.files).toHaveLength(2)
  expect(store.runs.get(run.run_id)?.reason).toBe('changed-file-limit-exceeded')
})
test('revocation cancels and records UNKNOWN; restart recovery never resends', async () => {
  const { store, executor, run, runner, scope, scopes, data } = await active()
  scopes.revoke(scope.id, owner)
  executor.revoke(scope.id)
  executor.accept({ sessionId: run.sessionId, kind: 'turn-end', at: Date.now(), endReason: 'aborted' })
  expect(runner.cancel).toHaveBeenCalledWith(run.sessionId)
  await expect.poll(() => store.tasks.get(run.taskId)?.state).toBe('UNKNOWN')
  const task = makeTask('task_2')
  store.tasks.insert(task)
  executor.registry.transition(task, 'READY', 'ready')
  executor.registry.transition(
    store.tasks.get(task.id)!,
    'RUNNING',
    'registered',
    RunIdSchema.parse('run_restart'),
  )
  store.runs.insert(
    RunSchema.parse({
      ...run,
      run_id: 'run_restart',
      sessionId: 'restart-session',
      taskId: task.id,
      status: 'running',
    }),
  )
  const restarted = new TaskExecutor(store, scopes, runner, data, () => 'en', vi.fn())
  cleanups.push(() => restarted.dispose())
  expect(store.tasks.get(task.id)?.state).toBe('UNKNOWN')
  expect(store.runs.get(RunIdSchema.parse('run_restart'))?.reason).toBe('host-restarted')
  expect(runner.launch).toHaveBeenCalledOnce()
})
test('non-git projects only launch read-only analysis', async () => {
  const { store, executor, goal } = await setup(false)
  store.tasks.insert(makeTask('task_1', { kind: 'edit' }))
  expect(await executor.executeNextTask(goal.id, { kind: 'panel', peer: owner })).toMatchObject({
    started: false,
    reason: 'non-git-read-only-required',
  })
})
test('permission mismatch prevents registration and prompt; trusted direct runner supports background without peers', async () => {
  const ctx = new Context()
  cleanups.push(() => ctx.fiber.dispose())
  const prompt = vi.fn(async () => ({ accepted: true })),
    set = vi.fn(),
    register = vi.fn(),
    check = vi.fn()
  ctx.provide('sessionController', {
    create: async () => ({ sessionId: 's' }),
    rename: async () => ({ title: 't' }),
    prompt,
    cancel: vi.fn(),
  })
  ctx.provide('sessions', { get: () => ({ id: 's' }) })
  ctx.provide('permissionPresets', { set, current: () => 'workspace-write' })
  ctx.provide('tools', {})
  const runner = dshRunner(ctx)
  await expect(
    runner.launch({
      cwd: 'C:/project',
      preset: 'read-only',
      title: 't',
      prompt: 'p',
      via: { kind: 'background' },
      register,
      check,
    }),
  ).rejects.toThrow('preset-mismatch')
  expect(prompt).not.toHaveBeenCalled()
  expect(register).not.toHaveBeenCalled()
})

test('timeout without terminal acknowledgment stays UNKNOWN and never stages potentially live writes', async () => {
  const { store, executor, goal, runner } = await setup(false)
  store.tasks.insert(makeTask('task_1', { kind: 'analyze' }))
  vi.useFakeTimers()
  try {
    const result = await executor.executeNextTask(goal.id, { kind: 'panel', peer: owner })
    expect(result.started).toBe(true)
    await vi.advanceTimersByTimeAsync(30 * 60000)
    expect(runner.cancel).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(5000)
    expect(store.tasks.get(makeTask().id)?.state).toBe('UNKNOWN')
    expect(store.runs.get(result.runId!)?.reason).toBe('run-timeout')
    expect(store.checkpoints.list(goal.id)).toHaveLength(0)
  } finally {
    vi.useRealTimers()
  }
})
test('a known owned session stays denied if its run row becomes unreadable; ordinary sessions still pass', async () => {
  const { executor, gate, run, next } = await active()
  vi.spyOn(executor.registry, 'get').mockImplementation(() => {
    throw new Error('store-unavailable')
  })
  expect(
    await gate.check(
      { name: 'read', arguments: { file_path: 'a' }, agent: { session: { id: run.sessionId } } },
      next,
    ),
  ).toMatchObject({ kind: 'deny' })
  expect(
    await gate.check(
      {
        name: 'read',
        get arguments(): unknown {
          throw new Error('do not read')
        },
        agent: { session: { id: 'ordinary' } },
      },
      next,
    ),
  ).toEqual({ kind: 'allow' })
})
test('direct background launch verifies preset and registers before its only prompt; rejected registration sends nothing', async () => {
  const ctx = new Context()
  cleanups.push(() => ctx.fiber.dispose())
  const order: string[] = []
  const prompt = vi.fn(async () => {
    order.push('prompt')
    return { accepted: true }
  })
  ctx.provide('sessionController', {
    create: async () => {
      order.push('create')
      return { sessionId: 's' }
    },
    rename: async () => {
      order.push('rename')
      return { title: 't' }
    },
    prompt,
    cancel: vi.fn(),
  })
  ctx.provide('sessions', { get: () => ({ id: 's' }) })
  ctx.provide('permissionPresets', {
    set: () => {
      order.push('preset')
    },
    current: () => 'read-only',
  })
  ctx.provide('tools', {})
  const runner = dshRunner(ctx)
  const request: LaunchRequest = {
    cwd: 'C:/project',
    preset: 'read-only',
    title: 't',
    prompt: 'p',
    via: { kind: 'background' },
    check: () => {},
    register: () => {
      order.push('register')
    },
  }
  await runner.launch(request)
  expect(order).toEqual(['create', 'preset', 'rename', 'register', 'prompt'])
  expect(prompt).toHaveBeenCalledOnce()
  await expect(
    runner.launch({
      ...request,
      register: () => {
        throw new Error('registration-failed')
      },
    }),
  ).rejects.toThrow('registration-failed')
  expect(prompt).toHaveBeenCalledOnce()
})

test('Git subdirectory roots cannot silently authorize the whole repository', async () => {
  const { project, goal, worktrees } = await setup()
  const child = join(project, 'package')
  await mkdir(child)
  await expect(worktrees.prepare({ ...goal, projectRoot: child })).rejects.toThrow(
    'git-project-root-required',
  )
})
test('storage/worktree parent junctions into the project are rejected before creating a worktree', async () => {
  const { dir, project, data, goal, worktrees } = await setup()
  const inside = join(project, 'inside')
  await mkdir(inside)
  const alias = join(dir, 'data-alias')
  await symlink(inside, alias, 'junction')
  await expect(new WorktreeManager(alias).prepare(goal)).rejects.toThrow('worktree-must-be-external')
  await symlink(inside, join(data, 'worktrees'), 'junction')
  await expect(worktrees.prepare(goal)).rejects.toThrow('worktree-must-be-external')
})
test('a populated or linked hooks directory is refused, never executed', async () => {
  const { worktrees, project } = await setup()
  await writeFile(join(worktrees.emptyHooks, 'pre-commit'), 'malicious')
  await expect(worktrees.git(project, ['status'])).rejects.toThrow('hooks-directory-not-empty')
})

test('shell readers realpath every literal target and release lineage on closure/unload', async () => {
  const { gate, run, next, executor, dir } = await active()
  const outside = join(dir, 'outside')
  await mkdir(outside)
  await writeFile(join(outside, 'secret.txt'), 'secret')
  await symlink(outside, join(run.worktreePath, 'link'), 'junction')
  const call = (command: string) =>
    gate.check(
      {
        name: 'pwsh',
        arguments: { description: 'read', command },
        agent: { session: { id: run.sessionId } },
        rootCallId: {},
        token: {},
      },
      next,
    )
  expect(await call('Get-Content -LiteralPath "link/secret.txt"')).toMatchObject({ kind: 'deny' })
  expect(await call('Get-Content .env')).toMatchObject({ kind: 'deny' })
  expect(await call('type C:/Users/xx/.ssh/id_rsa')).toMatchObject({ kind: 'deny' })
  expect(await call('dir')).toMatchObject({ kind: 'allow' })
  expect(gate.trackedEntries()).toBeGreaterThan(0)
  executor.registry.close(run.sessionId)
  expect(gate.trackedEntries()).toBe(0)
  await call('dir')
  executor.dispose()
  expect(gate.trackedEntries()).toBe(0)
})
