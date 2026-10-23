import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
import type { PeerScope } from '@deepseek-ai/dsh-client-connection'
import { RunSchema, TaskIdSchema, decideNext, DEFAULT_LIMITS } from '@whaledot/core'
import type { Limits, Task, Judgment } from '@whaledot/core'
import { makeGoal, makeTask } from '../../../core/tests/fixtures.js'
import { WhaleStore, productionClock, productionIdGen, sha256 } from '../store/index.js'
import { ScopeService } from '../scope-service.js'
import { RunRegistry } from '../execution/registry.js'
import { AutopilotScheduler } from './scheduler.js'
import type { SchedulerPorts } from './scheduler.js'
import { exportTrace } from './trace.js'
import { goalNotice } from '../goal-notices.js'

const cleanups: (() => void | Promise<unknown>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
  vi.useRealTimers()
})
const owner = { principal: { kind: 'owner' }, signal: new AbortController().signal } as PeerScope
async function fixture(
  options: {
    limits?: Partial<Limits>
    mode?: 'suggest' | 'autonomous' | 'high'
    start?: boolean
    chain?: boolean
    autoFinish?: boolean
  } = {},
) {
  const dir = await mkdtemp(join(tmpdir(), 'whaledot-scheduler-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
  vi.setSystemTime(new Date('2026-10-22T12:00:00'))
  let store = new WhaleStore(dir, { log: vi.fn() })
  cleanups.push(() => store.close())
  const goal = makeGoal({
    projectRoot: dir,
    mode: options.mode ?? 'autonomous',
    autopilot: { enabled: true },
  })
  store.goals.insert(goal)
  const grant = (db: WhaleStore) =>
    new ScopeService(db, {
      clock: productionClock,
      idGen: productionIdGen,
      hasher: sha256,
      log: vi.fn(),
      revoked: () => {},
    })
  let scopes = grant(store)
  const scope = scopes.grant(
    {
      goalId: goal.id,
      allowedPaths: [dir],
      protectedPaths: [],
      allowedActions: ['read-file', 'write-file', 'run-command'],
      forbiddenActions: [],
      verifyCommands: ['pnpm test'],
      permissionPreset: 'workspace-write',
      limits: { ...DEFAULT_LIMITS, ...options.limits },
    },
    owner,
  )
  const first = makeTask('task_a', { kind: options.chain ? 'analyze' : 'edit', createdAt: Date.now() })
  store.tasks.insert(first)
  if (options.chain) {
    store.tasks.insert(makeTask('task_b', { kind: 'edit', dependsOn: [first.id], createdAt: Date.now() + 1 }))
    store.tasks.insert(
      makeTask('task_c', {
        kind: 'test',
        dependsOn: [TaskIdSchema.parse('task_b')],
        createdAt: Date.now() + 2,
      }),
    )
  }
  const move = (task: Task, state: Task['state']) => {
    const result = store.tasks.transition(task.id, state, {
      expectedVersion: task.version,
      source: 'fake-port',
      reason: 'simulated',
    })
    if (!result.ok) throw Error(result.error.code)
    return result.value.task
  }
  const endTimers = new Set<ReturnType<typeof setTimeout>>()
  const sent = vi.fn(),
    verify = vi.fn(async (id: Task['id']) => {
      const task = store.tasks.get(id)!,
        run = store.runs.list(id).at(-1)!
      const judgment: Judgment = {
        verdict: 'PASS',
        progress: task.kind === 'analyze' ? 'neutral' : task.kind === 'edit' ? 'improved' : 'unchanged',
        reasons: ['fixture-verified'],
      }
      store.verifications.insert({
        id: run.run_id,
        taskId: id,
        checkpoint: 'fixture-commit',
        createdAt: Date.now(),
        baseline: [],
        current:
          task.kind === 'analyze'
            ? []
            : [
                {
                  command: 'pnpm test',
                  status: 'passed',
                  exitCode: 0,
                  counts: { passed: 3, failed: 0, skipped: 0 },
                },
              ],
        judgment,
        decision: decideNext({ judgment, attempts: 0, limits: scope.limits, stalled: 0, tampered: false }),
      })
      move(task, 'SUCCEEDED')
      return {}
    })
  const execute = vi.fn(async (_id: typeof goal.id, admit: () => boolean) => {
    if (!admit()) return { started: false, reason: 'autopilot-stopped' }
    const tasks = store.tasks.list(goal.id)
    const task = tasks.find(
      (task) =>
        ['PENDING', 'READY'].includes(task.state) &&
        task.dependsOn.every((id) => store.tasks.get(id)?.state === 'SUCCEEDED'),
    )!
    const ready = task.state === 'PENDING' ? move(task, 'READY') : task
    const running = move(ready, 'RUNNING')
    sent(running.id)
    const run = RunSchema.parse({
      run_id: productionIdGen.next('run'),
      taskId: running.id,
      sessionId: productionIdGen.next('session'),
      worktreePath: dir,
      baseCommit: 'fixture-commit',
      startedAt: Date.now(),
      status: 'running',
    })
    store.runs.insert(run)
    if (options.autoFinish !== false) {
      const timer = setTimeout(() => {
        endTimers.delete(timer)
        store.runs.update({
          ...store.runs.get(run.run_id)!,
          status: 'ended',
          endedAt: Date.now(),
          reason: 'completed',
        })
        move(store.tasks.get(running.id)!, 'VERIFYING')
      }, 100)
      endTimers.add(timer)
    }
    return { started: true, reason: 'started', runId: run.run_id }
  })
  const reconcile = vi.fn(async (id: Task['id']) => {
    move(store.tasks.get(id)!, 'VERIFYING')
    await verify(id)
    return { state: store.tasks.get(id)!.state }
  })
  const planner = {
    generate: vi.fn(
      async () => '```json\n{"status":"complete","reason":"All independent checks passed"}\n```',
    ),
  }
  const ports: SchedulerPorts = {
    execute,
    verify,
    reconcile,
    planner,
    stop: () => {
      for (const timer of endTimers) clearTimeout(timer)
      endTimers.clear()
    },
  }
  let scheduler = new AutopilotScheduler(store, scopes, ports, { locale: () => 'en', log: vi.fn() })
  cleanups.push(() => scheduler.dispose())
  if (options.start !== false) scheduler.start()
  return {
    dir,
    goal,
    scope,
    ports,
    sent,
    execute,
    verify,
    reconcile,
    planner,
    get store() {
      return store
    },
    get scopes() {
      return scopes
    },
    get scheduler() {
      return scheduler
    },
    move,
    restart: async () => {
      await scheduler.dispose()
      store.close()
      store = new WhaleStore(dir, { log: vi.fn() })
      scopes = grant(store)
      new RunRegistry(store).recover()
      scheduler = new AutopilotScheduler(store, scopes, ports, { locale: () => 'en', log: vi.fn() })
      scheduler.start()
    },
  }
}
test('three dependent stages execute and verify to completion without owner actions', async () => {
  const f = await fixture({ chain: true })
  await vi.advanceTimersByTimeAsync(15000)
  expect(f.sent.mock.calls.map(([id]) => id)).toEqual(['task_a', 'task_b', 'task_c'])
  expect(f.store.tasks.list(f.goal.id).every((t) => t.state === 'SUCCEEDED')).toBe(true)
  expect(f.store.goals.get(f.goal.id)).toMatchObject({ status: 'completed', autopilot: { enabled: false } })
  expect(f.planner.generate).toHaveBeenCalledOnce()
  const trace = exportTrace(f.store, f.goal.id)
  expect(trace.markdown).toContain('Scheduler events')
  expect(trace.markdown).toContain('session_')
  expect(trace.markdown).toContain('fixture-commit')
  expect(trace.markdown).toContain('fixture-verified')
})
test('100 triggers coalesce to one check and no duplicate send while a run is active', async () => {
  const f = await fixture({ autoFinish: false }),
    snapshot = vi.spyOn(f.scheduler, 'snapshot')
  for (let n = 0; n < 100; n++) f.scheduler.mark(f.goal.id)
  await vi.advanceTimersByTimeAsync(1001)
  expect(snapshot).toHaveBeenCalledOnce()
  expect(f.sent).toHaveBeenCalledOnce()
  for (let n = 0; n < 100; n++) f.scheduler.mark(f.goal.id)
  await vi.advanceTimersByTimeAsync(3000)
  expect(f.sent).toHaveBeenCalledOnce()
})
test('global pause stops new work while an admitted run may end; unpause resumes', async () => {
  const f = await fixture({ chain: true })
  await vi.advanceTimersByTimeAsync(1001)
  f.store.setPaused(true)
  await vi.advanceTimersByTimeAsync(7000)
  expect(f.sent).toHaveBeenCalledOnce()
  expect(f.store.tasks.list(f.goal.id)[0]?.state).toBe('VERIFYING')
  f.store.setPaused(false)
  await vi.advanceTimersByTimeAsync(15000)
  expect(f.sent).toHaveBeenCalledTimes(3)
})
test('pending decisions block advancement and a resolved decision wakes the goal', async () => {
  const f = await fixture()
  f.store.notifications.insert({
    id: 'notification_1' as never,
    goalId: f.goal.id,
    kind: 'decision',
    priority: 'high',
    dedupeKey: 'wait',
    createdAt: Date.now(),
    channel: 'panel',
  })
  await vi.advanceTimersByTimeAsync(5000)
  expect(f.sent).not.toHaveBeenCalled()
  f.store.notifications.update({
    ...f.store.notifications.get('notification_1')!,
    resolvedAt: Date.now(),
    resolvedChoice: 'retry',
  })
  await vi.advanceTimersByTimeAsync(10000)
  expect(f.sent).toHaveBeenCalledOnce()
})
test('a decision arriving during asynchronous preflight closes the final send boundary', async () => {
  const f = await fixture()
  let admitted: boolean | undefined
  f.execute.mockImplementationOnce(async (_id, admit) => {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    admitted = admit()
    return { started: false, reason: 'autopilot-stopped' }
  })
  await vi.advanceTimersByTimeAsync(1001)
  goalNotice(f.store, f.goal, 'planner-need-user: review', 'en')
  await vi.advanceTimersByTimeAsync(3000)
  expect(admitted).toBe(false)
  expect(f.sent).not.toHaveBeenCalled()
})

test('expired goal decisions are renewed without allowing execution around the owner', async () => {
  const f = await fixture()
  goalNotice(f.store, f.goal, 'planner-need-user: local service', 'en')
  const old = f.store.notifications.list()[0]!
  vi.setSystemTime(new Date(Date.now() + 86400001))
  await vi.advanceTimersByTimeAsync(3000)
  expect(f.sent).not.toHaveBeenCalled()
  expect(f.store.notifications.get(old.id)?.resolvedReason).toBe('expired')
  const pending = f.store.notifications.list().filter((n) => n.resolvedAt === undefined)
  expect(pending).toHaveLength(1)
  expect(pending[0]?.reason).toBe(old.reason)
  expect(pending[0]?.expiresAt).toBeGreaterThan(Date.now())
})

test('local daily run budget stops work and crossing midnight resumes without a rolling 24-hour hold', async () => {
  const f = await fixture({ chain: true, limits: { maxRunsPerDay: 1 } })
  await vi.advanceTimersByTimeAsync(10000)
  expect(f.sent).toHaveBeenCalledOnce()
  expect(f.store.tasks.list(f.goal.id)[0]?.state).toBe('SUCCEEDED')
  expect(f.store.autopilotEvents.list(f.goal.id).at(-1)?.reason).toBe('budget-exhausted')
  vi.setSystemTime(new Date('2026-10-23T00:01:00'))
  f.scheduler.mark(f.goal.id)
  await vi.advanceTimersByTimeAsync(7000)
  expect(f.sent).toHaveBeenCalledTimes(2)
})
test('restart recovers UNKNOWN, reconciles and verifies instead of resending a prompt', async () => {
  const f = await fixture({ autoFinish: false })
  await vi.advanceTimersByTimeAsync(1100)
  expect(f.sent).toHaveBeenCalledOnce()
  await f.restart()
  expect(f.store.tasks.list(f.goal.id)[0]?.state).toBe('UNKNOWN')
  await vi.advanceTimersByTimeAsync(10000)
  expect(f.reconcile).toHaveBeenCalledOnce()
  expect(f.sent).toHaveBeenCalledOnce()
  expect(f.store.runs.all()).toHaveLength(1)
  expect(f.store.tasks.list(f.goal.id)[0]?.state).toBe('SUCCEEDED')
})
test('revoked authorization and explicit opt-out prevent any new execution', async () => {
  const f = await fixture()
  f.scopes.revoke(f.scope.id, owner)
  await vi.advanceTimersByTimeAsync(5000)
  expect(f.sent).not.toHaveBeenCalled()
  expect(f.store.autopilotEvents.list(f.goal.id).at(-1)?.reason).toBe('no-scope')
  expect(() =>
    f.scheduler.setAutopilot({ goalId: f.goal.id, enabled: true, confirm: true, scopeHash: f.scope.hash }),
  ).toThrow('confirmation-required')
})
test('enabling requires exact confirmed scope; suggest mode never executes and deduplicates ready notice', async () => {
  const f = await fixture({ mode: 'suggest' })
  expect(() => f.scheduler.setAutopilot({ goalId: f.goal.id, enabled: true })).toThrow(
    'confirmation-required',
  )
  await vi.advanceTimersByTimeAsync(70000)
  expect(f.sent).not.toHaveBeenCalled()
  expect(f.store.notifications.list().filter((n) => n.kind === 'progress')).toHaveLength(1)
  f.scheduler.setAutopilot({ goalId: f.goal.id, enabled: false })
  await vi.advanceTimersByTimeAsync(5000)
  expect(f.store.goals.get(f.goal.id)?.autopilot.enabled).toBe(false)
})
test('unexpected action failure disables only that goal and records a blocked notice', async () => {
  const f = await fixture()
  f.execute.mockRejectedValueOnce(new Error('fixture-action-error'))
  await vi.advanceTimersByTimeAsync(5000)
  expect(f.store.goals.get(f.goal.id)?.autopilot).toMatchObject({
    enabled: false,
    disabledReason: 'fixture-action-error',
  })
  expect(f.store.notifications.list()[0]?.kind).toBe('blocked')
})
test('repeated rejected planner batches stall and pause instead of inventing endless work', async () => {
  const f = await fixture({ start: false })
  const task = f.store.tasks.list(f.goal.id)[0]!
  let t = f.move(task, 'READY')
  t = f.move(t, 'RUNNING')
  t = f.move(t, 'VERIFYING')
  f.move(t, 'SUCCEEDED')
  f.planner.generate.mockResolvedValue(
    '```json\n{"status":"continue","tasks":[{"title":"task_a","kind":"edit","dependsOn":[]}]}\n```',
  )
  f.scheduler.start()
  await vi.advanceTimersByTimeAsync(15000)
  expect(f.planner.generate).toHaveBeenCalledTimes(3)
  expect(f.store.goals.get(f.goal.id)).toMatchObject({ status: 'paused', stalled: 3 })
  expect(f.store.notifications.list()[0]?.reason).toBe('stalled')
  await vi.advanceTimersByTimeAsync(120000)
  expect(f.planner.generate).toHaveBeenCalledTimes(3)
})
test('planner need-user blocks; transient planner failure consumes daily budget without immediate retry', async () => {
  const f = await fixture({ start: false })
  let t = f.move(f.store.tasks.list(f.goal.id)[0]!, 'READY')
  t = f.move(t, 'RUNNING')
  t = f.move(t, 'VERIFYING')
  f.move(t, 'SUCCEEDED')
  f.planner.generate.mockRejectedValueOnce(new Error('model-unavailable'))
  f.scheduler.start()
  await vi.advanceTimersByTimeAsync(10000)
  expect(f.planner.generate).toHaveBeenCalledOnce()
  expect(f.store.plannerState.get(f.goal.id)?.calls).toBe(1)
  f.planner.generate.mockResolvedValue('```json\n{"status":"need-user","question":"Need local service"}\n```')
  await vi.advanceTimersByTimeAsync(61000)
  expect(f.planner.generate).toHaveBeenCalledTimes(2)
  expect(f.store.notifications.list()[0]?.reason).toContain('planner-need-user')
})
test('unload aborts an in-flight tool-free planner and leaves no timer-driven work', async () => {
  const f = await fixture({ start: false })
  let t = f.move(f.store.tasks.list(f.goal.id)[0]!, 'READY')
  t = f.move(t, 'RUNNING')
  t = f.move(t, 'VERIFYING')
  f.move(t, 'SUCCEEDED')
  f.ports.planner.generate = vi.fn(
    (_prompt, signal) =>
      new Promise<string>((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
      ),
  )
  f.scheduler.start()
  await vi.advanceTimersByTimeAsync(1100)
  expect(f.store.plannerState.get(f.goal.id)?.calls).toBe(1)
  await f.scheduler.dispose()
  const events = f.store.autopilotEvents.list(f.goal.id).length
  await vi.advanceTimersByTimeAsync(180000)
  expect(f.store.autopilotEvents.list(f.goal.id)).toHaveLength(events)
})
