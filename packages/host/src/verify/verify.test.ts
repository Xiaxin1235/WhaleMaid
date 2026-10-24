import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
import type { PeerScope } from '@deepseek-ai/dsh-client-connection'
import { RunSchema, deriveRunScope, DEFAULT_LIMITS } from '@whaledot/core'
import type { TaskKind, TaskState, Limits } from '@whaledot/core'
import { makeGoal, makeTask } from '../../../core/tests/fixtures.js'
import { WhaleStore, productionClock, productionIdGen, sha256 } from '../store/index.js'
import { ScopeService } from '../scope-service.js'
import { WorktreeManager } from '../execution/worktree.js'
import { TaskVerifier } from './verify-task.js'
import { VerificationRunner, verificationEnv, verificationBatch } from './runner.js'
import type { SessionObservation } from './reconcile.js'
import { observeSession } from './reconcile.js'
import type { Context } from '@deepseek-ai/cordis'

vi.setConfig({ testTimeout: 20000 })
const cleanups: (() => Promise<unknown> | void)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})
const owner = { principal: { kind: 'owner' }, signal: new AbortController().signal } as PeerScope
async function setup(
  options: {
    kind?: TaskKind
    before?: string
    after?: string
    commands?: string[]
    state?: TaskState
    limits?: Partial<Limits>
    tamper?: boolean
  } = {},
) {
  const dir = await mkdtemp(join(tmpdir(), 'whaledot-verify-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  const project = join(dir, 'project'),
    data = join(dir, 'data')
  await mkdir(project)
  await mkdir(data)
  const git = new WorktreeManager(data)
  await git.git(project, ['init'])
  await writeFile(join(project, 'value.txt'), options.before ?? 'bad')
  await writeFile(
    join(project, 'verify.mjs'),
    `import {readFileSync} from 'node:fs'; const good = readFileSync('value.txt','utf8') === 'good'; console.log(good ? 'Tests 2 passed (2)' : 'Tests 1 passed | 1 failed (2)'); process.exit(good ? 0 : 1)`,
  )
  await git.git(project, ['add', '-A'])
  await git.git(project, ['commit', '-m', 'baseline'])
  const original = await git.git(project, ['rev-parse', 'HEAD'])
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
      verifyCommands: options.commands ?? ['node verify.mjs'],
      permissionPreset: 'workspace-write',
      limits: { ...DEFAULT_LIMITS, ...options.limits },
    },
    owner,
  )
  const work = await git.prepare(goal)
  if (options.after !== undefined) await writeFile(join(work.path, 'value.txt'), options.after)
  if (options.tamper) await writeFile(join(work.path, 'a.test.ts'), 'it.skip("bad", () => {})')
  const cp = await git.checkpoint(work, 'progress')
  const task = makeTask('task_1', { kind: options.kind ?? 'edit' })
  store.tasks.insert(task)
  const move = (to: TaskState) => {
    const current = store.tasks.get(task.id)!
    const result = store.tasks.transition(task.id, to, {
      expectedVersion: current.version,
      source: 'fixture',
      reason: 'fixture',
    })
    if (!result.ok) throw new Error(result.error.code)
  }
  move('READY')
  move('RUNNING')
  move(options.state ?? 'VERIFYING')
  const run = RunSchema.parse({
    run_id: 'run_1',
    taskId: task.id,
    sessionId: 'session-verify',
    worktreePath: work.path,
    baseCommit: original,
    startedAt: 1,
    status: 'ended',
    reason: 'completed',
    runScope: deriveRunScope(scope, project, work.path, task.kind),
  })
  store.runs.insert(run)
  store.checkpoints.insert({
    id: 'checkpoint_1' as never,
    taskId: task.id,
    goalId: goal.id,
    commit: cp.commit,
    kind: 'progress',
    files: cp.files,
    diffStat: cp.diffStat,
    createdAt: Date.now(),
  })
  let observation: SessionObservation = {
    exists: true,
    running: false,
    finalReplyNonempty: true,
    endReason: 'completed',
  }
  const observe = vi.fn(async () => observation)
  const verifier = new TaskVerifier(store, scopes, data, observe, () => 'en')
  return {
    dir,
    project,
    data,
    git,
    store,
    goal,
    task,
    run,
    scope,
    scopes,
    verifier,
    original,
    cp,
    observe,
    setObservation: (value: SessionObservation) => {
      observation = value
    },
  }
}
test('independent baseline/current improvement, evidence logs, caching and detached worktree cleanup', async () => {
  const f = await setup({ after: 'good' })
  const report = await f.verifier.verifyTask(f.task.id)
  expect(report.judgment).toMatchObject({ verdict: 'PASS', progress: 'improved' })
  expect(report.baseline[0]?.status).toBe('failed')
  expect(report.current[0]?.status).toBe('passed')
  expect(f.store.tasks.get(f.task.id)?.state).toBe('SUCCEEDED')
  expect(f.store.evidence.list(f.run.run_id)).toHaveLength(3)
  expect((await f.verifier.logTail(f.run.run_id, 'current', 0)).tail).toContain('2 passed')
  const cached = await f.verifier.runner.baseline(
    f.project,
    f.original,
    ['node verify.mjs'],
    'run_other',
    1,
    () => {},
  )
  expect(cached[0]?.logPath).toBe(report.baseline[0]?.logPath)
  expect(await readdir(join(f.data, 'verification-worktrees'))).toEqual([])
  await writeFile(report.current[0]!.logPath!, 'modified')
  await expect(f.verifier.logTail(f.run.run_id, 'current', 0)).rejects.toThrow('evidence-log-changed')
})
test('report-only tasks need a real nonempty final response and no writes', async () => {
  const f = await setup({ kind: 'analyze', commands: [] })
  expect((await f.verifier.verifyTask(f.task.id)).judgment).toMatchObject({
    verdict: 'PASS',
    reasons: ['report-only'],
  })
  expect(f.store.tasks.get(f.task.id)?.state).toBe('SUCCEEDED')
})
test('tampering never executes acceptance code or automatically retries; choices are persisted, bound and single-use', async () => {
  const f = await setup({ after: 'good', tamper: true })
  const command = vi.spyOn(f.verifier.runner, 'command')
  const report = await f.verifier.verifyTask(f.task.id)
  expect(report.judgment.reasons).toContain('acceptance-tampering')
  expect(command).not.toHaveBeenCalled()
  const notification = f.store.notifications.list()[0]!
  expect(notification.deliveredAt).toBeUndefined()
  expect(f.store.suggestions.list()).toHaveLength(7)
  expect(f.store.tasks.get(f.task.id)?.attempts).toBe(0)
  expect((await f.verifier.resolveDecision(notification.id, 'view-diff')).files).toContain('a.test.ts')
  const results = await Promise.allSettled([
    f.verifier.resolveDecision(notification.id, 'retry'),
    f.verifier.resolveDecision(notification.id, 'retry'),
  ])
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
  expect(f.store.tasks.get(f.task.id)).toMatchObject({ state: 'READY', attempts: 0 })
  expect(f.store.suggestions.list().every((item) => item.consumedAt !== undefined)).toBe(true)
})
test('regression preserves failed ref, rolls back only WhaleDot branch, and records bounded retry', async () => {
  const f = await setup({ before: 'good', after: 'bad' })
  const report = await f.verifier.verifyTask(f.task.id)
  expect(report.decision.taskOutcome).toBe('rollback-and-retry')
  expect(await f.git.git(f.run.worktreePath, ['rev-parse', 'refs/whaledot/failed/run_1'])).toBe(f.cp.commit)
  expect(await f.git.git(f.run.worktreePath, ['rev-parse', 'HEAD'])).toBe(f.original)
  expect(f.store.tasks.get(f.task.id)).toMatchObject({
    state: 'READY',
    attempts: 1,
    failureSummary: 'verification-regression',
  })
  expect(await f.git.git(f.project, ['rev-parse', 'HEAD'])).toBe(f.original)
  expect(await f.git.git(f.project, ['status', '--porcelain'])).toBe('')
  await f.git.git(f.run.worktreePath, ['checkout', '-b', 'user-branch'])
  await expect(f.verifier.rollback(f.run, f.task, f.original)).rejects.toThrow('not-whaledot-branch')
  await expect(
    f.verifier.rollback({ ...f.run, worktreePath: f.project }, f.task, f.original),
  ).rejects.toThrow('not-owned-worktree')
})
test('expired decisions and changed task versions cannot mutate; manual acceptance is explicitly sourced', async () => {
  const f = await setup({ after: 'good', commands: [] })
  await f.verifier.verifyTask(f.task.id)
  const notification = f.store.notifications.list()[0]!
  f.store.notifications.update({ ...notification, expiresAt: 0 })
  await expect(f.verifier.resolveDecision(notification.id, 'accept')).rejects.toThrow('decision-stale')
  f.store.notifications.update({ ...notification, taskVersion: 0 })
  await expect(f.verifier.resolveDecision(notification.id, 'accept')).rejects.toThrow('decision-stale')
  f.store.notifications.update(notification)
  await f.verifier.resolveDecision(notification.id, 'accept')
  expect(f.store.tasks.get(f.task.id)?.state).toBe('SUCCEEDED')
  expect(f.store.transitions.list(f.task.id).at(-1)).toMatchObject({
    source: 'user',
    reason: '用户人工接受，未经自动验收',
  })
})
test('UNKNOWN reconciliation neither resumes nor sends: running unchanged, stopped dirty checkpoint verified', async () => {
  const f = await setup({ kind: 'analyze', commands: [], state: 'UNKNOWN' })
  f.setObservation({ exists: true, running: true, finalReplyNonempty: false })
  expect((await f.verifier.reconcileTask(f.task.id)).state).toBe('running')
  expect(f.store.tasks.get(f.task.id)?.state).toBe('UNKNOWN')
  await writeFile(join(f.run.worktreePath, 'new.txt'), 'recovered write')
  f.setObservation({ exists: true, running: false, finalReplyNonempty: true })
  expect((await f.verifier.reconcileTask(f.task.id)).state).toBe('READY')
  expect(f.store.checkpoints.list(f.goal.id).some((cp) => cp.kind === 'reconciled')).toBe(true)
  expect(f.store.runs.all()).toHaveLength(1)
})
test('missing session plus inconsistent worktree blocks reconciliation', async () => {
  const f = await setup({ state: 'UNKNOWN' })
  f.setObservation({ exists: false, running: false, finalReplyNonempty: false })
  await f.git.git(f.run.worktreePath, ['checkout', '-b', 'external'])
  expect((await f.verifier.reconcileTask(f.task.id)).state).toBe('BLOCKED')
  expect(f.store.notifications.list()[0]?.kind).toBe('blocked')
})
test('revocation prevents verification commands, retains UNKNOWN, and never silently renews scope', async () => {
  const f = await setup({ after: 'good' })
  f.scopes.revoke(f.scope.id, owner)
  const command = vi.spyOn(f.verifier.runner, 'command')
  expect((await f.verifier.verifyTask(f.task.id)).judgment.verdict).toBe('UNKNOWN')
  expect(command).not.toHaveBeenCalled()
  expect(f.store.tasks.get(f.task.id)?.state).toBe('UNKNOWN')
})
test('environment allowlist, bounded logs, command classification and process-tree timeout', async () => {
  const f = await setup()
  const runner = new VerificationRunner(f.data)
  const previous = process.env.FAKE_API_KEY
  process.env.FAKE_API_KEY = 'never-inherit-me'
  try {
    await writeFile(
      join(f.project, 'env.mjs'),
      'console.log(JSON.stringify(process.env)); console.log("x".repeat(3*1024*1024)); console.log("Tests 2 passed (2)")',
    )
    const result = await runner.command(f.project, 'node env.mjs', 'run_env', '0', 1)
    expect(result.status).toBe('passed')
    const log = await readFile(result.logPath!, 'utf8')
    expect(Buffer.byteLength(log)).toBeLessThanOrEqual(2 * 1024 * 1024)
    expect(log).toContain('output truncated')
    expect(log).not.toContain('FAKE_API_KEY')
    expect(log).not.toContain('never-inherit-me')
    expect(log).toContain('"CI":"1"')
    const quoted = await runner.command(
      f.project,
      'node -e "console.log(JSON.stringify(process.argv.slice(1)))" "two words"',
      'run_quotes',
      '0',
      1,
    )
    expect(quoted.status).toBe('passed')
    expect(quoted.tail).toContain('["two words"]')
    const oldLog = await readFile(quoted.logPath!, 'utf8')
    const repeated = await runner.command(
      f.project,
      'node -e "console.log(JSON.stringify(process.argv.slice(1)))" "two words"',
      'run_quotes',
      '0',
      1,
    )
    expect(repeated.logPath).not.toBe(quoted.logPath)
    expect(await readFile(quoted.logPath!, 'utf8')).toBe(oldLog)
    expect(verificationEnv({ PATH: 'ok', SECRET: 'bad', ProgramFiles_TOKEN: 'bad' })).toEqual({
      PATH: 'ok',
      CI: '1',
    })
    await expect(runner.command(f.project, 'git reset --hard', 'run_env', '1', 1)).rejects.toThrow(
      'command-forbidden',
    )
    await writeFile(
      join(f.project, 'timeout.mjs'),
      `import {spawn} from 'node:child_process'; const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'}); console.log('CHILD='+child.pid); setInterval(()=>{},1000)`,
    )
    const timeout = await runner.command(f.project, 'node timeout.mjs', 'run_timeout', '0', 0.015)
    expect(timeout.status).toBe('timeout')
    const pid = Number(/CHILD=(\d+)/.exec(timeout.tail ?? '')?.[1])
    expect(pid).toBeGreaterThan(0)
    expect(() => process.kill(pid, 0)).toThrow()
  } finally {
    if (previous === undefined) delete process.env.FAKE_API_KEY
    else process.env.FAKE_API_KEY = previous
  }
})
test('global verification batches do not overlap', async () => {
  const order: string[] = []
  await Promise.all([
    verificationBatch(async () => {
      order.push('a')
      await new Promise((resolve) => setTimeout(resolve, 20))
      order.push('b')
    }),
    verificationBatch(async () => {
      order.push('c')
    }),
  ])
  expect(order).toEqual(['a', 'b', 'c'])
})

