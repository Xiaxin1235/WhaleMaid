import { isDecision } from '@whalemaid/core'
import type { DeliveryNotice } from '@whalemaid/core'
import type { WhaleStore } from '../store/index.js'
/** One shared hourly budget for P04 notifications and memory proposals, including reminders. */
export function notificationDeliveryHistory(store: WhaleStore): DeliveryNotice[] {
  const history = store.notifications.list(),
    attempts = store.notificationDeliveries
      .list()
      .filter((d) => ['started', 'answered', 'unanswered', 'cancelled', 'failed'].includes(d.result)),
    indexed = new Set(attempts.map((d) => d.notificationId))
  return [
    ...history.filter((n) => !indexed.has(n.id)),
    ...attempts.flatMap((d) => {
      const n = store.notifications.get(d.notificationId)
      return n && (d.result !== 'failed' || isDecision(n)) ? [{ ...n, deliveredAt: d.at }] : []
    }),
    ...store.memoryProposals.list().map((p) => ({
      id: p.id,
      kind: 'memory-proposal' as const,
      goalId: p.goalId,
      dedupeKey: p.id,
      expiresAt: p.expiresAt,
      ...(p.notifiedAt === undefined ? {} : { deliveredAt: p.notifiedAt, deliveryAttemptedAt: p.notifiedAt }),
      ...(p.status === 'pending' ? {} : { resolvedAt: p.resolvedAt ?? p.expiresAt }),
    })),
  ]
}
