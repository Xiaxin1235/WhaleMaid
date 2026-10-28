import { checkAction, buildSuggestions, suggestionForAction, notificationReason, NotificationIdSchema, DirectionSchema, } from '#whalemaid/core';
import { productionClock, productionIdGen } from '../store/index.js';
import { z } from 'zod';
/** One durable claim precedes every effect, regardless of the display label or originating UI. */
export class NotificationRouter {
    store;
    scopes;
    verifier;
    locale;
    wake;
    goalDecisions;
    constructor(store, scopes, verifier, locale, wake, goalDecisions) {
        this.store = store;
        this.scopes = scopes;
        this.verifier = verifier;
        this.locale = locale;
        this.wake = wake;
        this.goalDecisions = goalDecisions;
    }
    /** Build the fixed recommendation set even when reminders are muted or held. */
    options(n) {
        const goalVersion = this.store.goals.get(n.goalId)?.version;
        const scope = this.scopes.activeScopeFor(n.goalId), task = n.taskId ? this.store.tasks.get(n.taskId) : undefined;
        if (!scope ||
            n.resolvedAt !== undefined ||
            (n.expiresAt ?? Infinity) <= Date.now() ||
            (n.taskId && task?.version !== n.taskVersion))
            return [];
        const old = (n.suggestionIds ?? []).flatMap((id) => {
            const s = this.store.suggestions.get(id);
            return s ? [s] : [];
        });
        if (old.length &&
            old.every((s) => 'scopeHash' in s.bindTo &&
                s.bindTo.scopeHash === scope.hash &&
                s.expiresAt > Date.now() &&
                (!n.choices?.includes('change-direction') || s.bindTo.goalVersion === goalVersion)))
            return old;
        const options = buildSuggestions(n, task, this.store.notificationChoices.list(), {
            clock: productionClock,
            idGen: productionIdGen,
            locale: this.locale(),
            scope,
            ...(goalVersion === undefined ? {} : { goalVersion }),
        });
        this.store.transaction(() => {
            for (const s of options)
                this.store.suggestions.insert(s);
            this.store.notifications.update({
                ...this.store.notifications.get(n.id),
                suggestionIds: options.map((s) => s.id),
            });
        });
        return options;
    }
    validate(s) {
        const n = this.store.notifications.get(s.notificationId);
        if (!n ||
            s.consumedAt !== undefined ||
            s.expiresAt <= Date.now() ||
            n.resolvedAt !== undefined ||
            (n.expiresAt ?? Infinity) <= Date.now() ||
            n.routingSuggestionId)
            throw Error('option-stale-or-consumed');
        if (!('notificationId' in s.bindTo) || s.bindTo.notificationId !== n.id || s.bindTo.goalId !== n.goalId)
            throw Error('option-binding-invalid');
        const scope = this.scopes.activeScopeFor(n.goalId);
        if (!scope || scope.id !== s.bindTo.scopeId || scope.hash !== s.bindTo.scopeHash)
            throw Error('option-authorization-changed');
        if (s.bindTo.taskId &&
            (n.taskId !== s.bindTo.taskId ||
                n.taskVersion !== s.bindTo.taskVersion ||
                this.store.tasks.get(s.bindTo.taskId)?.version !== s.bindTo.taskVersion))
            throw Error('option-task-changed');
        let action;
        if (s.intent.type === 'panel-decision') {
            if (!n.choices?.includes(s.intent.choice))
                throw Error('option-not-offered');
            if (s.intent.choice === 'rollback') {
                const checkpoint = this.store.checkpoints
                    .list(n.goalId)
                    .filter((c) => c.taskId === n.taskId)
                    .at(-1);
                if (!checkpoint)
                    throw Error('checkpoint-binding-required');
                action = { type: 'rollback-to-checkpoint', checkpointId: checkpoint.id };
            }
            else
                action =
                    s.intent.choice === 'pause-goal' || s.intent.choice === 'abandon'
                        ? { type: 'pause-goal', goalId: n.goalId }
                        : s.intent.choice === 'resume-goal'
                            ? { type: 'resume-goal', goalId: n.goalId }
                            : s.intent.choice === 'view-diff'
                                ? { type: 'open-workbench' }
                                : { type: 'continue-goal', goalId: n.goalId };
        }
        else if (s.intent.type === 'notification-action')
            action = { type: 'open-workbench' };
        else
            throw Error('unsupported-notification-intent');
        const gate = checkAction(scope, action);
        if (gate.decision !== 'allow')
            throw Error(gate.ruleId);
        return n;
    }
    /** Route the persisted intent, never a caller-supplied action or free-text answer. */
    async route(input) {
        if (input.source === 'panel' &&
            (!input.peer || input.peer.principal.kind !== 'owner' || input.peer.signal.aborted))
            return { ok: false, reason: 'owner-required' };
        let s, n, choiceId, reviewedVersion, direction;
        try {
            this.store.transaction(() => {
                s = this.store.suggestions.get(input.suggestionId);
                if (!s)
                    throw Error('option-not-found');
                n = this.validate(s);
                if (s.intent.type === 'panel-decision' && ['abandon', 'change-direction'].includes(s.intent.choice)) {
                    if (!this.goalDecisions)
                        throw Error('goal-decisions-unavailable');
                    if (s.intent.choice === 'abandon' && (input.source !== 'panel' || input.confirm !== true))
                        throw Error('panel-confirmation-required');
                    const bound = 'goalVersion' in s.bindTo ? s.bindTo.goalVersion : undefined;
                    reviewedVersion = input.goalVersion ?? bound;
                    if (reviewedVersion === undefined ||
                        bound !== reviewedVersion ||
                        this.store.goals.get(n.goalId)?.version !== reviewedVersion)
                        throw Error('decision-state-changed');
                    if (s.intent.choice === 'change-direction')
                        direction = DirectionSchema.parse(input.direction ?? '');
                }
                this.store.suggestions.update({ ...s, consumedAt: Date.now() });
                this.store.notifications.update({ ...n, routingSuggestionId: s.id, lastSelectionId: s.id });
                choiceId = productionIdGen.next('choice');
                const action = s.intent.type === 'panel-decision'
                    ? s.intent.choice
                    : s.intent.type === 'notification-action'
                        ? s.intent.action
                        : 'unsupported';
                this.store.notificationChoices.insert({
                    id: choiceId,
                    goalId: n.goalId,
                    notificationId: n.id,
                    suggestionId: s.id,
                    reason: notificationReason(n),
                    action,
                    source: input.source,
                    at: Date.now(),
                    result: 'pending',
                });
            });
            let result = { ok: true, goalId: n.goalId };
            if (s.intent.type === 'panel-decision' &&
                (s.intent.choice === 'abandon' || s.intent.choice === 'change-direction'))
                result = {
                    ...result,
                    ...(await this.goalDecisions.apply(n.id, s.intent.choice, {
                        source: input.source,
                        confirm: input.confirm,
                        goalVersion: reviewedVersion,
                        direction,
                    })),
                };
            else if (s.intent.type === 'panel-decision')
                result = {
                    ...result,
                    ...(await this.verifier.resolveDecision(n.id, s.intent.choice)),
                    ...(s.intent.choice === 'view-diff' ? { openPanel: true } : {}),
                };
            else if (s.intent.type === 'notification-action') {
                if (s.intent.action === 'snooze') {
                    const now = Date.now();
                    const current = this.store.notifications.get(n.id);
                    this.store.notifications.update({
                        ...current,
                        snoozedUntil: now + 3600000,
                        remindAt: now + 3600000,
                        deliveryState: 'held',
                        deliveryReason: 'snoozed',
                        nextDeliveryAt: now + 3600000,
                    });
                }
                else
                    result.openPanel = true;
            }
            this.store.transaction(() => {
                const fresh = this.store.notifications.get(n.id);
                this.store.notifications.update({
                    ...fresh,
                    routingSuggestionId: undefined,
                    ...(fresh.resolvedAt !== undefined ? { resolvedSource: input.source } : {}),
                });
                this.store.notificationChoices.update({
                    ...this.store.notificationChoices.get(choiceId),
                    result: 'succeeded',
                    ...(direction ? { detail: direction } : result.stat ? { detail: result.stat } : {}),
                });
                this.event(n.goalId, 'notification-choice', input.source + ':' + this.store.notificationChoices.get(choiceId).action);
            });
            this.wake(n.goalId);
            return result;
        }
        catch (error) {
            const reason = error instanceof z.ZodError
                ? (error.issues[0]?.message ?? 'invalid-direction')
                : error instanceof Error
                    ? error.message
                    : 'notification-route-error';
            if (n && s && this.store.status().state === 'ok') {
                const fresh = this.store.notifications.get(n.id);
                if (fresh?.routingSuggestionId === s.id)
                    this.store.notifications.update({ ...fresh, routingSuggestionId: undefined });
            }
            if (choiceId) {
                const row = this.store.notificationChoices.get(choiceId);
                if (row)
                    this.store.notificationChoices.update({ ...row, result: 'failed', detail: reason });
            }
            const invalidText = [
                'direction-required',
                'direction-too-long',
                'contains-secret',
                'panel-confirmation-required',
            ].includes(reason);
            if (input.source === 'inbox' && n && !invalidText)
                this.expired(n);
            else if (input.source === 'inbox' && s && !invalidText) {
                const notice = this.store.notifications.get(s.notificationId);
                if (notice)
                    this.expired(notice);
            }
            return { ok: false, reason };
        }
    }
    /** Preserve P09 panel actions by minting only choices already offered by the ledger. */
    async routeChoice(notificationId, action, peer, extra = {}) {
        if (peer.principal.kind !== 'owner' || peer.signal.aborted)
            return { ok: false, reason: 'owner-required' };
        const n = this.store.notifications.get(notificationId), scope = n && this.scopes.activeScopeFor(n.goalId);
        if (!n || !scope || n.resolvedAt !== undefined || n.routingSuggestionId)
            return { ok: false, reason: 'option-stale-or-consumed' };
        if (action !== 'snooze' && action !== 'open-panel' && !n.choices?.includes(action))
            return { ok: false, reason: 'option-not-offered' };
        const task = n.taskId ? this.store.tasks.get(n.taskId) : undefined;
        if (n.taskId && task?.version !== n.taskVersion)
            return { ok: false, reason: 'option-task-changed' };
        const s = suggestionForAction(n, task, action, {
            clock: productionClock,
            idGen: productionIdGen,
            locale: this.locale(),
            scope,
            goalVersion: this.store.goals.get(n.goalId).version,
        });
        this.store.suggestions.insert(s);
        return this.route({ suggestionId: s.id, source: 'panel', peer, ...extra });
    }
    /** Explicit owner reminder is the only manual exception to no-repeat delivery. */
    remind(notificationId) {
        const n = this.store.notifications.get(notificationId);
        if (!n || n.resolvedAt !== undefined || n.routingSuggestionId || (n.expiresAt ?? Infinity) <= Date.now())
            throw Error('notification-stale');
        this.store.notifications.update({
            ...n,
            remindAt: Math.max(Date.now(), (n.deliveryAttemptedAt ?? 0) + 1),
            deliveryState: 'held',
            deliveryReason: 'manual-reminder',
            nextDeliveryAt: Date.now(),
        });
        this.event(n.goalId, 'notification-remind', 'owner');
    }
    expired(n) {
        this.store.notifications.insert({
            id: NotificationIdSchema.parse(productionIdGen.next('notification')),
            goalId: n.goalId,
            kind: 'info',
            priority: 'low',
            dedupeKey: n.id + ':expired-option',
            channel: 'panel',
            createdAt: Date.now(),
            reason: 'option-expired',
            expiresAt: Date.now() + 86400000,
        });
    }
    event(goalId, action, reason) {
        this.store.autopilotEvents.insert({
            id: productionIdGen.next('autopilot_event'),
            goalId,
            at: Date.now(),
            action,
            reason,
        });
    }
}
//# sourceMappingURL=router.js.map