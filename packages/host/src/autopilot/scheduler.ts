import {
  planTick,
  buildPlannerPrompt,
  parsePlannerResponse,
  mergePlannerTasks,
  GoalIdSchema,
} from '@whaledot/core'
import type {
  GoalId,
  TaskId,
  RunId,
  TickSnapshot,
  ProjectGoal,
  Locale,
  Clock,
  IdGen,
  PlannerState,
  AuthorizationScope,
} from '@whaledot/core'
import type { WhaleStore } from '../store/index.js'
import { productionClock, productionIdGen } from '../store/index.js'
import type { ScopeService } from '../scope-service.js'
import type { DraftModel } from '../goal-intake/model.js'
import { verificationBusy } from '../verify/runner.js'
import { goalNotice } from '../goal-notices.js'
import { localDay } from './day.js'

export interface SchedulerPorts {
  execute(
    goalId: GoalId,
    admit: (ownRun?: RunId) => boolean,
  ): Promise<{ started: boolean; reason: string; runId?: RunId }>
  verify(taskId: TaskId): Promise<unknown>
  reconcile(taskId: TaskId): Promise<{ state: string }>
  requestDecision?(taskId: TaskId): void
  planner: DraftModel
  stop?(): void
}
export interface SchedulerOptions {
  maxConcurrentRuns?: number
  clock?: Clock
  idGen?: IdGen
  locale: () => Locale
  debounceMs?: number
  scanMs?: number
  plannerTimeoutMs?: number
  day?: (at: number) => string
  log: (message: string, error?: unknown) => void
}
/** Coordinate bounded, opt-in actions; project operations live exclusively in executor/verifier ports. */
export class AutopilotScheduler {
  private readonly clock: Clock
  private readonly ids: IdGen
  private readonly day: (at: number) => string
  private readonly timers = new Map<GoalId, ReturnType<typeof setTimeout>>()
  private readonly active = new Map<GoalId, Promise<void>>()
  private readonly dirty = new Set<GoalId>()
  private readonly controllers = new Set<AbortController>()
  private modelSlots = 0
  private verificationSlot = false
  private interval: ReturnType<typeof setInterval> | undefined
  private stopWatch: (() => void) | undefined
  private stopped = true
  constructor(
    readonly store: WhaleStore,
    private readonly scopes: Pick<ScopeService, 'activeScopeFor'>,
    private readonly ports: SchedulerPorts,
    private readonly options: SchedulerOptions,
  ) {
    this.clock = options.clock ?? productionClock
    this.ids = options.idGen ?? productionIdGen
    this.day = options.day ?? localDay
  }
  /** Start only after recovery and host subscriptions are ready; startup queues one current-state check. */
  start(): void {
    if (!this.stopped || this.store.status().state !== 'ok') return
    this.stopped = false
    this.stopWatch = this.store.watchChanges(() => this.markAll())
    this.interval = setInterval(() => this.markAll(), this.options.scanMs ?? 60000)
    this.interval.unref()
    this.markAll()
  }
  /** Coalesce triggers without storing or replaying missed timers. */
  mark(goalId: GoalId): void {
    if (this.stopped) return
    if (this.active.has(goalId)) {
      this.dirty.add(goalId)
      return
    }
    clearTimeout(this.timers.get(goalId))
    const timer = setTimeout(() => {
      this.timers.delete(goalId)
      const action = this.check(goalId)
        .catch((error) => this.disable(goalId, error))
        .finally(() => {
          this.active.delete(goalId)
          if (this.dirty.delete(goalId)) this.mark(goalId)
        })
      this.active.set(goalId, action)
    }, this.options.debounceMs ?? 1000)
    timer.unref()
    this.timers.set(goalId, timer)
  }
  /** Wake enabled goals after state changes, including another goal releasing project/global capacity. */
  markAll(): void {
    if (this.stopped || this.store.status().state !== 'ok') return
    for (const goal of this.store.goals.list()) if (goal.autopilot.enabled) this.mark(goal.id)
  }
  /** Recheck controls at the final execution boundary, even after asynchronous worktree preparation. */
  canExecute(goalId: GoalId, ownRun?: RunId): boolean {
    const goal = this.store.goals.get(goalId)
    return (
      !this.stopped &&
      !this.store.paused() &&
      goal?.status === 'active' &&
      goal.autopilot.enabled &&
      goal.mode !== 'suggest' &&
      !!this.scopes.activeScopeFor(goalId) &&
      !this.store.notifications
        .list()
        .some(
          (notice) =>
            notice.goalId === goalId &&
            ['decision', 'blocked'].includes(notice.kind) &&
            notice.resolvedAt === undefined,
        ) &&
      this.store.runs.all().filter((run) => run.status === 'running' && run.run_id !== ownRun).length <
        (this.options.maxConcurrentRuns ?? 1)
    )
  }
  /** Count in-flight model admissions as well as durable runs while asynchronous preflight is pending. */
  hasCapacity(ownRun?: RunId, ownReservation = false): boolean {
    return (
      !this.stopped &&
      this.store.runs.all().filter((r) => r.status === 'running' && r.run_id !== ownRun).length +
        this.modelSlots -
        (ownReservation ? 1 : 0) <
        (this.options.maxConcurrentRuns ?? 1)
    )
  }
  /** Explicit owner confirmation binds enabling to the scope that was shown in the panel. */
  setAutopilot(input: {
    goalId: GoalId
    enabled: boolean
    confirm?: boolean | undefined
    scopeHash?: string | undefined
  }): ProjectGoal {
    const id = GoalIdSchema.parse(input.goalId),
      goal = this.store.goals.get(id),
      scope = this.scopes.activeScopeFor(id)
    if (!goal) throw new Error('goal-not-found')
    if (
      input.enabled &&
      (!input.confirm || !scope || input.scopeHash !== scope.hash || goal.status !== 'active')
    )
      throw new Error('autopilot-confirmation-required')
    const next = {
      ...goal,
      autopilot: input.enabled
        ? { enabled: true, enabledAt: this.clock.now() }
        : { ...goal.autopilot, enabled: false, disabledReason: 'user-stopped' },
      version: goal.version + 1,
    }
    this.store.transaction(() => {
      this.store.goals.update(next, goal.version)
      this.event(id, input.enabled ? 'enabled' : 'disabled', 'user')
    })
    this.mark(id)
    return next
  }
  /** Build one detached snapshot; daily counters use local calendar dates. */
  snapshot(goalId: GoalId): TickSnapshot {
    const goal = this.store.goals.get(goalId)!
    const scope = this.scopes.activeScopeFor(goalId),
      tasks = this.store.tasks.list(goalId),
      runs = this.store.runs.all(),
      today = this.day(this.clock.now())
    const state = this.store.plannerState.get(goalId)
    const reports = this.store.verifications
      .list()
      .filter((report) => tasks.some((task) => task.id === report.taskId))
      .sort((a, b) => a.createdAt - b.createdAt)
    const scorable = reports.filter((report) => report.current.length > 0).at(-1)
    const last = reports.at(-1)
    const pendingDecisions = this.store.notifications
      .list()
      .filter(
        (n) => n.goalId === goalId && ['decision', 'blocked'].includes(n.kind) && n.resolvedAt === undefined,
      ).length
    return {
      goal,
      hasScope: !!scope,
      globalPaused: this.store.paused(),
      tasks,
      runningTaskIds: runs
        .filter((run) => run.status === 'running' && tasks.some((task) => task.id === run.taskId))
        .map((run) => run.taskId),
      runsToday: runs.filter(
        (run) => this.day(run.startedAt) === today && tasks.some((task) => task.id === run.taskId),
      ).length,
      occupied: runs.filter((run) => run.status === 'running').length + this.modelSlots,
      maxConcurrentRuns: this.options.maxConcurrentRuns ?? 1,
      pendingDecisions,
      plannerCallsToday: state?.day === today ? state.calls : 0,
      limits: scope?.limits ?? {
        maxFixRounds: 0,
        maxStallRounds: 3,
        maxConcurrentWritePerProject: 1,
        maxChangedFilesPerTask: 0,
        maxRunMinutes: 1,
        maxRunsPerDay: 0,
        plannerCallsPerDay: 5,
      },
      projectTasks: this.store.goals
        .list()
        .filter((g) => g.projectRoot.toLowerCase() === goal.projectRoot.toLowerCase())
        .flatMap((g) => this.store.tasks.list(g.id)),
      plannerComplete: state?.status === 'complete' && state.frontier === this.frontier(goalId),
      latestVerificationPassed:
        !!last &&
        last.judgment.verdict === 'PASS' &&
        (scope?.verifyCommands.length
          ? !!scorable &&
            scorable.judgment.verdict === 'PASS' &&
            scorable.current.every((result) => result.status === 'passed')
          : true),
      verifierBusy: this.verificationSlot || verificationBusy(),
    }
  }
  private frontier(id: GoalId): string {
    return JSON.stringify(this.store.tasks.list(id).map((task) => [task.id, task.version, task.state]))
  }
  private event(goalId: GoalId, action: string, reason: string, taskId?: TaskId, runId?: RunId): void {
    this.store.autopilotEvents.insert({
      id: this.ids.next('autopilot_event'),
      goalId,
      at: this.clock.now(),
      action,
      reason,
      ...(taskId ? { taskId } : {}),
      ...(runId ? { runId } : {}),
    })
  }
  private refreshDecisions(id: GoalId): void {
    for (const n of this.store.notifications
      .list()
      .filter(
        (n) => n.goalId === id && ['decision', 'blocked'].includes(n.kind) && n.resolvedAt === undefined,
      )) {
      const task = n.taskId ? this.store.tasks.get(n.taskId) : undefined
      const stale = !!n.taskId && (!task || task.version !== n.taskVersion)
      const expired = (n.expiresAt ?? Infinity) <= this.clock.now()
      if (!stale && !expired) continue
      this.store.transaction(() => {
        this.store.notifications.update({
          ...n,
          resolvedAt: this.clock.now(),
          resolvedReason: stale ? 'superseded' : 'expired',
        })
        this.store.suggestions.consume(n.id, this.clock.now())
        if (task && ['WAITING_APPROVAL', 'FAILED', 'BLOCKED', 'PAUSED'].includes(task.state))
          this.ports.requestDecision?.(task.id)
        else if (!n.taskId && expired)
          goalNotice(
            this.store,
            this.store.goals.get(id)!,
            n.reason ?? 'decision-expired',
            this.options.locale(),
            n.choices ?? ['pause-goal'],
            n.kind,
          )
      })
    }
  }
  private async check(id: GoalId): Promise<void> {
    if (this.stopped || this.store.status().state !== 'ok' || !this.store.goals.get(id)) return
    this.refreshDecisions(id)
    const snapshot = this.snapshot(id),
      action = planTick(snapshot)
    if (action.type === 'idle') {
      const last = this.store.autopilotEvents.list(id).at(-1)
      if (last?.action !== 'idle' || last.reason !== action.reason) this.event(id, 'idle', action.reason)
      if (action.reason === 'awaiting-decision' && !snapshot.pendingDecisions) {
        const task = snapshot.tasks.find((task) =>
          ['FAILED', 'BLOCKED', 'WAITING_APPROVAL', 'PAUSED'].includes(task.state),
        )
        if (task) this.ports.requestDecision?.(task.id)
      }
      return
    }
    if (action.type === 'plan' && (this.store.plannerState.get(id)?.notBefore ?? 0) > this.clock.now()) return
    const model = action.type === 'plan' || action.type === 'execute'
    const verifying = action.type === 'verify' || action.type === 'reconcile'
    if (verifying && snapshot.occupied > 0) return
    if (model) this.modelSlots++
    if (verifying) this.verificationSlot = true
    let again = true
    this.event(id, action.type, 'begin', 'taskId' in action ? action.taskId : undefined)
    try {
      if (action.type === 'execute') {
        const result = await this.ports.execute(id, (own) => this.canExecute(id, own))
        this.event(id, 'execute', result.reason, undefined, result.runId)
        again = result.started
      } else if (action.type === 'verify') await this.ports.verify(action.taskId)
      else if (action.type === 'reconcile')
        again = (await this.ports.reconcile(action.taskId)).state !== 'running'
      else if (action.type === 'suggest-next') {
        const task = snapshot.tasks.find((task) => task.state === 'READY' || task.state === 'PENDING')!
        goalNotice(
          this.store,
          snapshot.goal,
          `next-task-ready:${task.id}:${task.version}`,
          this.options.locale(),
          [],
          'progress',
        )
        again = false
      } else if (action.type === 'plan')
        again = await this.plan(snapshot.goal, this.scopes.activeScopeFor(id)!)
      else if (action.type === 'complete') {
        // Re-read controls and completion evidence before making the terminal goal update.
        if (planTick(this.snapshotWithoutOwnSlot(id, model, verifying)).type !== 'complete') return
        this.store.transaction(() => {
          const goal = this.store.goals.get(id)!
          this.store.goals.update(
            {
              ...goal,
              status: 'completed',
              autopilot: { ...goal.autopilot, enabled: false, disabledReason: 'completed' },
              version: goal.version + 1,
            },
            goal.version,
          )
          const checkpoint = this.store.checkpoints.list(id).at(-1)?.commit ?? 'none'
          goalNotice(this.store, goal, `goal-completed:${checkpoint}`, this.options.locale(), [], 'progress')
          this.event(id, 'complete', 'verified-goal-complete')
        })
        again = false
      }
    } finally {
      if (model) this.modelSlots--
      if (verifying) this.verificationSlot = false
      if (!this.stopped) {
        if (again) this.dirty.add(id)
        if (model || verifying)
          for (const goal of this.store.goals.list())
            if (goal.id !== id && goal.autopilot.enabled) this.mark(goal.id)
      }
    }
  }
  private snapshotWithoutOwnSlot(id: GoalId, model: boolean, verifying: boolean): TickSnapshot {
    const s = this.snapshot(id)
    return { ...s, occupied: s.occupied - (model ? 1 : 0), verifierBusy: verifying ? false : s.verifierBusy }
  }
  private async plan(goal: ProjectGoal, scope: AuthorizationScope): Promise<boolean> {
    const id = goal.id,
      at = this.clock.now(),
      day = this.day(at),
      old = this.store.plannerState.get(id),
      frontier = this.frontier(id)
    const state: PlannerState = {
      id,
      day,
      calls: (old?.day === day ? old.calls : 0) + 1,
      status: 'none',
      frontier,
      reason: '',
      notBefore: 0,
    }
    this.store.plannerState.put(state)
    const tasks = this.store.tasks.list(id),
      reports = this.store.verifications.list()
    const history = tasks.map((task) => {
      const report = reports.filter((r) => r.taskId === task.id).at(-1)
      return {
        id: task.id,
        title: task.title,
        kind: task.kind,
        state: task.state,
        verdict: report?.judgment.verdict ?? 'UNKNOWN',
        reasons: report?.judgment.reasons ?? [],
        commands:
          report?.current.map((r) => ({
            command: r.command,
            status: r.status,
            ...(r.counts ? { counts: r.counts } : {}),
          })) ?? [],
        counts: report?.current.flatMap((r) => (r.counts ? [r.counts] : [])) ?? [],
        failureSummary: task.failureSummary ?? '',
      }
    })
    const controller = new AbortController()
    this.controllers.add(controller)
    const timer = setTimeout(
      () => controller.abort(new Error('planner-timeout')),
      this.options.plannerTimeoutMs ?? 120000,
    )
    let response
    try {
      const text = await this.ports.planner.generate(
        buildPlannerPrompt(
          goal,
          scope,
          history,
          this.options.locale(),
          this.store.userNotes
            .list(id)
            .slice(-5)
            .map((n) => n.text),
        ),
        controller.signal,
      )
      controller.signal.throwIfAborted()
      response = parsePlannerResponse(text)
    } catch (error) {
      if (this.stopped) return false
      this.store.plannerState.put({
        ...state,
        reason: 'planner-call-failed',
        notBefore: this.clock.now() + 60000,
      })
      this.event(id, 'plan', 'planner-call-failed')
      this.options.log('planner call failed', error)
      return false
    } finally {
      clearTimeout(timer)
      this.controllers.delete(controller)
    }
    if (this.stopped) return false
    const current = this.store.goals.get(id)!
    if (
      !current.autopilot.enabled ||
      current.status !== 'active' ||
      this.store.paused() ||
      this.scopes.activeScopeFor(id)?.hash !== scope.hash ||
      this.frontier(id) !== frontier
    ) {
      this.event(id, 'plan', 'controls-changed')
      return false
    }
    if (!response.ok) {
      this.store.plannerState.put({
        ...state,
        reason: response.error.code,
        notBefore: this.clock.now() + 60000,
      })
      this.event(id, 'plan', response.error.code)
      return false
    }
    const proposal = response.value
    this.store.transaction(() => {
      if (proposal.status === 'need-user') {
        this.store.plannerState.put({ ...state, status: 'need-user', reason: proposal.question })
        goalNotice(this.store, current, `planner-need-user: ${proposal.question}`, this.options.locale())
      } else if (proposal.status === 'complete' && this.snapshot(id).latestVerificationPassed) {
        this.store.plannerState.put({ ...state, status: 'complete', reason: proposal.reason })
      } else {
        const merged =
          proposal.status === 'continue'
            ? mergePlannerTasks(current, scope, tasks, proposal, { clock: this.clock, idGen: this.ids })
            : { added: [], rejected: [] }
        for (const task of merged.added) this.store.tasks.insert(task)
        this.store.plannerState.put({
          ...state,
          status: merged.added.length ? 'continue' : 'none',
          reason: merged.added.length ? 'tasks-added' : 'planner-no-progress',
        })
        if (!merged.added.length) {
          const stalled = (current.stalled ?? 0) + 1
          this.store.goals.update(
            {
              ...current,
              stalled,
              ...(stalled >= scope.limits.maxStallRounds ? { status: 'paused' as const } : {}),
              version: current.version + 1,
            },
            current.version,
          )
          if (stalled >= scope.limits.maxStallRounds)
            goalNotice(this.store, this.store.goals.get(id)!, 'stalled', this.options.locale())
        }
      }
      this.event(id, 'plan', proposal.status)
    })
    return true
  }
  private disable(id: GoalId, error: unknown): void {
    if (this.stopped) return
    this.options.log('autopilot goal disabled', error)
    const reason =
      error instanceof Error && /^[a-z][a-z0-9-]{0,100}$/.test(error.message)
        ? error.message
        : 'autopilot-action-error'
    try {
      this.store.transaction(() => {
        const goal = this.store.goals.get(id)!
        this.store.goals.update(
          {
            ...goal,
            autopilot: { ...goal.autopilot, enabled: false, disabledReason: reason },
            version: goal.version + 1,
          },
          goal.version,
        )
        goalNotice(this.store, goal, reason, this.options.locale(), ['pause-goal'], 'blocked')
        this.event(id, 'disabled', reason)
      })
    } catch (error) {
      this.options.log('autopilot shutdown record failed', error)
    }
  }
  /** Stop timers, abort tool-free planning/verification, and wait at most five seconds for actions. */
  async dispose(): Promise<void> {
    this.stopped = true
    this.stopWatch?.()
    clearInterval(this.interval)
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
    this.dirty.clear()
    for (const controller of this.controllers) controller.abort(new Error('scheduler-disposed'))
    this.ports.stop?.()
    let timer: ReturnType<typeof setTimeout> | undefined
    await Promise.race([
      Promise.allSettled([...this.active.values()]),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, 5000)
      }),
    ])
    clearTimeout(timer)
  }
}