test('verification timeout produces UNKNOWN and reconciliation never resubmits execution', async () => {
  const f = await setup({
    after: 'good',
    commands: ['node -e "setInterval(()=>{},1000)"'],
    limits: { maxRunMinutes: 0.002 },
  })
  const report = await f.verifier.verifyTask(f.task.id)
  expect(report.baseline[0]?.status).toBe('timeout')
  expect(report.current[0]?.status).toBe('timeout')
  expect(report.judgment.verdict).toBe('UNKNOWN')
  expect(f.store.tasks.get(f.task.id)?.state).toBe('UNKNOWN')
  f.setObservation({ exists: true, running: true, finalReplyNonempty: true })
  await f.verifier.reconcileTask(f.task.id)
  expect(f.store.runs.all()).toHaveLength(1)
})

test('unchanged failing commands retry with summary; exhausted budget and stalls ask the owner', async () => {
  const f = await setup({ after: 'different-bad' })
  const report = await f.verifier.verifyTask(f.task.id)
  expect(report.decision.taskOutcome).toBe('retry')
  expect(f.store.tasks.get(f.task.id)).toMatchObject({
    state: 'READY',
    attempts: 1,
    failureSummary: 'verification-still-failing',
  })
  const g = await setup({
    kind: 'edit',
    before: 'good',
    after: 'still-good',
    commands: ['node -e "process.exit(0)"'],
  })
  const goal = g.store.goals.get(g.goal.id)!
  g.store.goals.update({ ...goal, stalled: 2, version: goal.version + 1 }, goal.version)
  expect((await g.verifier.verifyTask(g.task.id)).decision.goalAction).toBe('pause')
  expect(g.store.tasks.get(g.task.id)?.state).toBe('SUCCEEDED')
  expect(g.store.notifications.list()[0]?.taskId).toBeUndefined()
  expect(g.store.goals.get(g.goal.id)?.status).toBe('paused')
  expect(g.store.notifications.list()[0]?.reason).toContain('stalled')
  await g.verifier.resolveDecision(g.store.notifications.list()[0]!.id, 'resume-goal')
  expect(g.store.goals.get(g.goal.id)).toMatchObject({ status: 'active', stalled: 0 })
  expect(g.store.tasks.get(g.task.id)?.state).toBe('SUCCEEDED')
})

