import {
  buildSuggestions,
  decideDelivery,
  notificationCopy,
  NotificationIdSchema,
  goalDecisionCopy,
} from '@whaledot/core'
import type { Notification, NotificationFacts, Locale, GoalId } from '@whaledot/core'
import type { WhaleStore } from '../store/index.js'
import { productionClock, productionIdGen } from '../store/index.js'
import type { ScopeService } from '../scope-service.js'
import type { InboxPort } from './inbox-session.js'
import type { NotificationRouter } from './router.js'
import { notificationDeliveryHistory } from './history.js'
/** Deliver one durable attempt per notification generation; unhandled/cancelled asks never nag. */
export class NotificationDeliverer {
  private stopped = true
  private stopWatch: (() => void) | undefined
  private timer: ReturnType<typeof setInterval> | undefined
  private debounce: ReturnType<typeof setTimeout> | undefined
  private readonly pending = new Map<
    string,
    {
      controller: AbortController
      work: Promise<void>
      goalId: GoalId
      selectionId: string | undefined
      attemptAt: number
      responding: boolean
      expiry: ReturnType<typeof setTimeout>
    }
  >()
  constructor(
    readonly store: WhaleStore,
    private readonly scopes: Pick<ScopeService, 'activeScopeFor'>,
    private readonly inbox: InboxPort,
    private readonly router: NotificationRouter,
    private readonly locale: () => Locale,
    private readonly log: (message: string, error?: unknown) => void,
  ) {}
  /** Register state-change observation only after migrations, recovery and tool gates are ready. */
  start(): void {
    if (!this.stopped || this.store.status().state !== 'ok') return
    this.stopped = false
    this.stopWatch = this.store.watchChanges(() => {
      this.cancelInvalid()
      this.mark()
    })
    this.timer = setInterval(() => this.mark(), 60000)
    this.timer.unref()
    this.mark()
  }
  private mark(): void {
    if (this.stopped) return
    clearTimeout(this.debounce)
    this.debounce = setTimeout(() => {
      void this.sweep().catch((e) => this.log('notification sweep failed', e))
    }, 100)
    this.debounce.unref()
  }
  private cancelInvalid(): void {
    for (const [id, entry] of this.pending) {
      if (entry.responding) continue
      const n = this.store.notifications.get(id)
      if (
        !n ||
        !this.valid(n) ||
        this.store.notificationPreferences().muted ||
        n.lastSelectionId !== entry.selectionId ||
        (n.remindAt ?? 0) > entry.attemptAt
      )
        entry.controller.abort(new Error('notification-no-longer-valid'))
    }
  }
  private valid(n: Notification): boolean {
    if (
      n.resolvedAt !== undefined ||
      n.routingSuggestionId ||
      (n.expiresAt ?? Infinity) <= Date.now() ||
      !this.scopes.activeScopeFor(n.goalId)
    )
      return false
    return !n.taskId || this.store.tasks.get(n.taskId)?.version === n.taskVersion
  }
  /** Panel views share deterministic copy and the same persisted option identities. */
  center(goalId?: string) {
    const items = this.store.notifications
      .list()
      .filter((n) => !goalId || n.goalId === goalId)
      .map((n) => {
        const suggestions =
          n.resolvedAt === undefined
            ? this.router.options(n)
            : this.store.suggestions.list().filter((s) => s.notificationId === n.id)
        return {
          goal: (() => {
            const goal = this.store.goals.get(n.goalId)
            return goal
              ? { id: goal.id, title: goal.title, version: goal.version, status: goal.status }
              : undefined
          })(),
          notification: this.store.notifications.get(n.id)!,
          copy: notificationCopy(n, this.facts(n), this.locale()),
          suggestions,
          notes: this.store.userNotes.list(n.goalId).filter((note) => note.notificationId === n.id),
          choices: this.store.notificationChoices.list(n.goalId).filter((c) => c.notificationId === n.id),
        }
      })
    return { preferences: this.store.notificationPreferences(), items }
  }
  /** Structured evidence only; absence is displayed as unknown, never synthesized as zero. */
  facts(n: Notification): NotificationFacts {
    const tasks = this.store.tasks.list(n.goalId),
      reports = this.store.verifications.list().filter((r) => tasks.some((t) => t.id === r.taskId)),
      scorable = reports.filter((r) => r.current.length)
    const failed = (results: (typeof reports)[number]['current']) =>
      results.length && results.every((r) => r.counts)
        ? results.reduce((sum, r) => sum + r.counts!.failed, 0)
        : undefined
    const task = n.taskId ? this.store.tasks.get(n.taskId) : undefined
    return {
      goalTitle: this.store.goals.get(n.goalId)?.title ?? '',
      ...(task ? { taskTitle: task.title } : {}),
      completedTasks: tasks.filter((t) => t.state === 'SUCCEEDED').length,
      ...(scorable[0] ? { beforeFailed: failed(scorable[0].baseline) } : {}),
      ...(scorable.at(-1) ? { afterFailed: failed(scorable.at(-1)!.current) } : {}),
    }
  }
  /** Refresh currently pending requests and admit new ones using fresh policy and authorization. */
  async sweep(): Promise<void> {
    if (this.stopped || this.store.status().state !== 'ok') return
    this.cancelInvalid()
    for (const n of this.store.notifications.list()) {
      if (this.pending.has(n.id)) continue
      if (!this.valid(n)) continue
      const now = Date.now(),
        date = new Date(now),
        prefs = this.store.notificationPreferences(),
        end = prefs.quietHours?.end ?? '00:00',
        quietEnd = new Date(now)
      quietEnd.setHours(Number(end.slice(0, 2)), Number(end.slice(3)), 0, 0)
      if (quietEnd.getTime() <= now) quietEnd.setDate(quietEnd.getDate() + 1)
      const history = this.store.notifications.list()
      const decision = decideDelivery(n, {
        now,
        localMinutes: date.getHours() * 60 + date.getMinutes(),
        nextQuietEnd: quietEnd.getTime(),
        preferences: prefs,
        recent: notificationDeliveryHistory(this.store),
        history,
      })
      if (decision.action === 'drop') continue
      this.router.options(n)
      if (decision.action !== 'deliver-now') {
        const state = decision.action === 'digest' ? 'digest' : decision.reason === 'muted' ? 'muted' : 'held'
        if (
          n.deliveryState !== state ||
          n.deliveryReason !== decision.reason ||
          n.nextDeliveryAt !== decision.until
        )
          this.store.notifications.update({
            ...n,
            deliveryState: state,
            deliveryReason: decision.reason,
            nextDeliveryAt: decision.until,
          })
        continue
      }
      if ([...this.pending.values()].some((entry) => entry.goalId === n.goalId)) continue
      await this.inbox.prepare?.(n.goalId)
      if (this.pending.has(n.id) || !this.valid(this.store.notifications.get(n.id)!)) continue
      const controller = new AbortController()
      const work = this.send(n, controller)
        .catch((error) => this.log('notification delivery failed', error))
        .finally(() => {
          clearTimeout(this.pending.get(n.id)?.expiry)
          this.pending.delete(n.id)
          this.mark()
        })
      const expiry = setTimeout(
        () => controller.abort(new Error('notification-expired')),
        Math.max(0, Math.min(2147483647, (n.expiresAt ?? Date.now() + 86400000) - Date.now())),
      )
      expiry.unref()
      this.pending.set(n.id, {
        controller,
        work,
        goalId: n.goalId,
        expiry,
        selectionId: n.lastSelectionId,
        attemptAt: this.store.notifications.get(n.id)!.deliveryAttemptedAt!,
        responding: false,
      })
    }
  }
  private async send(n: Notification, controller: AbortController): Promise<void> {
    const scope = this.scopes.activeScopeFor(n.goalId)!
    const task = n.taskId ? this.store.tasks.get(n.taskId) : undefined
    const choices = buildSuggestions(n, task, this.store.notificationChoices.list(), {
      clock: productionClock,
      idGen: productionIdGen,
      locale: this.locale(),
      scope,
      goalVersion: this.store.goals.get(n.goalId)!.version,
    })
    const at = Date.now(),
      deliveryId = productionIdGen.next('delivery')
    const generation = n.deliveryAttemptedAt
    this.store.transaction(() => {
      const current = this.store.notifications.get(n.id)!
      if (current.deliveryAttemptedAt !== generation || !this.valid(current))
        throw Error('notification-already-claimed')
      this.store.suggestions.consume(n.id, at)
      for (const s of choices) this.store.suggestions.insert(s)
      this.store.notifications.update({
        ...current,
        channel: 'dsh-question',
        suggestionIds: choices.map((s) => s.id),
        deliveryAttemptedAt: at,
        deliveredAt: at,
        deliveryState: 'delivered',
        deliveryReason: 'dispatched',
        nextDeliveryAt: undefined,
      })
      this.store.notificationDeliveries.insert({
        id: deliveryId,
        goalId: n.goalId,
        notificationId: n.id,
        at,
        result: 'started',
      })
    })
    const copy = notificationCopy(n, this.facts(n), this.locale())
    try {
      const answer = await this.inbox.ask(
        n.goalId,
        {
          id: n.id,
          ...copy,
          ...(n.choices?.includes('change-direction')
            ? { detail: copy.detail + '\n\n' + goalDecisionCopy(this.locale()).inboxHint }
            : {}),
          options: choices.map((s) => ({ label: s.label, description: s.description! })),
          multiSelect: false,
        },
        controller.signal,
      )
      controller.signal.throwIfAborted()
      const pending = this.pending.get(n.id)
      if (pending) pending.responding = true
      const item = answer.answers.find((a) => a.id === n.id)
      const direction = choices.find(
        (s) => s.intent.type === 'panel-decision' && s.intent.choice === 'change-direction',
      )
      if (
        item?.custom?.trim() &&
        direction &&
        (item.selected.length === 0 || (item.selected.length === 1 && item.selected[0] === direction.label))
      ) {
        const result = await this.router.route({
          suggestionId: direction.id,
          source: 'inbox',
          direction: item.custom,
        })
        if (!result.ok) this.info(n, result.reason ?? 'option-expired')
      } else if (item?.custom?.trim() && direction) this.info(n, 'option-expired')
      else {
        if (item?.custom?.trim())
          this.store.userNotes.insert({
            id: productionIdGen.next('user-note'),
            goalId: n.goalId,
            notificationId: n.id,
            at: Date.now(),
            text: Array.from(item.custom.trim()).slice(0, 500).join(''),
          })
        const selected = item?.selected ?? []
        if (selected.length === 1) {
          const s = choices.find((s) => s.label === selected[0])
          if (s) {
            const result = await this.router.route({ suggestionId: s.id, source: 'inbox' })
            if (!result.ok) this.info(n, result.reason ?? 'option-expired')
          } else this.info(n, 'option-expired')
        } else if (selected.length > 1) this.info(n, 'option-expired')
      }
      this.store.notificationDeliveries.update({
        ...this.store.notificationDeliveries.get(deliveryId)!,
        result: 'answered',
      })
    } catch (error) {
      if (this.store.status().state !== 'ok') return
      const cancelled = controller.signal.aborted
      const current = this.store.notifications.get(n.id)
      if (current)
        this.store.notifications.update({
          ...current,
          deliveryState: cancelled ? 'cancelled' : 'failed',
          deliveryReason: cancelled ? 'cancelled' : 'delivery-failed',
          ...(!cancelled ? { deliveredAt: n.deliveredAt } : {}),
        })
      this.store.notificationDeliveries.update({
        ...this.store.notificationDeliveries.get(deliveryId)!,
        result: cancelled ? 'cancelled' : 'failed',
        detail: cancelled ? 'request-aborted' : 'question-service-failed',
      })
      if (!cancelled) this.log('question service failed', error)
    }
  }
  private info(n: Notification, reason: string): void {
    this.store.notifications.insert({
      id: NotificationIdSchema.parse(productionIdGen.next('notification')),
      goalId: n.goalId,
      kind: 'info',
      priority: 'low',
      dedupeKey: n.id + ':' + reason,
      channel: 'panel',
      createdAt: Date.now(),
      reason,
      expiresAt: Date.now() + 86400000,
    })
  }
  /** Cancel asks and stop all new delivery work; waiting cannot retain the plugin beyond five seconds. */
  async dispose(): Promise<void> {
    this.stopped = true
    this.stopWatch?.()
    clearInterval(this.timer)
    clearTimeout(this.debounce)
    for (const entry of this.pending.values()) {
      clearTimeout(entry.expiry)
      entry.controller.abort(new Error('notifier-disposed'))
    }
    let deadline: ReturnType<typeof setTimeout> | undefined
    await Promise.race([
      Promise.allSettled([...this.pending.values()].map((e) => e.work)),
      new Promise<void>((resolve) => {
        deadline = setTimeout(resolve, 5000)
      }),
    ])
    clearTimeout(deadline)
  }
}
