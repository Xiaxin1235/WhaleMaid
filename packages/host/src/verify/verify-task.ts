import { createHash } from 'node:crypto'
import { realpath, lstat } from 'node:fs/promises'
import { join, relative } from 'node:path'
import {
  judge,
  decideNext,
  TaskIdSchema,
  NotificationIdSchema,
  SuggestionIdSchema,
  CheckpointIdSchema,
  EvidenceIdSchema,
  t,
} from '@whaledot/core'
import type {
  Task,
  Run,
  TaskId,
  TaskState,
  DecisionChoice,
  ChangedFile,
  Verification,
  Locale,
} from '@whaledot/core'
import type { WhaleStore } from '../store/index.js'
import { productionIdGen } from '../store/index.js'
import type { ScopeService } from '../scope-service.js'
import { VerificationRunner, verificationBatch } from './runner.js'
import type { ObserveSession } from './reconcile.js'

/** Shared P09/P10 orchestration; all invocations serialize with verification and decision mutations. */
export class TaskVerifier {
  readonly runner: VerificationRunner
  constructor(
    readonly store: WhaleStore,
    private readonly scopes: ScopeService,
    readonly dataDir: string,
    private readonly observe: ObserveSession,
    private readonly locale: () => Locale,
  ) {
    this.runner = new VerificationRunner(dataDir)
  }

