import { localDay } from '../autopilot/day.js'
import { verificationBusy } from '../verify/runner.js'
import { createHash } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import {
  GoalIdSchema,
  RunIdSchema,
  RunSchema,
  CheckpointIdSchema,
  EvidenceIdSchema,
  readyTasks,
  selectNextTask,
  deriveRunScope,
  buildTaskPrompt,
  runEndToTaskState,
  normalizeScopePath,
} from '@whalemaid/core'
import type { GoalId, Run, RunId, Locale, Task } from '@whalemaid/core'
import type { WhaleStore } from '../store/index.js'
import { productionIdGen } from '../store/index.js'
import type { ScopeService } from '../scope-service.js'
import { RunTracker } from '../bridge/run-tracker.js'
import type { RunState } from '../bridge/run-tracker.js'
import type { RunSignal } from '../bridge/session-events.js'
import { RunRegistry } from './registry.js'
import { WorktreeManager } from './worktree.js'
import type { DshRunner, ExecutionVia } from './dsh-runner.js'
import type { ObserveSession } from '../verify/reconcile.js'

/** Manually dispatch one task. Durable delivery, tool policy, and finalization share one registry. */
export class TaskExecutor {
  readonly registry: RunRegistry
  readonly tracker: RunTracker
  readonly worktrees: WorktreeManager
  private readonly locks = new Set<string>()
  private readonly projectLocks = new Set<string>()
  private readonly timers = new Map<RunId, ReturnType<typeof setTimeout>>()
  private readonly finishing = new Set<RunId>()
  private readonly finalizations = new Set<Promise<void>>()
  private admission: (via: ExecutionVia, ownRun?: RunId) => boolean = () => true
  /** Install the host-wide model-capacity boundary for manual and background launches alike. */
  setAdmission(admit: (via: ExecutionVia, ownRun?: RunId) => boolean): void {
    this.admission = admit
  }
  private disposed = false
  constructor(
    readonly store: WhaleStore,
    private readonly scopes: ScopeService,
    private readonly runner: DshRunner,
    dataDir: string,
    private readonly locale: () => Locale,
    private readonly log: (message: string, error?: unknown) => void,
    private readonly observe?: ObserveSession,
  ) {
    this.registry = new RunRegistry(store)
    this.worktrees = new WorktreeManager(dataDir)
    this.tracker = new RunTracker({ now: () => Date.now() }, (run) => {
      this.finalize(run)
    })
    if (store.status().state === 'ok') this.registry.recover()
  }
  /** Feed only normalized session lifecycle signals to the owned-run tracker. */
  accept(signal: RunSignal): void {
    this.tracker.accept(signal)
  }
  /** Dispatch at most one eligible task after authorization and worktree preflight. */
  async executeNextTask(
    input: GoalId,
    via: ExecutionVia,
    admit: (ownRun?: RunId) => boolean = () => true,
  ): Promise<{ started: boolean; reason: string; runId?: RunId }> {
    const goalId = GoalIdSchema.parse(input)
    if (this.disposed) throw new Error('executor-disposed')
    if (!admit()) return { started: false, reason: 'autopilot-stopped' }
    if (!this.admission(via)) return { started: false, reason: 'capacity-busy' }
    if (verificationBusy()) return { started: false, reason: 'verification-busy' }
    if (this.locks.has(goalId)) return { started: false, reason: 'run-already-active' }
    this.locks.add(goalId)
    let projectLock: string | undefined
    let selected: Task | undefined, registered: Run | undefined
    try {
      const goal = this.store.goals.get(goalId)
      if (this.store.paused()) return { started: false, reason: 'globally-paused' }
      if (!goal || goal.status !== 'active') return { started: false, reason: 'goal-not-active' }
      const scope = this.scopes.activeScopeFor(goalId)
      if (!scope) return { started: false, reason: 'no-active-scope' }
      if (
        this.store.runs
          .all()
          .some((run) => run.status === 'running' && this.store.tasks.get(run.taskId)?.goalId === goalId)
      )
        return { started: false, reason: 'run-already-active' }
      for (const task of readyTasks(this.store.tasks.list(goalId)))
        this.registry.transition(task, 'READY', 'dependencies-satisfied')
      const inProject = this.store.goals
        .list()
        .filter(
          (item) =>
            (normalizeScopePath(item.projectRoot) ?? item.projectRoot) ===
            (normalizeScopePath(goal.projectRoot) ?? goal.projectRoot),
        )
        .flatMap((item) => this.store.tasks.list(item.id))
      const choice = selectNextTask(goal, this.store.tasks.list(goalId), inProject, scope.limits)
      if (!choice.task) return { started: false, reason: choice.reason }
      if (!['analyze', 'research'].includes(choice.task.kind)) {
        const key = normalizeScopePath(goal.projectRoot) ?? goal.projectRoot
        if (this.projectLocks.has(key)) return { started: false, reason: 'write-slot-busy' }
        this.projectLocks.add(key)
        projectLock = key
      }
      selected = choice.task
      if (
        this.store.runs
          .all()
          .filter(
            (run) =>
              localDay(run.startedAt) === localDay(Date.now()) &&
              this.store.tasks.get(run.taskId)?.goalId === goalId,
          ).length >= scope.limits.maxRunsPerDay
      )
        throw new Error('daily-run-limit')
      const checkpoints = this.store.checkpoints.list(goalId)
      const expected = checkpoints.at(-1)?.commit
      const workspace = await this.worktrees.prepare(goal, expected)
      if (
        !workspace.git &&
        (scope.permissionPreset !== 'read-only' || !['analyze', 'research'].includes(selected.kind))
      )
        throw new Error('non-git-read-only-required')
      if (workspace.git && !expected)
        this.store.checkpoints.insert({
          id: CheckpointIdSchema.parse(productionIdGen.next('checkpoint')),
          goalId,
          taskId: selected.id,
          commit: workspace.baseCommit,
          kind: 'baseline',
          createdAt: Date.now(),
          files: [],
          diffStat: '',
        })
      const runScope = deriveRunScope(
        scope,
        await realpath(goal.projectRoot),
        await realpath(workspace.path),
        selected.kind,
      )
      const runId = RunIdSchema.parse(productionIdGen.next('run'))
      const task = selected
      await this.runner.launch({
        cwd: workspace.path,
        preset: runScope.permissionPreset,
        title: `[WhaleMaid] ${goal.title} · ${task.title}`,
        prompt: buildTaskPrompt(
          goal,
          task,
          runScope,
          this.locale(),
          this.store.userNotes.list(goal.id).map((n) => n.text),
        ),
        via,
        check: () => {
          if (
            !this.admission(via, registered?.run_id) ||
            !admit(registered?.run_id) ||
            this.disposed ||
            this.store.paused() ||
            this.store.goals.get(goalId)?.status !== 'active' ||
            this.scopes.activeScopeFor(goalId)?.hash !== scope.hash
          )
            throw new Error('authorization-changed-before-send')
        },
        register: (sessionId) => {
          const run = RunSchema.parse({
            run_id: runId,
            taskId: task.id,
            sessionId,
            worktreePath: workspace.path,
            baseCommit: workspace.baseCommit,
            startedAt: Date.now(),
            status: 'running',
            runScope,
          })
          this.store.transaction(() => {
            this.registry.register(run)
            this.registry.transition(task, 'RUNNING', 'session-registered-before-send', runId)
          })
          registered = run
          this.tracker.watch(sessionId, runId)
          const timer = setTimeout(() => this.abort(run, 'run-timeout'), scope.limits.maxRunMinutes * 60000)
          timer.unref()
          this.timers.set(runId, timer)
        },
      })
      return { started: true, reason: 'started', runId }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'execution-error'
      if (registered) this.abort(registered, 'delivery-or-launch-unknown')
      else if (selected && !['authorization-changed-before-send', 'autopilot-stopped'].includes(reason)) {
        const task = this.store.tasks.get(selected.id)
        if (task?.state === 'READY') this.registry.transition(task, 'BLOCKED', reason)
      }
      return { started: false, reason }
    } finally {
      this.locks.delete(goalId)
      if (projectLock) this.projectLocks.delete(projectLock)
    }
  }
  /** Immediately close the gate and request cancellation for a revoked grant. */
  revoke(scopeId: string): void {
    for (const run of this.store.status().state === 'ok' ? this.store.runs.all() : [])
      if (run.status === 'running' && run.runScope?.originScopeId === scopeId)
        this.abort(run, 'scope-revoked')
  }
  /** Reuse abort/gate closure, then require runtime termination before owner cancellation is final. */
  async stopGoal(goalId: GoalId): Promise<void> {
    const tasks = this.store.tasks.list(goalId)
    const runs = this.store.runs
      .all()
      .filter((r) => r.status === 'running' && tasks.some((t) => t.id === r.taskId))
    for (const run of runs) this.abort(run, 'owner-goal-decision')
    const deadline = Date.now() + 6000
    while (
      runs.some((r) => this.store.runs.get(r.run_id)?.status === 'running' || this.finishing.has(r.run_id))
    ) {
      if (Date.now() >= deadline) throw Error('goal-stop-unconfirmed')
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    for (const run of runs) {
      const observation = await this.observe?.(run.sessionId)
      if (!observation?.exists || observation.running || !observation.endReason)
        throw Error('goal-stop-unconfirmed')
    }
  }
  private abort(run: Run, reason: string): void {
    const current = this.store.runs.get(run.run_id)
    if (!current || current.status !== 'running') return
    // Close the gate synchronously before cancel; turn/end may arrive during cancellation.
    this.registry.close(run.sessionId)
    this.store.runs.update({ ...current, reason })
    try {
      this.runner.cancel(run.sessionId)
    } catch (error) {
      this.log('session cancellation failed', error)
    }
    // Wait for actual turn/end before checkpointing, so a cancelled tool can settle first.
    // If no terminal event arrives, mark UNKNOWN without staging potentially live writes.
    if (this.store.runs.get(run.run_id)?.status === 'running') {
      clearTimeout(this.timers.get(run.run_id))
      const timer = setTimeout(() => {
        this.tracker.unwatch(run.sessionId)
        this.finalize(
          {
            runId: run.run_id,
            sessionId: run.sessionId,
            status: 'ended',
            endReason: 'unknown',
            endSource: 'turn-end',
            toolCalls: run.toolCalls,
            startedAt: run.startedAt,
            endedAt: Date.now(),
          },
          reason,
        )
      }, 5000)
      timer.unref()
      this.timers.set(run.run_id, timer)
    }
  }
  private finalize(state: Readonly<RunState>, forcedReason?: string): void {
    const pending = this.finish(state, forcedReason)
      .catch((error) => this.log('run finalization failed', error))
      .finally(() => this.finalizations.delete(pending))
    this.finalizations.add(pending)
  }
  private async finish(state: Readonly<RunState>, forcedReason?: string): Promise<void> {
    const id = RunIdSchema.parse(state.runId)
    if (this.finishing.has(id) || this.disposed) return
    let run = this.store.runs.get(id)
    if (!run || run.status !== 'running') return
    this.registry.close(run.sessionId)
    this.finishing.add(id)
    clearTimeout(this.timers.get(id))
    this.timers.delete(id)
    // Deny follow-up/wakeup tools immediately. Preserve running until evidence is finalized so restart recovers it.
    this.store.runs.update({ ...run, reason: forcedReason ?? run.reason ?? 'finalizing' })
    try {
      const task = this.store.tasks.get(run.taskId)!
      let result = runEndToTaskState({
        ...state,
        reason: forcedReason ?? (run.reason === 'finalizing' ? undefined : run.reason),
      })
      try {
        if (forcedReason) throw new Error('cancellation-not-settled')
        const checkpoint = await this.worktrees.checkpoint(
          { path: run.worktreePath, baseCommit: run.baseCommit, git: run.baseCommit !== 'non-git' },
          `WhaleMaid ${task.goalId} ${task.id} ${id}`,
        )
        if (this.store.status().state !== 'ok') return
        if (checkpoint.changed)
          this.store.checkpoints.insert({
            id: CheckpointIdSchema.parse(productionIdGen.next('checkpoint')),
            goalId: task.goalId,
            taskId: task.id,
            commit: checkpoint.commit,
            kind: 'progress',
            createdAt: Date.now(),
            files: checkpoint.files,
            diffStat: checkpoint.diffStat,
          })
        const summary = JSON.stringify({
          commit: checkpoint.commit,
          files: checkpoint.files,
          diffStat: checkpoint.diffStat,
        })
        this.store.evidence.insert({
          id: EvidenceIdSchema.parse(productionIdGen.next('evidence')),
          runId: id,
          kind: 'diff',
          summary,
          hash: createHash('sha256').update(summary).digest('hex'),
          verdict: 'UNKNOWN',
        })
        if (checkpoint.files.length > (run.runScope?.limits.maxChangedFilesPerTask ?? 0))
          result = { state: 'BLOCKED', reason: 'changed-file-limit-exceeded' }
      } catch (error) {
        result = { state: 'UNKNOWN', reason: forcedReason ?? 'checkpoint-failed' }
        this.log('checkpoint failed', error)
      }
      if (this.store.status().state !== 'ok') return
      // Revocation may race an asynchronous git commit; it always wins over completed.
      run = this.store.runs.get(id)!
      if (run.reason && run.reason !== 'finalizing') result = { state: 'UNKNOWN', reason: run.reason }
      this.store.transaction(() => {
        const currentTask = this.store.tasks.get(run!.taskId)
        if (currentTask?.state === 'RUNNING') {
          if (result.state === 'BLOCKED') {
            this.registry.transition(currentTask, 'VERIFYING', 'execution-evidence-collected', id)
            this.registry.transition(this.store.tasks.get(currentTask.id)!, 'BLOCKED', result.reason, id)
          } else this.registry.transition(currentTask, result.state, result.reason, id)
        }
        this.store.runs.update({
          ...run!,
          status: 'ended',
          endedAt: Date.now(),
          outcome: result.state === 'FAILED' ? 'FAIL' : 'UNKNOWN',
          reason: result.reason,
        })
      })
      this.tracker.unwatch(state.sessionId)
    } finally {
      this.finishing.delete(id)
    }
  }
  /** Unload stops local scheduling and requests cancellation. Durable running rows remain for restart reconciliation. */
  async dispose(): Promise<void> {
    this.disposed = true
    for (const timer of this.timers.values()) clearTimeout(timer)
    for (const run of this.store.status().state === 'ok' ? this.store.runs.all() : [])
      if (run.status === 'running') {
        this.registry.close(run.sessionId)
        try {
          this.runner.cancel(run.sessionId)
        } catch {
          /* restart reconciliation retains UNKNOWN */
        }
      }
    this.timers.clear()
    let deadline: ReturnType<typeof setTimeout> | undefined
    await Promise.race([
      Promise.allSettled([...this.finalizations]),
      new Promise<void>((resolve) => {
        deadline = setTimeout(resolve, 5000)
      }),
    ])
    clearTimeout(deadline)
  }
}
