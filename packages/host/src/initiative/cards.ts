import { z } from 'zod'
import {
  DETECTORS,
  INITIATIVE_CARD_CAPACITY,
  INITIATIVE_DAY,
  INITIATIVE_HOUR,
  INITIATIVE_TTL,
  LEVELS,
  InitiativeAdjustmentSchema,
  NotificationIdSchema,
  SuggestionIdSchema,
  initiativeBatch,
  initiativeChoiceCopy,
  initiativeFindingCopy,
  initiativeMetrics,
  initiativeOptions,
  initiativeInCooldown,
  learnInitiative,
  resolveLevel,
  briefTitle,
  DailyGoalChangesSchema,
} from '@whalemaid/core'
import type {
  DetectorId,
  GoalDraft,
  GoalId,
  InitiativeSettings,
  Locale,
  Notification,
  Opportunity,
  ProjectGoal,
  Suggestion,
} from '@whalemaid/core'
import { managementConsent } from '../companion/consent.js'
import type { GoalIntake } from '../goal-intake/service.js'
import type { ScopeService } from '../scope-service.js'
import type { RouteResult } from '../notify/router.js'
import { productionIdGen, sha256, type WhaleStore } from '../store/index.js'

const DetectorFeedback = z.strictObject({
  since: z.number(),
  adjustment: InitiativeAdjustmentSchema.optional(),
})
const noFeedback: z.infer<typeof DetectorFeedback> = { since: 0 }
const muteKey = (goalId: GoalId, detector: DetectorId) => `initiative.mute:${goalId}:${detector}`
const adjustKey = (detector: DetectorId) => `initiative.adjust:${detector}`
const fingerprint = (goal: ProjectGoal) =>
  sha256.hash(JSON.stringify({ ...goal, version: 0, inboxSessionId: undefined }))

function draftFor(choice: 'draft-diagnosis' | 'draft-followup', locale: Locale): GoalDraft {
  const zh = locale === 'zh-CN'
  const title =
    choice === 'draft-diagnosis'
      ? zh
        ? '只读排查重复验收失败'
        : 'Investigate repeated acceptance failures (read-only)'
      : zh
        ? '检查已完成目标的遗留事项'
        : 'Review remaining work from the completed goal'
  const check = zh
    ? '只读检查环境、依赖和数据，记录有证据的原因及后续建议。'
    : 'Inspect environment, dependencies and data read-only. Report supported causes and next steps.'
  return {
    title,
    objective: check,
    expectedOutcome: check,
    acceptance: [check],
    stopConditions: [
      zh
        ? '需要写文件或变更环境时停止并请用户决定。'
        : 'Stop and ask before changing files or the environment.',
    ],
    mode: 'suggest',
    initialTasks: [{ title, kind: 'analyze', dependsOnIndex: [] }],
    proposedVerifyCommands: [],
    proposedProtectedPaths: [],
  }
}

/** Cards own the initiative lifecycle. The notification router owns the shared durable claim. */
export class InitiativeCards {
  constructor(
    private readonly store: WhaleStore,
    private readonly scopes: Pick<ScopeService, 'activeScopeFor'>,
    private readonly intake: Pick<GoalIntake, 'setPaused'>,
    private readonly settings: () => InitiativeSettings,
    private readonly locale: () => Locale,
  ) {}

  private feedback(detector: DetectorId) {
    return this.store.recallState(adjustKey(detector), DetectorFeedback) ?? noFeedback
  }

  private muted(goalId: GoalId, detector: DetectorId) {
    return this.store.recallState(muteKey(goalId, detector), z.boolean()) === true
  }

  level(row: Pick<Opportunity, 'score' | 'detector'>, settings = this.settings()) {
    const level = resolveLevel(row, settings)
    const adjustment = this.feedback(row.detector).adjustment
    if (!adjustment) return level
    if (row.score < adjustment.minimumScore) return 'L0'
    const adjusted = LEVELS[Math.min(LEVELS.indexOf(level), LEVELS.indexOf(adjustment.level))]!
    if (adjusted === 'L2' && !settings.channels.cards) return settings.channels.brief ? 'L1' : 'L0'
    return adjusted === 'L1' && !settings.channels.brief ? 'L0' : adjusted
  }

