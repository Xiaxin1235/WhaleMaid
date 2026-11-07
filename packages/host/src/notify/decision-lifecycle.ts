import { isDecision } from '@whalemaid/core'
import type { Notification } from '@whalemaid/core'
import type { ScopeService } from '../scope-service.js'
import { productionIdGen } from '../store/index.js'
import type { WhaleStore } from '../store/index.js'

const decisionWindow = 86400000
const waitingStates = new Set(['WAITING_APPROVAL', 'FAILED', 'BLOCKED', 'PAUSED'])
type Scopes = Pick<ScopeService, 'activeScopeFor'>

/** Reconcile the underlying decision before using its options, independently of interruption policy. */
export function refreshDecision(
  store: WhaleStore,
  scopes: Scopes,
  n: Notification,
  now = Date.now(),
): Notification {
  if (!isDecision(n) || n.resolvedAt !== undefined || n.routingSuggestionId) return n
  const scope = scopes.activeScopeFor(n.goalId)
  const goal = store.goals.get(n.goalId)
  const task = n.taskId ? store.tasks.get(n.taskId) : undefined
  const run = n.taskId ? store.runs.list(n.taskId).at(-1) : undefined
  const transitionId = n.taskId ? (store.transitions.list(n.taskId).at(-1)?.id ?? null) : undefined
  const old = n.decisionBinding
  const legacy = old
    ? undefined
    : (n.suggestionIds ?? [])
        .map((id) => store.suggestions.get(id)?.bindTo)
        .find((binding) => binding && 'scopeHash' in binding)
  const authorizationChanged =
    !scope ||
    (old
      ? old.scopeId !== scope.id || old.scopeHash !== scope.hash
      : legacy && 'scopeHash' in legacy && 'scopeId' in legacy
        ? legacy.scopeId !== scope.id || legacy.scopeHash !== scope.hash
        : run?.run_id === n.runId && run?.runScope
          ? run.runScope.originScopeId !== scope.id || run.runScope.originScopeHash !== scope.hash
          : scope.grantedAt > n.createdAt)
  const changed = !!n.taskId && task?.version !== n.taskVersion
  const superseded =
    !goal ||
    ['succeeded', 'completed', 'cancelled'].includes(goal.status) ||
    (!!n.taskId &&
      (!task ||
        !waitingStates.has(task.state) ||
        task.goalId !== n.goalId ||
        ((changed || n.runId !== undefined) && run?.run_id !== n.runId) ||
        (old?.transitionId !== undefined && old.transitionId !== transitionId) ||
        (changed && old?.transitionId === undefined)))
  if (authorizationChanged || superseded) {
    const result = authorizationChanged ? 'expired' : 'superseded'
    const detail = authorizationChanged ? 'authorization-invalid' : 'decision-no-longer-current'
    const retired: Notification = {
      ...n,
      resolvedAt: now,
      resolvedReason: result,
      deliveryState: 'dropped',
      deliveryReason: detail,
      nextDeliveryAt: undefined,
    }
    store.transaction(() => {
      store.suggestions.consume(n.id, now)
      store.notifications.update(retired)
      store.notificationDeliveries.insert({
        id: productionIdGen.next('delivery'),
        goalId: n.goalId,
        notificationId: n.id,
        at: now,
        result,
        detail,
        generation: n.decisionDelivery?.generation ?? 0,
      })
    })
    return retired
  }
  const renew = (n.expiresAt ?? Infinity) <= now
  if (!changed && !renew && old) return n
  const expiresAt = renew ? now + decisionWindow : n.expiresAt
  const updated: Notification = {
    ...n,
    expiresAt,
    decisionBinding: old ?? {
      scopeId: scope!.id,
      scopeHash: scope!.hash,
      transitionId,
    },
  }
  store.transaction(() => {
    if (changed) {
      const delivery = n.decisionDelivery
      const preserveOutcome =
        delivery?.outcome === 'unanswered' ||
        delivery?.outcome === 'answered' ||
        delivery?.outcome === 'failed'
      updated.taskVersion = task!.version
      updated.suggestionIds = []
      updated.decisionDelivery = {
        generation: (delivery?.generation ?? 0) + 1,
        failures: delivery?.failures ?? 0,
        outcome: preserveOutcome ? delivery.outcome : 'cancelled',
        reason: preserveOutcome ? delivery.reason : 'task-version-refreshed',
        retryAt: delivery?.retryAt,
      }
      if (!preserveOutcome) {
        updated.deliveryState = 'cancelled'
        updated.deliveryReason = 'task-version-refreshed'
        updated.nextDeliveryAt = undefined
      }
      store.suggestions.consume(n.id, now)
      store.notificationDeliveries.insert({
        id: productionIdGen.next('delivery'),
        goalId: n.goalId,
        notificationId: n.id,
        at: now,
        result: 'generated',
        detail: 'task-version-refreshed',
        generation: updated.decisionDelivery.generation,
      })
    } else if (renew) {
      for (const id of n.suggestionIds ?? []) {
        const option = store.suggestions.get(id)
        if (option && option.consumedAt === undefined)
          store.suggestions.update({ ...option, expiresAt: expiresAt! })
      }
    }
    store.notifications.update(updated)
  })
  return updated
}
