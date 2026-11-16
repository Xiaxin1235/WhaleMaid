import { isReliableQuestion, quietHoursActive, decideDelivery, notificationCopy, NotificationIdSchema, goalDecisionCopy, } from '#whalemaid/core';
import { productionIdGen } from '../store/index.js';
import { notificationDeliveryHistory } from './history.js';
const retryDelays = [60000, 300000, 1800000, 7200000];
/** Claim the attempt before any provider work and record exactly how it ends. */
export class NotificationDeliverer {
    store;
    scopes;
    inbox;
    router;
    locale;
    log;
    stopped = true;
    stopWatch;
    timer;
    debounce;
    wakeTimer;
    pending = new Map();
    constructor(store, scopes, inbox, router, locale, log) {
        this.store = store;
        this.scopes = scopes;
        this.inbox = inbox;
        this.router = router;
        this.locale = locale;
        this.log = log;
    }
    /** Register state-change observation only after migrations, recovery and tool gates are ready. */
    start() {
        if (!this.stopped || this.store.status().state !== 'ok')
            return;
        this.recoverAttempts();
        this.stopped = false;
        this.stopWatch = this.store.watchChanges(() => {
            this.cancelInvalid();
            this.mark();
        });
        this.timer = setInterval(() => this.mark(), 60000);
        this.timer.unref();
        this.mark();
    }
    mark() {
        if (this.stopped)
            return;
        clearTimeout(this.debounce);
        this.debounce = setTimeout(() => {
            void this.sweep().catch(() => this.log('notification sweep failed'));
        }, 100);
        this.debounce.unref();
    }
    recoverAttempts() {
        for (const n of this.store.notifications.list()) {
            if (n.decisionDelivery?.outcome !== 'asking')
                continue;
            const attempt = this.store.notificationDeliveries
                .list(n.goalId)
                .find((d) => d.notificationId === n.id &&
                d.generation === n.decisionDelivery?.generation &&
                d.result === 'started');
            this.finish(n, attempt?.id, 'cancelled', 'host-restarted');
        }
    }
    cancelInvalid() {
        for (const [id, entry] of this.pending) {
            if (entry.responding || entry.controller.signal.aborted)
                continue;
            const n = this.store.notifications.get(id);
            const reason = n ? this.cancellation(this.router.refresh(n), entry) : 'decision-no-longer-current';
            if (reason)
                entry.controller.abort(reason);
        }
    }
    cancellation(n, entry) {
        if (n.resolvedReason)
            return n.deliveryReason ?? 'decision-no-longer-current';
        if (n.resolvedAt !== undefined || n.routingSuggestionId || n.lastSelectionId !== entry.selectionId)
            return 'decision-handled';
        if (n.decisionDelivery?.generation !== entry.generation)
            return 'task-version-refreshed';
        if ((n.remindAt ?? 0) > entry.attemptAt)
            return 'owner-reminded';
        if (!this.valid(n))
            return 'decision-no-longer-current';
        const prefs = this.store.notificationPreferences();
        if (prefs.muted)
            return 'muted';
        const date = new Date();
        if (isReliableQuestion(n) && quietHoursActive(prefs.quietHours, date.getHours() * 60 + date.getMinutes()))
            return 'quiet-hours';
        return undefined;
    }
    valid(n) {
        return (n.resolvedAt === undefined &&
            !n.routingSuggestionId &&
            (n.expiresAt ?? Infinity) > Date.now() &&
            !!this.scopes.activeScopeFor(n.goalId) &&
            (n.kind !== 'initiative' || this.router.initiative?.canDeliver(n) === true) &&
            (!n.taskId || this.store.tasks.get(n.taskId)?.version === n.taskVersion));
    }
    /** Panel views share deterministic copy and the same persisted option identities. */
    center(goalId) {
        const items = this.store.notifications
            .list()
            .filter((n) => !goalId || n.goalId === goalId)
            .map((stored) => {
            const n = this.router.refresh(stored);
            const suggestions = n.resolvedAt === undefined
                ? this.router.options(n)
                : this.store.suggestions.list().filter((s) => s.notificationId === n.id);
            return {
                goal: (() => {
                    const goal = this.store.goals.get(n.goalId);
                    return goal
                        ? { id: goal.id, title: goal.title, version: goal.version, status: goal.status }
                        : undefined;
                })(),
                notification: this.store.notifications.get(n.id),
                copy: this.copy(n),
                suggestions,
                notes: this.store.userNotes.list(n.goalId).filter((note) => note.notificationId === n.id),
                choices: this.store.notificationChoices.list(n.goalId).filter((c) => c.notificationId === n.id),
                ...(isReliableQuestion(n)
                    ? {
                        deliveries: this.store.notificationDeliveries
                            .list(n.goalId)
                            .filter((d) => d.notificationId === n.id),
                    }
                    : {}),
            };
        });
        return { preferences: this.store.notificationPreferences(), items };
    }
    copy(n) {
        return n.kind === 'initiative' && this.router.initiative
            ? this.router.initiative.copy(n)
            : notificationCopy(n, this.facts(n), this.locale());
    }
    /** Structured evidence only; absence is displayed as unknown, never synthesized as zero. */
    facts(n) {
        const tasks = this.store.tasks.list(n.goalId), reports = this.store.verifications.list().filter((r) => tasks.some((t) => t.id === r.taskId)), scorable = reports.filter((r) => r.current.length);
        const failed = (results) => results.length && results.every((r) => r.counts)
            ? results.reduce((sum, r) => sum + r.counts.failed, 0)
            : undefined;
        const task = n.taskId ? this.store.tasks.get(n.taskId) : undefined;
        return {
            goalTitle: this.store.goals.get(n.goalId)?.title ?? '',
            ...(task ? { taskTitle: task.title } : {}),
            completedTasks: tasks.filter((t) => t.state === 'SUCCEEDED').length,
            ...(scorable[0] ? { beforeFailed: failed(scorable[0].baseline) } : {}),
            ...(scorable.at(-1) ? { afterFailed: failed(scorable.at(-1).current) } : {}),
        };
    }
    /** Refresh currently pending requests and admit new ones using fresh policy and authorization. */
    async sweep() {
        if (this.stopped || this.store.status().state !== 'ok')
            return;
        this.cancelInvalid();
        let wakeAt = Infinity;
        const prefs = this.store.notificationPreferences();
        const quiet = prefs.quietHours;
        if (quiet && quiet.start !== quiet.end)
            wakeAt = this.nextLocalTime(quiet.start, Date.now());
        for (const stored of this.store.notifications.list()) {
            if (this.pending.has(stored.id))
                continue;
            const n = this.router.refresh(stored);
            if (!this.valid(n))
                continue;
            const now = Date.now();
            const date = new Date(now);
            const decision = decideDelivery(n, {
                now,
                localMinutes: date.getHours() * 60 + date.getMinutes(),
                nextQuietEnd: this.nextLocalTime(quiet?.end ?? '00:00', now),
                preferences: prefs,
                recent: notificationDeliveryHistory(this.store),
                history: this.store.notifications.list(),
            });
            if (decision.action !== 'deliver-now') {
                if (decision.until !== undefined)
                    wakeAt = Math.min(wakeAt, decision.until);
                const state = decision.action === 'digest' ? 'digest' : decision.reason === 'muted' ? 'muted' : 'held';
                if (decision.action !== 'drop' ||
                    (isReliableQuestion(n) && decision.reason === 'duplicate-unresolved')) {
                    if (n.deliveryState !== state ||
                        n.deliveryReason !== decision.reason ||
                        n.nextDeliveryAt !== decision.until)
                        this.store.transaction(() => {
                            this.store.notifications.update({
                                ...n,
                                deliveryState: state,
                                deliveryReason: decision.reason,
                                nextDeliveryAt: decision.until,
                            });
                            if (isReliableQuestion(n))
                                this.audit(n, 'held', decision.reason);
                        });
                }
                continue;
            }
            if ([...this.pending.values()].some((entry) => entry.goalId === n.goalId))
                continue;
            this.claim(n, now);
        }
        clearTimeout(this.wakeTimer);
        if (wakeAt < Infinity) {
            this.wakeTimer = setTimeout(() => this.mark(), Math.max(1, Math.min(2147483647, wakeAt - Date.now())));
            this.wakeTimer.unref();
        }
    }
    nextLocalTime(time, now) {
        const date = new Date(now);
        date.setHours(Number(time.slice(0, 2)), Number(time.slice(3)), 0, 0);
        if (date.getTime() <= now)
            date.setDate(date.getDate() + 1);
        return date.getTime();
    }
    claim(n, at) {
        const deliveryId = productionIdGen.next('delivery');
        const current = this.store.transaction(() => {
            const fresh = this.store.notifications.get(n.id);
            if (fresh.deliveryAttemptedAt !== n.deliveryAttemptedAt || !this.valid(fresh))
                return undefined;
            if (isReliableQuestion(fresh) &&
                this.store.notifications
                    .forGoal(n.goalId)
                    .some((other) => other.decisionDelivery?.outcome === 'asking' && other.resolvedAt === undefined))
                return undefined;
            const started = {
                ...fresh,
                channel: 'dsh-question',
                suggestionIds: [],
                deliveryAttemptedAt: at,
                deliveredAt: at,
                deliveryState: 'delivered',
                deliveryReason: 'dispatched',
                nextDeliveryAt: undefined,
                ...(isReliableQuestion(fresh)
                    ? {
                        decisionDelivery: {
                            generation: (fresh.decisionDelivery?.generation ?? 0) + 1,
                            failures: fresh.decisionDelivery?.failures ?? 0,
                            outcome: 'asking',
                        },
                    }
                    : {}),
            };
            this.store.suggestions.consume(n.id, at);
            this.store.notifications.update(started);
            this.audit(started, 'started', undefined, deliveryId);
            return started;
        });
        if (!current)
            return;
        const controller = new AbortController();
        const work = Promise.resolve()
            .then(() => this.send(current, deliveryId, controller.signal))
            .catch(() => this.log('notification attempt recording failed: ' + n.id))
            .finally(() => {
            this.pending.delete(n.id);
            this.mark();
        });
        this.pending.set(n.id, {
            controller,
            work,
            goalId: n.goalId,
            attemptAt: at,
            selectionId: n.lastSelectionId,
            generation: current.decisionDelivery?.generation,
            responding: false,
        });
    }
    async send(n, deliveryId, signal) {
        let phase = 'inbox-preparation-failed';
        try {
            signal.throwIfAborted();
            await this.inbox.prepare?.(n.goalId);
            signal.throwIfAborted();
            const fresh = this.router.refresh(this.store.notifications.get(n.id));
            const reason = this.cancellation(fresh, this.pending.get(n.id));
            if (reason) {
                this.pending.get(n.id).controller.abort(reason);
                signal.throwIfAborted();
            }
            const choices = this.router.options(fresh);
            phase = 'question-service-failed';
            const copy = this.copy(fresh);
            if (fresh.initiative)
                this.router.initiative?.delivered(fresh, n.deliveryAttemptedAt ?? Date.now());
            const answer = await this.inbox.ask(n.goalId, {
                id: n.id,
                ...copy,
                ...(choices.some((s) => s.intent.type === 'panel-decision' && s.intent.choice === 'change-direction')
                    ? { detail: copy.detail + '\n\n' + goalDecisionCopy(this.locale()).inboxHint }
                    : {}),
                options: choices.map((s) => ({
                    label: s.label,
                    ...(s.description === undefined ? {} : { description: s.description }),
                })),
                multiSelect: false,
            }, signal);
            signal.throwIfAborted();
            phase = 'response-processing-failed';
            const pending = this.pending.get(n.id);
            if (pending)
                pending.responding = true;
            const item = answer.answers.find((a) => a.id === n.id);
            const direction = choices.find((s) => s.intent.type === 'panel-decision' && s.intent.choice === 'change-direction');
            if (item?.custom?.trim() &&
                direction &&
                (item.selected.length === 0 || (item.selected.length === 1 && item.selected[0] === direction.label))) {
                const result = await this.router.route({
                    suggestionId: direction.id,
                    source: 'inbox',
                    direction: item.custom,
                });
                if (!result.ok)
                    this.info(n, result.reason ?? 'option-expired');
            }
            else if (item?.custom?.trim() && direction)
                this.info(n, 'option-expired');
            else {
                if (item?.custom?.trim())
                    this.store.userNotes.insert({
                        id: productionIdGen.next('user-note'),
                        goalId: n.goalId,
                        notificationId: n.id,
                        at: Date.now(),
                        text: Array.from(item.custom.trim()).slice(0, 500).join(''),
                    });
                const selected = n.initiative && item?.custom?.trim() ? [] : (item?.selected ?? []);
                if (selected.length === 1) {
                    const s = choices.find((s) => s.label === selected[0]);
                    if (s) {
                        const result = await this.router.route({ suggestionId: s.id, source: 'inbox' });
                        if (!result.ok)
                            this.info(n, result.reason ?? 'option-expired');
                    }
                    else
                        this.info(n, 'option-expired');
                }
                else if (selected.length > 1)
                    this.info(n, 'option-expired');
            }
            this.finish(n, deliveryId, !isReliableQuestion(n) || item?.selected.length || item?.custom?.trim() ? 'answered' : 'unanswered');
        }
        catch (error) {
            if (this.store.status().state !== 'ok')
                return;
            if (n.initiative && phase === 'question-service-failed' && !signal.aborted) {
                const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
                this.log(`initiative question service failed (${typeof code === 'string' && /^[A-Z_]{3,40}$/.test(code) ? code : 'unknown'})`);
            }
            if (signal.aborted)
                this.finish(n, deliveryId, 'cancelled', String(signal.reason));
            else if (phase === 'response-processing-failed')
                this.finish(n, deliveryId, 'answered', phase);
            else if (isReliableQuestion(n) &&
                phase === 'question-service-failed' &&
                error &&
                typeof error === 'object' &&
                'code' in error &&
                error.code === 'ASK_ABORTED')
                this.finish(n, deliveryId, 'unanswered', 'provider-aborted');
            else
                this.finish(n, deliveryId, 'failed', phase);
        }
    }
    finish(n, deliveryId, result, detail) {
        const now = Date.now();
        const current = this.store.notifications.get(n.id);
        const attempt = deliveryId ? this.store.notificationDeliveries.get(deliveryId) : undefined;
        const owner = current && current.decisionDelivery?.generation === n.decisionDelivery?.generation;
        const decision = current?.decisionDelivery;
        const failures = (decision?.failures ?? 0) + Number(result === 'failed');
        const retryAt = result === 'failed' && decision
            ? now + retryDelays[Math.min(failures - 1, retryDelays.length - 1)]
            : undefined;
        const reason = detail ?? (result === 'unanswered' ? 'user-unanswered' : result);
        const outcome = reason === 'decision-handled' ? 'answered' : result;
        this.store.transaction(() => {
            if (attempt?.result === 'started') {
                this.store.notificationDeliveries.update({ ...attempt, result, detail: reason, endedAt: now });
            }
            if (!owner)
                return;
            if (result === 'failed' && current.initiative)
                this.router.initiative?.failedDelivery(current);
            const terminal = current.resolvedAt !== undefined;
            const reminded = (current.remindAt ?? 0) > (current.deliveryAttemptedAt ?? 0);
            if (decision && (result !== 'answered' || terminal))
                this.store.suggestions.consume(n.id, now);
            this.store.notifications.update({
                ...current,
                ...(decision
                    ? {
                        decisionDelivery: {
                            generation: decision.generation,
                            outcome,
                            failures,
                            reason,
                            retryAt,
                        },
                    }
                    : {}),
                ...(!terminal && !reminded
                    ? {
                        deliveryState: outcome === 'failed' ? 'failed' : outcome === 'cancelled' ? 'cancelled' : 'delivered',
                        deliveryReason: reason,
                        nextDeliveryAt: retryAt,
                    }
                    : {}),
                ...(result === 'failed' && !decision ? { deliveredAt: undefined } : {}),
            });
        });
    }
    audit(n, result, detail, id = productionIdGen.next('delivery')) {
        this.store.notificationDeliveries.insert({
            id,
            goalId: n.goalId,
            notificationId: n.id,
            at: Date.now(),
            result,
            detail,
            generation: isReliableQuestion(n) ? (n.decisionDelivery?.generation ?? 0) : undefined,
        });
    }
    info(n, reason) {
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
        });
    }
    /** Cancel asks and stop all new delivery work; waiting cannot retain the plugin beyond five seconds. */
    async dispose() {
        this.stopped = true;
        this.stopWatch?.();
        clearInterval(this.timer);
        clearTimeout(this.debounce);
        clearTimeout(this.wakeTimer);
        for (const entry of this.pending.values())
            if (!entry.responding)
                entry.controller.abort('host-stopped');
        let deadline;
        await Promise.race([
            Promise.allSettled([...this.pending.values()].map((e) => e.work)),
            new Promise((resolve) => {
                deadline = setTimeout(resolve, 5000);
            }),
        ]);
        clearTimeout(deadline);
    }
}
//# sourceMappingURL=deliverer.js.map