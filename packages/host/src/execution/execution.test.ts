import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { PeerScope } from '@deepseek-ai/dsh-client-connection'
import { afterEach, expect, test, vi } from 'vitest'
import { RunSchema, RunIdSchema, SessionIdSchema } from '@whaledot/core'
import { makeGoal, makeTask } from '../../../core/tests/fixtures.js'
import { WhaleStore, productionClock, productionIdGen, sha256 } from '../store/index.js'
import { ScopeService } from '../scope-service.js'
import { WorktreeManager } from './worktree.js'
import { TaskExecutor } from './execute-task.js'
import { ToolGate } from './tool-gate.js'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import { dshRunner } from './dsh-runner.js'
import type { DshRunner, LaunchRequest } from './dsh-runner.js'
const cleanups: (() => Promise<unknown> | void)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})
const owner = { principal: { kind: 'owner' }, signal: new AbortController().signal } as PeerScope
async function setup(git = true, commandMode: 'confirmed' | 'trusted' = 'confirmed') {
  const dir = await mkdtemp(join(tmpdir(), 'whaledot-execution-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }))
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
      commandMode,
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
}, 30000)
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
async function active(commandMode: 'confirmed' | 'trusted' = 'confirmed', locale: 'zh-CN' | 'en' = 'zh-CN') {
  const setupResult = await setup(true, commandMode)
  const { executor, store, goal } = setupResult
  const task = makeTask()
  store.tasks.insert(task)
  const result = await executor.executeNextTask(goal.id, { kind: 'panel', peer: owner })
  expect(result.started).toBe(true)
  const run = store.runs.get(result.runId!)!
  const gate = new ToolGate(executor.registry, () => locale)
  return { ...setupResult, gate, run, next: vi.fn(async () => ({ kind: 'allow' as const })) }
}

function requireAsk(decision: Awaited<ReturnType<ToolGate['check']>>) {
  if (decision.kind !== 'ask') throw new Error('expected ask')
  return decision
}

test.each(['allowed-once', 'rejected', 'unavailable', 'cancelled', 'timeout'] as const)(
  'trusted danger uses real ask and records %s once',
  async (answer) => {
    const { gate, run, store, next } = await active('trusted')
    const exec = {
      name: 'pwsh',
      arguments: { command: 'Remove-Item a.txt', description: 'delete fixture' },
      agent: { session: { id: run.sessionId } },
      callId: 'call-danger',
      token: Symbol(),
    }
    const decision = await gate.check(exec, next)
    expect(decision.kind).toBe('ask')
    expect(next).not.toHaveBeenCalled()
    if (decision.kind !== 'ask') return
    expect(decision.displayReason?.['zh-CN']).toContain('Remove-Item a.txt')
    expect(decision.displayReason?.en).toContain(run.worktreePath)
    if (answer === 'timeout')
      vi.spyOn(Date, 'now').mockReturnValue(run.startedAt + run.runScope!.limits.maxRunMinutes * 60000)
    const execute = vi.fn()
    gate.approvalEvent(run.sessionId, {
      type: 'approval/asked',
      data: { id: 'approval-1', callId: exec.callId, reason: decision.reason! },
    } as SessionEvent)
    const outcome = answer === 'timeout' ? 'cancelled' : answer
    gate.approvalEvent(run.sessionId, {
      type: 'approval/decided',
      data: { id: 'approval-1', outcome },
    } as SessionEvent)
    if (outcome === 'allowed-once' && !gate.guard(exec)) execute()
    vi.restoreAllMocks()
    expect(execute).toHaveBeenCalledTimes(answer === 'allowed-once' ? 1 : 0)
    expect(store.runs.get(run.run_id)?.deniedCalls).toBe(answer === 'allowed-once' ? 0 : 1)
    gate.result(exec)
    const logs = store.evidence.list(run.run_id).filter((e) => e.summary.includes('danger-approval'))
    expect(logs).toHaveLength(1)
    expect(JSON.parse(logs[0]!.summary)).toMatchObject({
      outcome: answer,
      category: 'delete',
      commandHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
    expect(logs[0]!.summary).not.toContain('Remove-Item a.txt')
  },
)

test.each([
  ['zh-CN', '需要确认危险操作（删除）'],
  ['en', 'Confirm dangerous operation (Deletion)'],
] as const)('danger reason is readable in %s without internal identifiers', async (locale, label) => {
  const { gate, run, next, goal } = await active('trusted', locale)
  const decision = await gate.check(
    {
      name: 'pwsh',
      arguments: { command: 'Remove-Item a.txt', description: 'delete' },
      agent: { session: { id: run.sessionId } },
      callId: 'readable-call',
    },
    next,
  )
  expect(decision.kind).toBe('ask')
  if (decision.kind !== 'ask') throw new Error('expected ask')
  expect(decision.reason).toContain(label)
  expect(decision.reason).toContain('Remove-Item a.txt')
  expect(decision.reason).toContain(goal.title)
  expect(decision.reason).not.toMatch(
    /whaledot-danger|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}|\bdelete\b/,
  )
})

test('danger summary truncates only commands longer than 300, leaving displayReason complete', async () => {
  const { gate, run, next } = await active('trusted')
  for (const length of [300, 301, 450]) {
    const command = 'Remove-Item ' + 'a'.repeat(length - 'Remove-Item '.length)
    const decision = await gate.check(
      {
        name: 'pwsh',
        arguments: { command, description: 'long fixture command' },
        agent: { session: { id: run.sessionId } },
        callId: `long-${length}`,
      },
      next,
    )
    if (decision.kind !== 'ask') throw new Error('expected ask')
    expect(decision.reason).toContain(command.slice(0, 300) + (length > 300 ? '…' : ' ·'))
    if (length > 300) expect(decision.reason).not.toContain(command)
    expect(decision.displayReason?.en).toContain(command)
    expect(decision.displayReason?.['zh-CN']).toContain(command)
  }
})

test('approval keys separate sessions even with identical callIds and reasons', async () => {
  const { gate, run, next, executor, store } = await active('trusted')
  const second = {
    ...run,
    run_id: RunIdSchema.parse('run-second'),
    sessionId: SessionIdSchema.parse('second-session'),
  }
  executor.registry.register(second)
  const calls = [run, second].map((item) => ({
    name: 'pwsh',
    arguments: { command: 'rm a.txt', description: 'delete' },
    agent: { session: { id: item.sessionId } },
    callId: 'shared-call',
    token: Symbol(),
  }))
  const asks = (await Promise.all(calls.map((call) => gate.check(call, next)))).map(requireAsk)
  expect(asks[0]!.reason).toBe(asks[1]!.reason)
  for (const [i, item] of [run, second].entries())
    gate.approvalEvent(item.sessionId, {
      type: 'approval/asked',
      data: { id: `session-ask-${i}`, callId: 'shared-call', reason: 'a readable event reason' },
    } as SessionEvent)
  gate.approvalEvent(run.sessionId, {
    type: 'approval/decided',
    data: { id: 'session-ask-1', outcome: 'allowed-once' },
  } as SessionEvent)
  expect(gate.guard(calls[1]!)).toBe('whaledot-approval-not-granted-or-audited')
  for (const [i, item] of [run, second].entries())
    gate.approvalEvent(item.sessionId, {
      type: 'approval/decided',
      data: { id: `session-ask-${i}`, outcome: i ? 'allowed-once' : 'rejected' },
    } as SessionEvent)
  expect(gate.guard(calls[0]!)).toBe('whaledot-approval-not-granted-or-audited')
  expect(gate.guard(calls[1]!)).toBeUndefined()
  expect(store.runs.get(run.run_id)?.deniedCalls).toBe(1)
  expect(store.runs.get(second.run_id)?.deniedCalls).toBe(0)
  expect(JSON.parse(store.evidence.list(second.run_id)[0]!.summary).outcome).toBe('allowed-once')
})

test('repeated callId replaces the pending ask and records unavailable once without granting the old execution', async () => {
  const { gate, run, next, store } = await active('trusted')
  const old = {
    name: 'pwsh',
    arguments: { command: 'rm old.txt', description: 'delete' },
    agent: { session: { id: run.sessionId } },
    callId: 'duplicate',
    token: Symbol(),
  }
  await gate.check(old, next)
  gate.approvalEvent(run.sessionId, {
    type: 'approval/asked',
    data: { id: 'old-ask', callId: old.callId },
  } as SessionEvent)
  const current = { ...old, arguments: { command: 'rm new.txt', description: 'delete' }, token: Symbol() }
  await gate.check(current, next)
  gate.approvalEvent(run.sessionId, {
    type: 'approval/decided',
    data: { id: 'old-ask', outcome: 'allowed-once' },
  } as SessionEvent)
  expect(gate.guard(old)).toBe('whaledot-approval-not-granted-or-audited')
  expect(gate.guard(current)).toBe('whaledot-approval-not-granted-or-audited')
  gate.result(old)
  gate.approvalEvent(run.sessionId, {
    type: 'approval/asked',
    data: { id: 'new-ask', callId: current.callId },
  } as SessionEvent)
  gate.approvalEvent(run.sessionId, {
    type: 'approval/decided',
    data: { id: 'new-ask', outcome: 'allowed-once' },
  } as SessionEvent)
  expect(gate.guard(current)).toBeUndefined()
  gate.result(current)
  const entries = store.evidence.list(run.run_id).map((item) => JSON.parse(item.summary))
  expect(entries.map((item) => item.outcome)).toEqual(['unavailable', 'allowed-once'])
  expect(store.runs.get(run.run_id)?.deniedCalls).toBe(1)
})

test.each(['allowed-once', 'rejected', 'cancelled', 'unavailable'] as const)(
  'no callId pairs the readable reason with its random key: %s',
  async (outcome) => {
    const { gate, run, next, store } = await active('trusted')
    const exec = {
      name: 'pwsh',
      arguments: { command: 'rm a.txt', description: 'delete' },
      agent: { session: { id: run.sessionId } },
      token: Symbol(),
    }
    const ask = requireAsk(await gate.check(exec, next))
    expect(ask.reason).not.toContain('whaledot-danger')
    gate.approvalEvent('another-session', {
      type: 'approval/asked',
      data: { id: 'wrong', reason: ask.reason },
    } as SessionEvent)
    gate.approvalEvent('another-session', {
      type: 'approval/decided',
      data: { id: 'wrong', outcome: 'allowed-once' },
    } as SessionEvent)
    expect(gate.guard(exec)).toBe('whaledot-approval-not-granted-or-audited')
    gate.approvalEvent(run.sessionId, {
      type: 'approval/asked',
      data: { id: 'fallback', reason: ask.reason },
    } as SessionEvent)
    gate.approvalEvent(run.sessionId, {
      type: 'approval/decided',
      data: { id: 'fallback', outcome },
    } as SessionEvent)
    expect(gate.guard(exec)).toBe(
      outcome === 'allowed-once' ? undefined : 'whaledot-approval-not-granted-or-audited',
    )
    gate.result(exec)
    expect(store.runs.get(run.run_id)?.deniedCalls).toBe(outcome === 'allowed-once' ? 0 : 1)
    expect(JSON.parse(store.evidence.list(run.run_id)[0]!.summary).outcome).toBe(outcome)
  },
)

test('identical concurrent fallback reasons remain unpaired and cannot grant either call', async () => {
  const { gate, run, next, store } = await active('trusted')
  const calls = [0, 1].map(() => ({
    name: 'pwsh',
    arguments: { command: 'rm a.txt', description: 'delete' },
    agent: { session: { id: run.sessionId } },
    token: Symbol(),
  }))
  const asks = (await Promise.all(calls.map((call) => gate.check(call, next)))).map(requireAsk)
  expect(asks[0]!.reason).toBe(asks[1]!.reason)
  gate.approvalEvent(run.sessionId, {
    type: 'approval/asked',
    data: { id: 'ambiguous', reason: asks[0]!.reason },
  } as SessionEvent)
  gate.approvalEvent(run.sessionId, {
    type: 'approval/decided',
    data: { id: 'ambiguous', outcome: 'allowed-once' },
  } as SessionEvent)
  for (const call of calls) {
    expect(gate.guard(call)).toBe('whaledot-approval-not-granted-or-audited')
    gate.result(call)
  }
  expect(store.runs.get(run.run_id)?.deniedCalls).toBe(2)
})

test('old opaque approval events are safely ignored even with the current callId', async () => {
  const { gate, run, next, store } = await active('trusted')
  const exec = {
    name: 'pwsh',
    arguments: { command: 'rm a.txt', description: 'delete' },
    agent: { session: { id: run.sessionId } },
    callId: 'legacy-call',
    token: Symbol(),
  }
  await gate.check(exec, next)
  expect(() => {
    gate.approvalEvent(run.sessionId, {
      type: 'approval/asked',
      data: {
        id: 'legacy',
        callId: exec.callId,
        reason: 'whaledot-danger:ff6f2790-b5d3-4505-81f1-8ec687c8b6db',
      },
    } as SessionEvent)
    gate.approvalEvent(run.sessionId, {
      type: 'approval/decided',
      data: { id: 'legacy', outcome: 'allowed-once' },
    } as SessionEvent)
  }).not.toThrow()
  expect(gate.guard(exec)).toBe('whaledot-approval-not-granted-or-audited')
  expect(store.evidence.list(run.run_id)).toHaveLength(0)
  gate.result(exec)
  expect(store.runs.get(run.run_id)?.deniedCalls).toBe(1)
})

test('closing or replacing authorization while waiting discards late approval; no grant persists', async () => {
  const { gate, run, executor, store, next } = await active('trusted')
  const exec = {
    name: 'pwsh',
    arguments: { command: 'rm a.txt', description: 'delete' },
    agent: { session: { id: run.sessionId } },
    token: Symbol(),
  }
  const decision = await gate.check(exec, next)
  if (decision.kind !== 'ask') throw Error('expected ask')
  gate.approvalEvent(run.sessionId, {
    type: 'approval/asked',
    data: { id: 'approval-late', reason: decision.reason! },
  } as SessionEvent)
  executor.registry.close(run.sessionId)
  gate.approvalEvent(run.sessionId, {
    type: 'approval/decided',
    data: { id: 'approval-late', outcome: 'allowed-once' },
  } as SessionEvent)
  expect(gate.guard(exec)).toBe('whaledot-run-inactive')
  expect(store.runs.get(run.run_id)?.deniedCalls).toBe(1)
})

test('trusted ordinary commands pass but file/protected targets remain denied; confirmed still denies asks', async () => {
  const trusted = await active('trusted')
  const call = (name: string, args: unknown) =>
    trusted.gate.check(
      { name, arguments: args, agent: { session: { id: trusted.run.sessionId } } },
      trusted.next,
    )
  expect(await call('pwsh', { command: 'node scripts/gen.mjs', description: 'generate' })).toEqual({
    kind: 'allow',
  })
  expect(await call('pwsh', { command: 'type C:/Windows/win.ini', description: 'outside' })).toMatchObject({
    kind: 'ask',
  })
  expect(await call('read', { file_path: 'C:/Windows/win.ini' })).toMatchObject({ kind: 'deny' })
  expect(await call('pwsh', { command: 'type .env', description: 'protected' })).toMatchObject({
    kind: 'deny',
  })
  expect(await call('write', { file_path: '.git/config', content: 'x' })).toMatchObject({ kind: 'deny' })
  const old = await active()
  expect(
    await old.gate.check(
      {
        name: 'pwsh',
        arguments: { command: 'node scripts/gen.mjs', description: 'generate' },
        agent: { session: { id: old.run.sessionId } },
      },
      old.next,
    ),
  ).toMatchObject({ kind: 'deny' })
})

test('native approvals cannot dispatch without committed audit or after the run deadline', async () => {
  const { gate, run, next } = await active('trusted')
  const exec = {
    name: 'pwsh',
    arguments: { command: 'rm a.txt', description: 'delete' },
    agent: { session: { id: run.sessionId } },
    token: Symbol(),
  }
  const ask = await gate.check(exec, next)
  if (ask.kind !== 'ask') throw Error('expected ask')
  expect(gate.guard(exec)).toBe('whaledot-approval-not-granted-or-audited')
  gate.approvalEvent(run.sessionId, {
    type: 'approval/asked',
    data: { id: 'deadline-ask', reason: ask.reason },
  } as SessionEvent)
  gate.approvalEvent(run.sessionId, {
    type: 'approval/decided',
    data: { id: 'deadline-ask', outcome: 'allowed-once' },
  } as SessionEvent)
  expect(gate.guard(exec)).toBeUndefined()
  try {
    vi.spyOn(Date, 'now').mockReturnValue(run.startedAt + run.runScope!.limits.maxRunMinutes * 60000)
    expect(gate.guard(exec)).toBe('whaledot-run-inactive')
  } finally {
    vi.restoreAllMocks()
  }
})

test('an admitted nested call retains its stop boundary after ephemeral lineage is cleared', async () => {
  const { gate, run, next, executor } = await active('trusted')
  const parent = Symbol(),
    root = 'root-call'
  await gate.check(
    {
      name: 'read',
      arguments: { file_path: 'a.txt' },
      agent: { session: { id: run.sessionId } },
      token: parent,
      rootCallId: root,
    },
    next,
  )
  const child = { name: 'read', arguments: { file_path: 'a.txt' }, parent, rootCallId: root, token: Symbol() }
  expect(await gate.check(child, next)).toEqual({ kind: 'allow' })
  executor.registry.close(run.sessionId)
  expect(gate.trackedEntries()).toBe(0)
  expect(gate.guard(child)).toBe('whaledot-run-inactive')
})
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
