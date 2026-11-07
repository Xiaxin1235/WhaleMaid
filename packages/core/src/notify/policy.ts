import { isDecision } from '../model/notification.js'
import type { Notification } from '../model/notification.js'
import type { NotificationPreferences } from './model.js'
/** Shared interruption policy also serves memory proposals, which need no task/authorization binding. */
export type DeliveryNotice = Omit<
  Pick<
    Notification,
    | 'id'
    | 'kind'
    | 'goalId'
    | 'dedupeKey'
    | 'resolvedAt'
    | 'expiresAt'
    | 'deliveryAttemptedAt'
    | 'decisionDelivery'
    | 'remindAt'
    | 'deliveredAt'
    | 'reason'
  >,
  'id' | 'kind' | 'goalId'
> & { id: string; kind: Notification['kind'] | 'memory-proposal'; goalId?: string | undefined }
export interface DeliveryContext {
  now: number
  localMinutes: number
  nextQuietEnd: number
  preferences: NotificationPreferences
  recent: DeliveryNotice[]
  history: DeliveryNotice[]
}
export type DeliveryDecision = {
  action: 'deliver-now' | 'hold' | 'digest' | 'drop'
  until?: number
  reason: string
}
const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3))
export function quietHoursActive(quiet: NotificationPreferences['quietHours'], now: number): boolean {
  if (!quiet) return false
  const start = minutes(quiet.start),
    end = minutes(quiet.end)
  return start !== end && (start < end ? now >= start && now < end : now >= start || now < end)
}
/** Decide interruption policy from explicit time and local-calendar facts, never an ambient clock. */
export function decideDelivery(n: DeliveryNotice, c: DeliveryContext): DeliveryDecision {
  const result = (action: DeliveryDecision['action'], reason: string, until?: number): DeliveryDecision => ({
    action,
    reason,
    ...(until === undefined ? {} : { until }),
  })
  if (n.resolvedAt !== undefined || (n.expiresAt ?? Infinity) <= c.now)
    return result('drop', 'resolved-or-expired')
  const delivery = isDecision(n) ? n.decisionDelivery : undefined
  const reminded = n.remindAt !== undefined && n.remindAt > (n.deliveryAttemptedAt ?? -Infinity)
  if (delivery?.outcome === 'asking') return result('drop', 'asking')
  if (!reminded) {
    if (delivery?.outcome === 'answered' || delivery?.outcome === 'unanswered')
      return result('drop', delivery.reason ?? delivery.outcome)
    if (!delivery && n.deliveryAttemptedAt !== undefined) return result('drop', 'already-attempted')
  }
  if ((n.remindAt ?? 0) > c.now) return result('hold', 'snoozed', n.remindAt)
  if (
    c.history.some(
      (old) =>
        old.id !== n.id &&
        old.dedupeKey === n.dedupeKey &&
        old.deliveredAt !== undefined &&
        old.resolvedAt === undefined &&
        (old.expiresAt ?? Infinity) > c.now,
    )
  )
    return result('drop', 'duplicate-unresolved')
  if (n.kind === 'info') return result('digest', 'ordinary-progress')
  if (c.preferences.muted) return result('hold', 'muted')
  if (quietHoursActive(c.preferences.quietHours, c.localMinutes))
    return result('hold', 'quiet-hours', c.nextQuietEnd)
  if (!reminded && delivery?.retryAt !== undefined && delivery.retryAt > c.now)
    return result('hold', 'retry-backoff', delivery.retryAt)
  const recent = c.recent.filter(
    (old) => old.deliveredAt !== undefined && old.deliveredAt > c.now - 3600000 && old.deliveredAt <= c.now,
  )
  if (recent.length >= c.preferences.maxPerHour)
    return result('hold', 'hourly-limit', Math.min(...recent.map((old) => old.deliveredAt!)) + 3600000)
  if (n.kind === 'progress' && !n.reason?.startsWith('goal-completed:')) {
    const old = c.recent.filter(
      (old) =>
        old.goalId === n.goalId &&
        old.kind === 'progress' &&
        old.deliveredAt !== undefined &&
        old.deliveredAt > c.now - 7200000,
    )
    if (old.length) return result('digest', 'progress-digest')
  }
  return result('deliver-now', 'eligible')
}