test('owner rollback preserves evidence and does not consume automatic repair budget', async () => {
  const f = await setup({ after: 'good', commands: [] })
  await f.verifier.verifyTask(f.task.id)
  const notification = f.store.notifications.list()[0]!
  await f.verifier.resolveDecision(notification.id, 'rollback')
  expect(await f.git.git(f.run.worktreePath, ['rev-parse', 'HEAD'])).toBe(f.original)
  expect(await f.git.git(f.run.worktreePath, ['rev-parse', 'refs/whaledot/failed/run_1'])).toBe(f.cp.commit)
  expect(f.store.tasks.get(f.task.id)).toMatchObject({ state: 'READY', attempts: 0 })
})

test('cold observation reads the originating turn, excludes tool requests and never activates an Agent', async () => {
  const inspect = vi.fn(async () => ({
    events: [
      {
        seq: 1,
        type: 'assistant/message',
        data: { message: { content: [{ type: 'text', text: 'I will inspect' }, { type: 'tool-call' }] } },
      },
      { seq: 2, type: 'turn/end', data: { reason: { kind: 'interrupted' } } },
      {
        seq: 3,
        type: 'assistant/message',
        data: { message: { content: [{ type: 'text', text: 'Unrelated later reply' }] } },
      },
    ],
  }))
  const activate = vi.fn()
  const ctx = {
    get: (key: string) =>
      key === 'agents'
        ? { get: () => ({ status: 'idle' }), resume: activate }
        : { inspect, prompt: activate, resolveAgent: activate },
  } as unknown as Context
  expect(await observeSession(ctx)('session-1')).toMatchObject({
    exists: true,
    running: false,
    finalReplyNonempty: false,
    endReason: 'interrupted',
  })
  expect(activate).not.toHaveBeenCalled()
  inspect.mockRejectedValueOnce(new Error('storage IO failure'))
  await expect(observeSession(ctx)('session-1')).rejects.toThrow('storage IO failure')
})

