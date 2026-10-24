import type { DeliveryNotice } from '@whaledot/core'
import type { WhaleStore } from '../store/index.js'
/** One shared hourly budget for P04 notifications and memory proposals, including reminders. */
export function notificationDeliveryHistory(store: WhaleStore): DeliveryNotice[] {
  const history = store.notifications.list(),
    attempts = store.notificationDeliveries.list(),
    indexed = new Set(attempts.map((d) => d.notificationId))
  return [
    ...history.filter((n) => !indexed.has(n.id)),
    ...attempts
      .filter((d) => d.result !== 'failed')
      .flatMap((d) => {
        const n = store.notifications.get(d.notificationId)
        return n ? [{ ...n, deliveredAt: d.at }] : []
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