  restore(input: { detector: DetectorId; goalId?: GoalId | undefined }, now: number) {
    if (input.goalId) this.store.setRecallState(muteKey(input.goalId, input.detector), false)
    else {
      this.store.setRecallState(adjustKey(input.detector), { since: now })
      this.store.autopilotEvents.insert({
        id: productionIdGen.next('initiative'),
        at: now,
        action: 'initiative-learning-reset',
        reason: input.detector,
      })
    }
  }

  panel(rows: readonly Opportunity[], now: number) {
    return {
      metrics: DETECTORS.map((detector) => {
        const relevant = rows.filter((row) => row.detector === detector)
        return {
          detector,
          week: initiativeMetrics(relevant, now, 7),
          month: initiativeMetrics(relevant, now, 30),
          adjustment: this.feedback(detector).adjustment,
        }
      }),
      muted: [
        ...new Map(
          rows.flatMap((row) => {
            const goalId = row.subject.goalId
            return goalId && this.muted(goalId, row.detector)
              ? [
                  [
                    muteKey(goalId, row.detector),
                    { goalId, detector: row.detector, title: this.store.goals.get(goalId)?.title ?? '' },
                  ] as const,
                ]
              : []
          }),
        ).values(),
      ],
    }
  }

  refresh(n: Notification, now = Date.now()): Notification {
    if (!n.initiative || n.resolvedAt !== undefined || n.routingSuggestionId) return n
    const goal = this.store.goals.get(n.goalId)
    const scope = this.scopes.activeScopeFor(n.goalId)
    const rows = this.rows(n)
    const outdated =
      !goal ||
      !scope ||
      scope.id !== n.decisionBinding?.scopeId ||
      scope.hash !== n.decisionBinding.scopeHash ||
      fingerprint(goal) !== n.initiative.goalFingerprint ||
      rows.length !== n.initiative.ids.length
    const expired = (n.expiresAt ?? 0) <= now
    if (!outdated && !expired) return n
    const retired: Notification = {
      ...n,
      resolvedAt: now,
      resolvedReason: outdated ? 'superseded' : 'expired',
      deliveryState: 'dropped',
      deliveryReason: outdated ? 'initiative-context-changed' : 'resolved-or-expired',
      nextDeliveryAt: undefined,
    }
    this.store.transaction(() => {
      for (const row of rows)
        this.store.opportunities.update({ ...row, status: 'expired', outcomeAt: now, neutral: outdated })
      this.store.suggestions.consume(n.id, now)
      this.store.notifications.update(retired)
      this.store.notificationDeliveries.insert({
        id: productionIdGen.next('delivery'),
        goalId: n.goalId,
        notificationId: n.id,
        at: now,
        result: outdated ? 'superseded' : 'expired',
        detail: retired.deliveryReason,
        generation: n.decisionDelivery?.generation ?? 0,
      })
    })
    return retired
  }

  enabled(n: Notification) {
    if (!n.initiative) return false
    const settings = this.settings()
    return (
      settings.enabled &&
      (n.initiative.level === 'L3' ? settings.channels.asks : settings.channels.cards) &&
      this.rows(n).every(
        (row) => settings.detectors[row.detector].enabled && !this.muted(n.goalId, row.detector),
      )
    )
  }

  private rows(n: Notification) {
    return (n.initiative?.ids ?? []).flatMap((id) => {
      const row = this.store.opportunities.get(id)
      return row?.notificationId === n.id && row.subject.goalId === n.goalId ? [row] : []
    })
  }

  copy(n: Notification) {
    const locale = this.locale()
    const zh = locale === 'zh-CN'
    const title = briefTitle(this.store.goals.get(n.goalId)?.title ?? '')
    const counts = new Map<DetectorId, number>()
    for (const row of this.rows(n)) counts.set(row.detector, (counts.get(row.detector) ?? 0) + 1)
    return {
      header:
        n.initiative?.level === 'L3'
          ? zh
            ? '主动询问'
            : 'Initiative question'
          : zh
            ? '主动建议'
            : 'Initiative suggestion',
      question: zh
        ? `「${title}」有新的发现，要怎么处理？`
        : `There are new findings for ${title}. What would you like to do?`,
      detail: [...counts]
        .map(
          ([detector, count]) =>
            initiativeFindingCopy(locale, detector).summary + (count > 1 ? ` ×${count}` : ''),
        )
        .join('\n'),
    }
  }

