import type { Notification } from '../model/notification.js'
import type { NotificationPreferences } from './model.js'
export interface DeliveryContext {
  now: number
  localMinutes: number
  nextQuietEnd: number
  preferences: NotificationPreferences
  recent: Notification[]
  history: Notification[]
}
export type DeliveryDecision = {
  action: 'deliver-now' | 'hold' | 'digest' | 'drop'
  until?: number
  reason: string
}
const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3))
/** Decide interruption policy from explicit time and local-calendar facts, never an ambient clock. */
export function decideDelivery(n: Notification, c: DeliveryContext): DeliveryDecision {
  const result = (action: DeliveryDecision['action'], reason: string, until?: number): DeliveryDecision => ({
    action,
    reason,
    ...(until === undefined ? {} : { until }),
  })
  if (n.resolvedAt !== undefined || (n.expiresAt ?? Infinity) <= c.now)
    return result('drop', 'resolved-or-expired')
  if (n.deliveryAttemptedAt !== undefined && (n.remindAt ?? -Infinity) <= n.deliveryAttemptedAt)
    return result('drop', 'already-attempted')
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
  const quiet = c.preferences.quietHours
  if (quiet) {
    const start = minutes(quiet.start),
      end = minutes(quiet.end),
      now = c.localMinutes
    if (start !== end && (start < end ? now >= start && now < end : now >= start || now < end))
      return result('hold', 'quiet-hours', c.nextQuietEnd)
  }
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
