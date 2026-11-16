import { SuggestionIdSchema } from '../model/ids.js';
import { notificationReason } from './copy.js';
import { notificationMessages } from '../i18n/notifications.js';
/** Create an immutable stored option; labels are presentation, while intent and bindings own execution. */
export function suggestionForAction(n, task, action, deps) {
    const [label, description] = notificationMessages[deps.locale][action];
    return {
        id: SuggestionIdSchema.parse(deps.idGen.next('suggestion')),
        notificationId: n.id,
        label,
        description,
        intent: action === 'snooze' || action === 'open-panel'
            ? { type: 'notification-action', action }
            : { type: 'panel-decision', choice: action },
        riskLevel: action === 'accept' || action === 'rollback' || action === 'abandon'
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
            ...(n.decisionDelivery ? { generation: n.decisionDelivery.generation } : {}),
            scopeHash: deps.scope.hash,
            ...(deps.goalVersion === undefined ? {} : { goalVersion: deps.goalVersion }),
        },
    };
}
// Each row selects legal mandatory choices before filling the remaining slots.
const mandatory = {
    verification: ['accept', 'retry', 'rollback'],
    unknown: ['verify', 'accept'],
    blocked: ['resume-goal', 'retry', 'change-direction'],
};
const blockedReasons = new Set([
    'stalled',
    'execution-needs-owner',
    'execution-stopped',
    'execution-preflight-blocked',
    'autopilot-disabled',
    'reconcile-blocked',
    'planner-need-user',
]);
/** Personalization orders the selected options without changing membership. */
export function buildSuggestions(n, task, history, deps) {
    const legal = n.choices ?? [];
    const reason = notificationReason(n);
    const candidates = reason === 'verification-unknown'
        ? mandatory.unknown
        : n.kind === 'blocked' || blockedReasons.has(reason) || !legal.includes('accept')
            ? mandatory.blocked
            : mandatory.verification;
    const required = candidates.filter((action) => legal.includes(action));
    if (candidates === mandatory.blocked && required.includes('resume-goal') && required.includes('retry'))
        required.splice(required.indexOf('retry'), 1);
    const actions = [
        ...new Set([
            ...required,
            'snooze',
            ...['pause-goal', 'view-diff'].filter((action) => legal.includes(action)),
            'open-panel',
        ]),
    ].slice(0, 4);
    const frequency = (action) => history.filter((h) => h.reason === notificationReason(n) && h.action === action && h.result === 'succeeded').length;
    return actions
        .map((action, index) => ({ action, index }))
        .sort((a, b) => frequency(b.action) - frequency(a.action) || a.index - b.index)
        .map(({ action }) => suggestionForAction(n, task, action, deps));
}
//# sourceMappingURL=suggestions.js.map