  options(n: Notification, goalVersion: number, now: number): Suggestion[] {
    if (!n.initiative || !n.decisionBinding || !this.enabled(n)) return []
    return initiativeOptions(this.rows(n)).map((option) => ({
      ...initiativeChoiceCopy(this.locale(), option.choice),
      id: SuggestionIdSchema.parse(productionIdGen.next('suggestion')),
      notificationId: n.id,
      initiative: option,
      intent: { type: 'notification-action', action: 'open-panel' },
      riskLevel: 'low',
      expiresAt: n.expiresAt ?? now,
      bindTo: {
        goalId: n.goalId,
        notificationId: n.id,
        goalVersion,
        scopeId: n.decisionBinding!.scopeId,
        scopeHash: n.decisionBinding!.scopeHash,
        generation: n.decisionDelivery?.generation,
      },
    }))
  }

  allows(n: Notification, s: Suggestion, version: number) {
    return (
      this.enabled(n) &&
      (n.remindAt ?? 0) <= Date.now() &&
      n.suggestionIds?.includes(s.id) &&
      'goalVersion' in s.bindTo &&
      s.bindTo.goalVersion === version &&
      initiativeOptions(this.rows(n)).some(
        (option) =>
          option.choice === s.initiative?.choice && option.opportunityId === s.initiative.opportunityId,
      )
    )
  }

  delivered(n: Notification, at: number) {
    for (const row of this.rows(n))
      if (row.status === 'open' || row.status === 'snoozed')
        this.store.opportunities.update({ ...row, status: 'delivered', deliveredAt: row.deliveredAt ?? at })
  }

  failedDelivery(n: Notification) {
    for (const row of this.rows(n))
      if (row.status === 'delivered' && row.deliveredAt === n.deliveryAttemptedAt)
        this.store.opportunities.update({ ...row, status: 'open', deliveredAt: undefined })
  }

  recover() {
    for (const n of this.store.notifications.list()) {
      if (!n.initiative || !n.routingSuggestionId) continue
      this.store.transaction(() => {
        const claim = this.store.notificationChoices
          .list(n.goalId)
          .find((c) => c.suggestionId === n.routingSuggestionId && c.result === 'pending')
        if (claim)
          this.store.notificationChoices.update({
            ...claim,
            result: 'failed',
            detail: 'interrupted-before-effect',
          })
        this.store.suggestions.consume(n.id, Date.now())
        this.store.notifications.update({ ...n, routingSuggestionId: undefined, suggestionIds: [] })
      })
    }
  }

