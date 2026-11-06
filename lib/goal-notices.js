import { NotificationIdSchema, SuggestionIdSchema, t, goalDecisionChoices } from '#whalemaid/core';
import { productionIdGen } from './store/index.js';
/** Persist goal-bound notices; task acceptance and task versions are deliberately independent. */
export function goalNotice(store, goal, reason, locale, choices = ['resume-goal', 'pause-goal'], kind = 'decision') {
    choices = goalDecisionChoices(choices, reason, kind);
    const dedupeKey = `${goal.id}:goal:${reason}`;
    if (store.notifications
        .list()
        .some((n) => n.dedupeKey === dedupeKey && n.resolvedAt === undefined && (n.expiresAt ?? Infinity) > Date.now()))
        return;
    const id = NotificationIdSchema.parse(productionIdGen.next('notification'));
    const at = Date.now(), expiresAt = at + 86400000;
    store.notifications.insert({
        id,
        goalId: goal.id,
        kind,
        priority: kind === 'progress' ? 'normal' : 'high',
        dedupeKey,
        reason,
        createdAt: at,
        channel: 'panel',
        expiresAt,
        choices,
    });
    for (const choice of choices)
        store.suggestions.insert({
            id: SuggestionIdSchema.parse(productionIdGen.next('suggestion')),
            notificationId: id,
            label: t(locale, choice === 'pause-goal' ? 'pauseGoal' : 'resumeDecision'),
            intent: { type: 'panel-decision', choice },
            riskLevel: 'low',
            expiresAt,
            bindTo: { goalId: goal.id },
        });
}
//# sourceMappingURL=goal-notices.js.map