test('unreadable final report remains UNKNOWN rather than being treated as an empty report', async () => {
  const f = await setup({ kind: 'analyze', commands: [] })
  f.observe.mockRejectedValueOnce(new Error('storage IO failure'))
  expect((await f.verifier.verifyTask(f.task.id)).judgment).toMatchObject({
    verdict: 'UNKNOWN',
    reasons: ['session-observation-unavailable'],
  })
  expect(f.store.tasks.get(f.task.id)?.state).toBe('UNKNOWN')
})

test('two consecutive unknown verifications stop the reconcile loop until explicit retry', async () => {
  const f = await setup({
    after: 'good',
    commands: ['node -e "setInterval(()=>{},1000)"'],
    limits: { maxRunMinutes: 0.002 },
  })
  await f.verifier.verifyTask(f.task.id)
  expect(f.store.tasks.get(f.task.id)).toMatchObject({ state: 'UNKNOWN', unknownVerifications: 1 })
  await f.verifier.reconcileTask(f.task.id)
  expect(f.store.tasks.get(f.task.id)).toMatchObject({ state: 'WAITING_APPROVAL', unknownVerifications: 2 })
  const n = f.store.notifications.list()[0]!
  expect(n.choices).toEqual(['verify', 'accept', 'pause-goal', 'abandon', 'change-direction'])
  await expect(f.verifier.reconcileTask(f.task.id)).rejects.toThrow('task-not-unknown')
  await f.verifier.resolveDecision(n.id, 'verify')
  expect(f.store.tasks.get(f.task.id)).toMatchObject({ state: 'VERIFYING', unknownVerifications: 0 })
})