  /** Called inside the router's effect transaction after it durably claims the option. */
  apply(n: Notification, s: Suggestion, now: number): RouteResult {
    const selection = s.initiative!
    const goal = this.store.goals.get(n.goalId)!
    const rows = this.rows(n)
    const selected = rows.find((row) => row.id === selection.opportunityId)!
    const choice = selection.choice
    const result: RouteResult = { ok: true, goalId: goal.id }
    const current = this.store.notifications.get(n.id)!
    if (choice === 'snooze') {
      const at = now + INITIATIVE_HOUR
      const expiresAt = Math.max(n.expiresAt ?? 0, at + INITIATIVE_DAY)
      for (const row of rows)
        this.store.opportunities.update({
          ...row,
          status: 'snoozed',
          outcomeAt: now,
          deliveredAt: row.deliveredAt ?? now,
        })
      this.store.suggestions.consume(n.id, now)
      this.store.notifications.update({
        ...current,
        remindAt: at,
        snoozedUntil: at,
        expiresAt,
        suggestionIds: [],
        deliveryState: 'held',
        deliveryReason: 'snoozed',
        nextDeliveryAt: at,
      })
      return result
    }
    if (choice === 'evidence') {
      // Keep the card open. Native questions can be shown again without forcing another interruption.
      this.store.suggestions.consume(n.id, now)
      this.store.notifications.update({ ...current, suggestionIds: [] })
      return { ...result, evidenceId: selected.id, openPanel: true }
    }
    if (choice === 'mute') this.store.setRecallState(muteKey(goal.id, selected.detector), true)
    if (choice === 'pause' || choice === 'idle-pause')
      this.intake.setPaused(
        { goalId: goal.id, paused: true },
        managementConsent(new AbortController().signal),
      )
    if (choice === 'split-note' || choice === 'idle-pause' || choice === 'idle-keep') {
      const zh = this.locale() === 'zh-CN'
      const tomorrow = new Date(now)
      tomorrow.setDate(tomorrow.getDate() + 1)
      const date = tomorrow.toLocaleDateString(zh ? 'zh-CN' : 'en', { dateStyle: 'medium' })
      const note =
        choice === 'split-note'
          ? zh
            ? '复查时把当前任务拆成更小的步骤。'
            : 'Split the current task into smaller steps at the next review.'
          : choice === 'idle-pause'
            ? zh
              ? `计划在 ${date} 复查是否恢复。`
              : `Review whether to resume on ${date}.`
            : zh
              ? '复查闲置建议后，暂时保持现状。'
              : 'Keep the current state after reviewing the idle goal.'
      this.store.userNotes.insert({
        id: productionIdGen.next('user-note'),
        goalId: goal.id,
        notificationId: n.id,
        at: now,
        text: note,
      })
    }
    const draft =
      choice === 'draft-diagnosis' || choice === 'draft-followup'
        ? {
            id: `initiative:${selected.id}`,
            projectRoot: goal.projectRoot,
            content: draftFor(choice, this.locale()),
          }
        : undefined
    if (draft) result.draftId = draft.id
    if (choice === 'open-goal' || choice === 'open-decision') result.openPanel = true
    if (choice === 'open-decision') {
      const decision = selected.evidence.find((ref) => ref.kind === 'notification')
      const live = decision && this.store.notifications.get(decision.id)
      const next = this.store.notifications
        .forGoal(goal.id)
        .findLast(
          (item) =>
            ['decision', 'blocked'].includes(item.kind) &&
            item.resolvedAt === undefined &&
            (!decision || (live?.taskId !== undefined && item.taskId === live.taskId)),
        )
      result.decisionId = live?.resolvedAt === undefined && live ? live.id : next?.id
    }
    const dismissed = choice === 'dismiss' || choice === 'inaccurate' || choice === 'mute'
    const progressStatus = this.store.goals.get(goal.id)?.status
    for (const row of rows) {
      const chosen = row.id === selected.id
      const status =
        choice === 'mute' && row.detector === selected.detector
          ? 'muted'
          : dismissed || !chosen
            ? 'dismissed'
            : 'accepted'
      this.store.opportunities.update({
        ...row,
        status,
        outcomeAt: now,
        deliveredAt: row.deliveredAt ?? now,
        ...(choice === 'inaccurate' && chosen ? { falsePositive: true } : {}),
        ...(!chosen && choice !== 'dismiss' ? { neutral: true } : {}),
        ...(status === 'accepted'
          ? { progressStatus, ...(draft ? { awaitsDraft: true, draft } : { progressGoal: goal.id }) }
          : {}),
      })
    }
    this.store.suggestions.consume(n.id, now)
    this.store.notifications.update({ ...current, resolvedAt: now })
    return result
  }

  tick(now: number) {
    const settings = this.settings()
    for (const n of this.store.notifications.list()) if (n.initiative) this.refresh(n, now)
    const rows = this.store.opportunities.list()
    if (!settings.enabled) return
    this.track(rows, now, settings.companion.journal)
    for (const detector of DETECTORS) {
      const feedback = this.feedback(detector)
      if (feedback.adjustment && now - feedback.adjustment.at < 30 * INITIATIVE_DAY) continue
      const adjustment = learnInitiative(
        rows.filter((row) => row.detector === detector),
        now,
        feedback.adjustment?.level ?? settings.detectors[detector].maxLevel,
        feedback.adjustment?.at ?? feedback.since,
      )
      if (!adjustment) continue
      this.store.transaction(() => {
        this.store.setRecallState(adjustKey(detector), { since: feedback.since, adjustment })
        this.store.autopilotEvents.insert({
          id: productionIdGen.next('initiative'),
          at: now,
          action: 'initiative-learning',
          reason: JSON.stringify({ detector, ...adjustment }),
        })
      })
    }
    const byGoal = new Map<GoalId, Opportunity[]>()
    for (const row of rows) {
      if (!row.subject.goalId) continue
      const group = byGoal.get(row.subject.goalId) ?? []
      group.push(row)
      byGoal.set(row.subject.goalId, group)
    }
    for (const [goalId, group] of byGoal) this.queue(goalId, group, now, settings)
  }