  /** Verify one ended, checkpointed run; this method never dispatches a model prompt. */
  verifyTask(input: TaskId): Promise<Verification> {
    return verificationBatch(() => this.verify(TaskIdSchema.parse(input)))
  }
  private latest(task: Task): Run {
    const run = this.store.runs.list(task.id).at(-1)
    if (!run || run.status === 'running') throw new Error('no-ended-run')
    return run
  }
  private move(task: Task, state: TaskState, reason: string, run: Run, source = 'verification'): Task {
    const result = this.store.tasks.transition(task.id, state, {
      expectedVersion: task.version,
      reason,
      source,
      runId: run.run_id,
    })
    if (!result.ok) throw new Error(result.error.code)
    return result.value.task
  }
  private authorize(run: Run): void {
    const task = this.store.tasks.get(run.taskId)
    const scope = task && this.scopes.activeScopeFor(task.goalId)
    if (
      !scope ||
      scope.id !== run.runScope?.originScopeId ||
      scope.hash !== run.runScope.originScopeHash ||
      JSON.stringify(scope.verifyCommands) !== JSON.stringify(run.runScope.verifyCommands)
    )
      throw new Error('verification-authorization-inactive')
  }
  private async owned(run: Run, task: Task, expected?: string, clean = true): Promise<void> {
    const target = join(this.dataDir, 'worktrees', task.goalId)
    if (
      (await lstat(target)).isSymbolicLink() ||
      relative(await realpath(target), await realpath(run.worktreePath)) !== ''
    )
      throw new Error('not-owned-worktree')
    const git = this.runner.worktrees
    if (!(await git.git(run.worktreePath, ['symbolic-ref', '--short', 'HEAD'])).startsWith('whaledot/'))
      throw new Error('not-whaledot-branch')
    const goal = this.store.goals.get(task.goalId)!
    if (relative(await realpath(goal.projectRoot), await realpath(run.worktreePath)) === '')
      throw new Error('original-workspace-forbidden')
    if (expected && (await git.git(run.worktreePath, ['rev-parse', 'HEAD'])) !== expected)
      throw new Error('worktree-external-modification')
    if (clean && (await git.git(run.worktreePath, ['status', '--porcelain=v1', '--untracked-files=all'])))
      throw new Error('worktree-external-modification')
  }
  private async changes(run: Run, commit: string): Promise<{ files: ChangedFile[]; stat: string }> {
    if (run.baseCommit === 'non-git') return { files: [], stat: '' }
    const git = this.runner.worktrees
    const names = (
      await git.git(run.worktreePath, [
        '-c',
        'core.quotePath=false',
        'diff',
        '--name-only',
        '-z',
        run.baseCommit,
        commit,
      ])
    )
      .split('\0')
      .filter(Boolean)
    const files: ChangedFile[] = []
    for (const path of names) {
      const read = async (revision: string) => {
        try {
          return await git.git(run.worktreePath, [
            'show',
            '--no-ext-diff',
            '--no-textconv',
            `${revision}:${path}`,
          ])
        } catch {
          return undefined
        }
      }
      const before = await read(run.baseCommit),
        after = await read(commit)
      const patch = await git.git(run.worktreePath, [
        'diff',
        '--no-ext-diff',
        '--no-textconv',
        '--unified=0',
        run.baseCommit,
        commit,
        '--',
        path,
      ])
      files.push({
        path,
        deleted: after === undefined,
        addedLines: patch
          .split('\n')
          .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
          .join('\n'),
        ...(before !== undefined ? { before } : {}),
        ...(after !== undefined ? { after } : {}),
      })
    }
    return {
      files,
      stat: await git.git(run.worktreePath, [
        'diff',
        '--no-ext-diff',
        '--no-textconv',
        '--stat',
        run.baseCommit,
        commit,
      ]),
    }
  }
  private async verify(id: TaskId): Promise<Verification> {
    let task = this.store.tasks.get(id)
    if (!task || task.state !== 'VERIFYING') throw new Error('task-not-verifying')
    const run = this.latest(task)
    if (this.store.runs.all().some((item) => item.status === 'running'))
      throw new Error('verification-execution-active')
    if (
      this.store.verifications.get(run.run_id)?.judgment.verdict &&
      this.store.verifications.get(run.run_id)?.judgment.verdict !== 'UNKNOWN'
    )
      throw new Error('run-already-verified')
    const goal = this.store.goals.get(task.goalId)!
    const reportOnly = ['analyze', 'research'].includes(task.kind)
    const checkpoint =
      this.store.checkpoints
        .list(goal.id)
        .filter((item) => item.taskId === id && item.createdAt >= run.startedAt)
        .at(-1)?.commit ?? run.baseCommit
    if (!run.runScope) throw new Error('missing-run-scope')
    if (
      run.baseCommit !== 'non-git' &&
      !this.store.checkpoints.list(goal.id).some((item) => item.commit === checkpoint)
    )
      throw new Error('missing-run-checkpoint')
    if (run.baseCommit !== 'non-git')
      await this.owned(
        run,
        task,
        reportOnly ? (this.store.checkpoints.list(goal.id).at(-1)?.commit ?? checkpoint) : checkpoint,
      )
    const diff = await this.changes(run, checkpoint)
    let observation
    try {
      observation = await this.observe(run.sessionId)
    } catch {
      observation = undefined
    }
    if (observation?.running) throw new Error('session-still-running')
    const commands = reportOnly ? [] : run.runScope.verifyCommands
    let baseline: Verification['baseline'] = []
    const current: Verification['current'] = []
    let collectionError = false
    // Guard acceptance machinery before executing modified project code.
    const preflight = judge({
      kind: task.kind,
      endReason: run.reason ?? '',
      deniedCalls: run.deniedCalls,
      changedFiles: diff.files,
      verifyCommands: commands,
      finalReplyNonempty: observation?.finalReplyNonempty ?? run.finalReplyNonempty ?? false,
    })
    if (!reportOnly && commands.length && !preflight.reasons.includes('acceptance-tampering')) {
      try {
        this.authorize(run)
        baseline = await this.runner.baseline(
          goal.projectRoot,
          run.baseCommit,
          commands,
          run.run_id,
          run.runScope.limits.maxRunMinutes,
          () => this.authorize(run),
        )
        for (let i = 0; i < commands.length; i++) {
          this.authorize(run)
          current.push(
            await this.runner.command(
              run.worktreePath,
              commands[i]!,
              run.run_id,
              `current-${i}`,
              run.runScope.limits.maxRunMinutes,
            ),
          )
        }
        await this.owned(run, task, checkpoint)
      } catch {
        collectionError = true
      }
    }
    let judgment = judge({
      kind: task.kind,
      endReason: observation?.endReason ?? run.reason ?? '',
      deniedCalls: run.deniedCalls,
      changedFiles: diff.files,
      verifyCommands: commands,
      ...(collectionError ? {} : { baseline, current }),
      finalReplyNonempty: observation?.finalReplyNonempty ?? run.finalReplyNonempty ?? false,
    })
    if (reportOnly && !observation && run.finalReplyNonempty === undefined)
      judgment = {
        verdict: 'UNKNOWN',
        progress: 'unknown',
        reasons: [
          ...(run.deniedCalls > 0 ? [`denied-actions:${run.deniedCalls}`] : []),
          'session-observation-unavailable',
        ],
      }
    const decision = decideNext({
      judgment,
      attempts: task.attempts,
      limits: run.runScope.limits,
      stalled: goal.stalled ?? 0,
      tampered: judgment.reasons.includes('acceptance-tampering'),
    })
    const record: Verification = {
      id: run.run_id,
      taskId: id,
      checkpoint,
      createdAt: Date.now(),
      baseline,
      current,
      judgment,
      decision,
    }
    if (decision.type === 'rollback-and-retry') await this.rollback(run, task, checkpoint)
    this.store.transaction(() => {
      const fresh = this.store.tasks.get(id)
      if (fresh?.version !== task!.version || fresh.state !== 'VERIFYING') throw new Error('stale-version')
      this.store.verifications.insert(record)
      const summary = JSON.stringify({ judgment, decision, checkpoint })
      this.store.evidence.insert({
        id: EvidenceIdSchema.parse(productionIdGen.next('evidence')),
        runId: run.run_id,
        kind: 'log',
        hash: createHash('sha256').update(summary).digest('hex'),
        summary,
        verdict: judgment.verdict,
      })
      for (const [phase, results] of [
        ['baseline', baseline],
        ['current', current],
      ] as const)
        for (const result of results)
          this.store.evidence.insert({
            id: EvidenceIdSchema.parse(productionIdGen.next('evidence')),
            runId: run.run_id,
            kind: 'test-report',
            path: result.logPath!,
            hash: result.hash!,
            summary: JSON.stringify({ phase, ...result }),
            verdict: result.status === 'passed' ? 'PASS' : result.status === 'failed' ? 'FAIL' : 'UNKNOWN',
          })
      this.store.runs.update({
        ...this.store.runs.get(run.run_id)!,
        outcome: judgment.verdict,
        finalReplyNonempty: observation?.finalReplyNonempty ?? run.finalReplyNonempty ?? false,
      })
      const reason = judgment.reasons.join('; ')
      if (decision.type === 'succeed') task = this.move(task!, 'SUCCEEDED', reason, run)
      else if (decision.type === 'retry' || decision.type === 'rollback-and-retry') {
        task = this.move(task!, 'FAILED', reason, run)
        this.store.tasks.update(
          {
            ...task,
            attempts: decision.attempts,
            failureSummary: decision.failureSummary,
            version: task.version + 1,
          },
          task.version,
        )
        task = this.move(this.store.tasks.get(id)!, 'READY', 'bounded-auto-retry: ' + reason, run)
      } else if (decision.type === 'reconcile') task = this.move(task!, 'UNKNOWN', reason, run)
      else {
        task = this.move(task!, 'WAITING_APPROVAL', reason, run)
        this.notify(task, run, decision.reason, reason)
      }
      const freshGoal = this.store.goals.get(goal.id)!
      this.store.goals.update(
        {
          ...freshGoal,
          stalled: decision.goalProgress,
          ...(decision.type === 'pause-goal' ? { status: 'paused' as const } : {}),
          version: freshGoal.version + 1,
        },
        freshGoal.version,
      )
    })
    return record
  }
  /** Preserve the failed commit first; reset only the exact owned, clean worktree on whaledot/*. */
  async rollback(run: Run, task: Task, checkpoint: string): Promise<void> {
    this.authorize(run)
    const scope = this.scopes.activeScopeFor(task.goalId)!
    if (scope.permissionPreset !== 'workspace-write' || !scope.allowedActions.includes('write-file'))
      throw new Error('rollback-not-authorized')
    await this.owned(run, task, checkpoint)
    await this.runner.worktrees.git(run.worktreePath, [
      'update-ref',
      `refs/whaledot/failed/${run.run_id}`,
      checkpoint,
    ])
    await this.runner.worktrees.git(run.worktreePath, ['reset', '--hard', run.baseCommit])
    this.store.checkpoints.insert({
      id: CheckpointIdSchema.parse(productionIdGen.next('checkpoint')),
      goalId: task.goalId,
      taskId: task.id,
      commit: run.baseCommit,
      kind: 'rollback',
      createdAt: Date.now(),
      files: [],
      diffStat: '',
    })
  }
  private notify(task: Task, run: Run, type: string, reason: string): void {
    const dedupeKey = `${task.goalId}:${task.id}:${type}`
    if (
      this.store.notifications
        .list()
        .some(
          (item) =>
            item.dedupeKey === dedupeKey &&
            item.resolvedAt === undefined &&
            (item.expiresAt ?? 0) > Date.now() &&
            item.taskVersion === task.version,
        )
    )
      return
    const id = NotificationIdSchema.parse(productionIdGen.next('notification'))
    const choices: DecisionChoice[] = [
      'retry',
      'accept',
      ...(run.baseCommit !== 'non-git' &&
      this.scopes.activeScopeFor(task.goalId)?.permissionPreset === 'workspace-write'
        ? ['rollback' as const]
        : []),
      'pause-goal',
      'view-diff',
    ]
    const expiresAt = Date.now() + 86400000
    this.store.notifications.insert({
      id,
      kind: type === 'reconcile-blocked' ? 'blocked' : 'decision',
      priority: 'high',
      dedupeKey,
      goalId: task.goalId,
      taskId: task.id,
      channel: 'panel',
      createdAt: Date.now(),
      expiresAt,
      taskVersion: task.version,
      runId: run.run_id,
      reason: `${type}: ${reason}`,
      choices,
    })
    for (const choice of choices)
      this.store.suggestions.insert({
        id: SuggestionIdSchema.parse(productionIdGen.next('suggestion')),
        notificationId: id,
        label: t(this.locale(), choiceLabels[choice]),
        intent: { type: 'panel-decision', choice },
        riskLevel: ['accept', 'rollback'].includes(choice) ? 'high' : 'low',
        expiresAt,
        bindTo: { goalId: task.goalId, taskId: task.id, taskVersion: task.version, sessionId: run.sessionId },
      })
  }
  /** Reconcile existing execution only; no prompt or resume API is reachable from this path. */
  reconcileTask(input: TaskId): Promise<{ state: string }> {
    return verificationBatch(async () => {
      let task = this.store.tasks.get(TaskIdSchema.parse(input))
      if (!task || task.state !== 'UNKNOWN') throw new Error('task-not-unknown')
      const run = this.latest(task),
        observation = await this.observe(run.sessionId)
      if (observation.running) return { state: 'running' }
      try {
        if (run.baseCommit !== 'non-git') {
          const latest = this.store.checkpoints.list(task.goalId).at(-1)?.commit ?? run.baseCommit
          await this.owned(run, task, latest, false)
          const checkpoint = await this.runner.worktrees.checkpoint(
            { path: run.worktreePath, baseCommit: latest, git: true },
            `WhaleDot reconciled ${run.run_id}`,
          )
          this.store.checkpoints.insert({
            id: CheckpointIdSchema.parse(productionIdGen.next('checkpoint')),
            taskId: task.id,
            goalId: task.goalId,
            kind: 'reconciled',
            commit: checkpoint.commit,
            files: checkpoint.files,
            diffStat: checkpoint.diffStat,
            createdAt: Date.now(),
          })
        } else if (!observation.exists) throw new Error('missing-non-git-session')
      } catch (error) {
        this.store.transaction(() => {
          task = this.move(task!, 'BLOCKED', 'reconcile-workspace-inconsistent', run)
          this.notify(task, run, 'reconcile-blocked', String(error))
        })
        return { state: 'BLOCKED' }
      }
      this.store.transaction(() => {
        this.store.runs.update({
          ...this.store.runs.get(run.run_id)!,
          finalReplyNonempty: observation.finalReplyNonempty,
        })
        this.move(task!, 'VERIFYING', 'external-state-reconciled-no-resend', run)
      })
      // Previous judgments and command logs remain in evidence when this explicit reconciliation verifies again.
      await this.verify(task.id)
      return { state: this.store.tasks.get(task.id)!.state }
    })
  }
  /** Resolve a persisted owner choice once; view-diff is read-only and leaves the decision pending. */
  resolveDecision(
    notificationId: string,
    choice: DecisionChoice,
  ): Promise<{ state: string; files?: string[]; stat?: string }> {
    return verificationBatch(async () => {
      const notification = this.store.notifications.get(notificationId)
      const task = notification?.taskId && this.store.tasks.get(notification.taskId)
      if (
        !notification ||
        !task ||
        notification.resolvedAt !== undefined ||
        (notification.expiresAt ?? 0) <= Date.now() ||
        notification.taskVersion !== task.version ||
        !notification.choices?.includes(choice)
      )
        throw new Error('decision-stale-or-consumed')
      const run = this.latest(task)
      if (run.run_id !== notification.runId) throw new Error('decision-run-mismatch')
      const checkpoint =
        this.store.verifications.get(run.run_id)?.checkpoint ??
        this.store.checkpoints.list(task.goalId).at(-1)?.commit ??
        run.baseCommit
      if (choice === 'view-diff') {
        const diff = await this.changes(run, checkpoint)
        return { state: 'pending', files: diff.files.map((file) => file.path), stat: diff.stat }
      }
      if (choice === 'rollback') await this.rollback(run, task, checkpoint)
      this.store.transaction(() => {
        if (
          this.store.notifications.get(notificationId)?.resolvedAt !== undefined ||
          this.store.tasks.get(task.id)?.version !== task.version
        )
          throw new Error('decision-stale-or-consumed')
        if (choice === 'pause-goal') {
          const goal = this.store.goals.get(task.goalId)!
          this.store.goals.update({ ...goal, status: 'paused', version: goal.version + 1 }, goal.version)
        } else
          this.move(
            task,
            choice === 'accept' ? 'SUCCEEDED' : 'READY',
            choice === 'accept'
              ? '用户人工接受，未经自动验收'
              : `user-approved-${choice}; auto repair budget unchanged`,
            run,
            'user',
          )
        this.store.notifications.update({ ...notification, resolvedAt: Date.now() })
        this.store.suggestions.consume(notification.id, Date.now())
      })
      return { state: this.store.tasks.get(task.id)!.state }
    })
  }
  /** Evidence is addressed by run/phase/index, never by a caller-supplied path. */
  async logTail(runId: string, phase: 'baseline' | 'current', index: number): Promise<{ tail: string }> {
    const result = this.store.verifications.get(runId)?.[phase][index]
    if (!result) throw new Error('log-not-found')
    return { tail: await this.runner.logTail(result) }
  }
}
const choiceLabels = {
  retry: 'decisionRetry',
  accept: 'decisionAccept',
  rollback: 'decisionRollback',
  'pause-goal': 'pauseGoal',
  'view-diff': 'decisionDiff',
} as const
