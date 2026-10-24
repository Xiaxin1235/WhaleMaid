import { SuggestionIdSchema } from '../model/ids.js'
import type { Task } from '../model/task.js'
import type { Notification, Suggestion } from '../model/notification.js'
import type { AuthorizationScope } from '../model/authorization.js'
import type { Clock, IdGen } from '../infra.js'
import type { Locale } from '../i18n/index.js'
import type { DecisionChoice } from '../verify/model.js'
import type { NotificationChoice } from './model.js'
import { notificationReason } from './copy.js'
import { notificationMessages } from '../i18n/notifications.js'
export type NotificationAction = DecisionChoice | 'snooze' | 'open-panel'
const safety: Record<NotificationAction, number> = {
  'view-diff': 0,
  'open-panel': 1,
  snooze: 2,
  'pause-goal': 3,
  verify: 4,
  'resume-goal': 5,
  retry: 6,
  accept: 7,
  rollback: 8,
  'change-direction': 7,
  abandon: 9,
}
/** Create an immutable stored option; labels are presentation, while intent and bindings own execution. */
export function suggestionForAction(
  n: Notification,
  task: Task | undefined,
  action: NotificationAction,
  deps: { clock: Clock; idGen: IdGen; locale: Locale; scope: AuthorizationScope; goalVersion?: number },
): Suggestion {
  const [label, description] = notificationMessages[deps.locale][action]
  return {
    id: SuggestionIdSchema.parse(deps.idGen.next('suggestion')),
    notificationId: n.id,
    label,
    description,
    intent:
      action === 'snooze' || action === 'open-panel'
        ? { type: 'notification-action', action }
        : { type: 'panel-decision', choice: action },
    riskLevel:
      action === 'accept' || action === 'rollback' || action === 'abandon'
        ? 'high'
        : action === 'retry' || action === 'resume-goal' || action === 'change-direction'
          ? 'medium'
          : 'low',
    expiresAt: n.expiresAt ?? deps.clock.now() + 86400000,
    bindTo: {
      goalId: n.goalId,
      notificationId: n.id,
      ...(task ? { taskId: task.id, taskVersion: task.version } : {}),
      scopeId: deps.scope.id,
      scopeHash: deps.scope.hash,
      ...(deps.goalVersion === undefined ? {} : { goalVersion: deps.goalVersion }),
    },
  }
}
/** Select a fixed set before personalization: at most two domain choices plus the two common options. */
export function buildSuggestions(
  n: Notification,
  task: Task | undefined,
  history: NotificationChoice[],
  deps: Parameters<typeof suggestionForAction>[3],
): Suggestion[] {
  const priority: DecisionChoice[] = [
    'change-direction',
    'verify',
    'retry',
    'resume-goal',
    'view-diff',
    'pause-goal',
    'rollback',
    'accept',
  ]
  const actions: NotificationAction[] = [
    ...priority.filter((choice) => n.choices?.includes(choice)).slice(0, 2),
    'snooze',
    'open-panel',
  ]
  const frequency = (action: NotificationAction) =>
    history.filter(
      (h) => h.reason === notificationReason(n) && h.action === action && h.result === 'succeeded',
    ).length
  return actions
    .map((action, index) => ({ action, index }))
    .sort(
      (a, b) =>
        frequency(b.action) - frequency(a.action) || safety[a.action] - safety[b.action] || a.index - b.index,
    )
    .map(({ action }) => suggestionForAction(n, task, action, deps))
}