  private queue(goalId: GoalId, rows: Opportunity[], now: number, settings: InitiativeSettings) {
    const goal = this.store.goals.get(goalId)
    const scope = this.scopes.activeScopeFor(goalId)
    if (!goal || !scope) return
    const notices = this.store.notifications.forGoal(goalId).filter((n) => n.initiative)
    const lastCard = Math.max(
      -Infinity,
      ...notices.filter((n) => n.initiative?.level === 'L2').map((n) => n.deliveredAt ?? -Infinity),
    )
    const staged = notices.some(
      (n) => n.initiative?.level === 'L2' && n.deliveredAt === undefined && n.resolvedAt === undefined,
    )
    const pending = rows
      .filter(
        (row) =>
          row.status === 'open' &&
          !row.notificationId &&
          !this.muted(goalId, row.detector) &&
          !initiativeInCooldown(row, rows, now, settings.limits.cooldownDays),
      )
      .map((row) => ({ ...row, level: this.level(row, settings) }))
    const batch = initiativeBatch(
      pending,
      now,
      staged ? Infinity : lastCard,
      settings.limits.cardIntervalHours,
    ).slice(0, INITIATIVE_CARD_CAPACITY)
    if (!batch.length) return
    const level = batch.some((row) => row.level === 'L3') ? 'L3' : 'L2'
    const id = NotificationIdSchema.parse(productionIdGen.next('notification'))
    this.store.transaction(() => {
      this.store.notifications.insert({
        id,
        kind: 'initiative',
        priority: level === 'L3' ? 'high' : 'normal',
        dedupeKey: `initiative:${id}`,
        goalId,
        channel: 'panel',
        createdAt: now,
        expiresAt: now + INITIATIVE_TTL,
        decisionBinding: { scopeId: scope.id, scopeHash: scope.hash },
        decisionDelivery: { generation: 0, failures: 0, outcome: 'ready' },
        initiative: { ids: batch.map((row) => row.id), level, goalFingerprint: fingerprint(goal) },
      })
      for (const row of batch) this.store.opportunities.update({ ...row, notificationId: id })
    })
  }

  private track(rows: Opportunity[], now: number, journal: boolean) {
    const changes = this.store.recallState('daily-brief-goal-changes', DailyGoalChangesSchema) ?? []
    for (const row of rows) {
      const at = row.outcomeAt
      if (row.status !== 'accepted' || row.progressClosed || row.progressAt !== undefined || at === undefined)
        continue
      const closed = now >= at + 48 * INITIATIVE_HOUR
      if (!row.progressGoal) {
        if (closed) this.store.opportunities.update({ ...row, progressClosed: true })
        continue
      }
      const goal = this.store.goals.get(row.progressGoal)
      if (!goal) continue
      const end = Math.min(now, at + 48 * INITIATIVE_HOUR)
      const pass =
        !row.awaitsDraft &&
        this.store.verifications
          .forGoal(goal.id)
          .find(
            (record) =>
              record.createdAt > at && record.createdAt <= end && record.judgment.verdict === 'PASS',
          )?.createdAt
      const change = changes.find(
        (record) =>
          record.goalId === goal.id &&
          record.at > at &&
          record.at <= end &&
          (['succeeded', 'completed'].includes(record.status) ||
            (!row.awaitsDraft && row.progressStatus === 'paused' && record.status === 'active')),
      )?.at
      const progressAt = pass || change || undefined
      if (progressAt === undefined) {
        if (closed) this.store.opportunities.update({ ...row, progressClosed: true })
        continue
      }
      this.store.transaction(() => {
        if (journal) {
          const locale = this.locale()
          const finding = initiativeFindingCopy(locale, row.detector).name
          const text =
            locale === 'zh-CN'
              ? `我提出了「${finding}」的建议。你采纳后，目标取得了可验证的进展。`
              : `I raised a ${finding.toLowerCase()} suggestion. The goal made verified progress after you accepted it.`
          this.store.journal.insert({
            id: `initiative:${row.id}`,
            kind: 'experience',
            status: 'active',
            text,
            refs: [row.id, goal.id],
            createdAt: now,
          })
        }
        this.store.opportunities.update({ ...row, progressAt })
      })
    }
  }
}
