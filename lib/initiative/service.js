import { setImmediate as yieldToHost } from 'node:timers/promises';
import { budgetBurn, DailyGoalChangesSchema, failureSignature, GoalIdSchema, idleGoal, initiativeFindingCopy, INITIATIVE_TTL, leftovers, noAcceptance, pendingBacklog, redactSecrets, repeatedFailure, resolveLevel, stallWarning, briefTitle, } from '#whalemaid/core';
import { localDay } from '../autopilot/day.js';
import { sha256 } from '../store/index.js';
const DEBOUNCE_MS = 30000;
const SCAN_TIMEOUT_MS = 2000;
const detectors = {
    repeatedFailure: (f, now) => repeatedFailure(f, now, sha256.hash),
    stallWarning,
    noAcceptance,
    budgetBurn,
    pendingBacklog,
    idleGoal,
    leftovers,
};
const timed = new Set(['idleGoal', 'pendingBacklog']);
const dateOrder = (a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id);
const scoreOrder = (a, b) => b.score - a.score || dateOrder(a, b);
export class InitiativeService {
    store;
    scopes;
    deps;
    pending = new Map();
    tasks = new Set();
    full = true;
    lastDay;
    stopped = false;
    unwatch;
    timer;
    midnight;
    running;
    constructor(store, scopes, deps) {
        this.store = store;
        this.scopes = scopes;
        this.deps = deps;
    }
    now() {
        return this.deps.now?.() ?? Date.now();
    }
    start() {
        if (this.unwatch || this.stopped)
            return;
        this.unwatch = this.store.watchInitiative((change) => {
            if (change === 'all')
                this.full = true;
            else if ('taskId' in change)
                this.tasks.add(change.taskId);
            else
                this.pending.set(change.goalId, 'all');
            this.schedule(DEBOUNCE_MS);
        });
        this.refresh();
        this.scheduleMidnight();
    }
    refresh() {
        this.full = true;
        clearTimeout(this.timer);
        this.timer = undefined;
        this.schedule(0);
    }
    schedule(delay) {
        if (this.stopped || this.timer)
            return;
        this.timer = setTimeout(() => {
            this.timer = undefined;
            void this.scan();
        }, delay);
        this.timer.unref();
    }
    scheduleMidnight() {
        const now = this.now();
        const next = new Date(now);
        next.setHours(24, 0, 0, 0);
        this.midnight = setTimeout(() => {
            this.schedule(0);
            this.scheduleMidnight();
        }, Math.max(1, next.getTime() - now));
        this.midnight.unref();
    }
    /** Coalesced jobs yield between goals and keep an unfinished batch queued. */
    scan() {
        if (this.running)
            return this.running;
        this.running = this.detect()
            .catch((error) => this.deps.log('initiative scan failed', error))
            .finally(() => {
            this.running = undefined;
            if ((this.full || this.pending.size || this.tasks.size) && this.store.status().state === 'ok')
                this.schedule(DEBOUNCE_MS);
        });
        return this.running;
    }
    async detect() {
        if (this.stopped || this.store.status().state !== 'ok')
            return;
        if (!this.settings().enabled) {
            this.pending.clear();
            this.tasks.clear();
            this.full = false;
            return;
        }
        const deadline = performance.now() + SCAN_TIMEOUT_MS;
        const now = this.now();
        const day = localDay(now);
        this.store.opportunities.expire(now);
        if (this.full || this.lastDay !== day) {
            for (const id of this.store.initiativeGoalIds()) {
                if (this.full || !this.pending.has(id))
                    this.pending.set(id, this.full ? 'all' : 'timed');
            }
            this.full = false;
            this.lastDay = day;
        }
        for (const taskId of this.tasks) {
            const task = this.store.tasks.get(taskId);
            if (task)
                this.pending.set(task.goalId, 'all');
        }
        this.tasks.clear();
        const batch = [...this.pending];
        for (const [id, kind] of batch) {
            await yieldToHost();
            if (this.stopped || this.store.status().state !== 'ok')
                return;
            if (performance.now() >= deadline)
                throw Error('initiative-scan-timeout');
            if (this.pending.get(id) !== kind)
                continue;
            this.pending.delete(id);
            try {
                this.detectGoal(id, kind, now, day, deadline);
            }
            catch (error) {
                // A timed-out goal stays queued for the next batch instead of waiting for its next change.
                if (error instanceof Error && error.message === 'initiative-scan-timeout') {
                    if (!this.pending.has(id))
                        this.pending.set(id, kind);
                    throw error;
                }
                this.deps.log('initiative goal scan failed', error);
            }
        }
    }
    detectGoal(id, kind, now, day, deadline) {
        const settings = this.deps.settings();
        if (!settings.enabled)
            return;
        const goal = this.store.goals.get(id);
        if (!goal)
            return;
        const scope = this.scopes.activeScopeFor(id);
        const paused = this.store.paused();
        // Keep the observed idle interval accurate even when no findings are being produced.
        const previousIdle = this.store.initiativeIdle(id);
        const idle = this.idleObservation(goal, scope, paused, now, previousIdle);
        const selected = Object.keys(detectors).filter((id) => settings.enabled && settings.detectors[id].enabled && (kind === 'all' || timed.has(id)));
        const tasks = selected.some((id) => id !== 'idleGoal' && id !== 'stallWarning')
            ? this.store.tasks.list(goal.id)
            : [];
        const needsRuns = selected.includes('pendingBacklog') || selected.includes('budgetBurn');
        const runs = needsRuns ? this.store.runs.forGoal(goal.id) : [];
        const facts = {
            goal,
            tasks,
            ...(scope ? { limits: scope.limits } : {}),
            ...(idle ? { idleSince: idle.since } : {}),
            ...(selected.includes('repeatedFailure') || selected.includes('noAcceptance')
                ? { verifications: this.store.verifications.forGoal(goal.id) }
                : {}),
            ...(selected.includes('budgetBurn')
                ? { todayRuns: runs.filter((r) => localDay(r.startedAt) === day) }
                : {}),
            ...(selected.includes('pendingBacklog')
                ? {
                    decisions: this.store.notifications.forGoal(goal.id),
                    waitingOnDecision: !!scope && goal.autopilot.enabled && !paused && !runs.some((r) => r.status === 'running'),
                }
                : {}),
        };
        const candidates = selected.flatMap((id) => {
            if (performance.now() >= deadline)
                throw Error('initiative-scan-timeout');
            return detectors[id](facts, now);
        });
        if (performance.now() >= deadline)
            throw Error('initiative-scan-timeout');
        if (!candidates.length && previousIdle?.key === idle?.key && previousIdle?.since === idle?.since)
            return;
        this.store.transaction(() => {
            if (previousIdle?.key !== idle?.key || previousIdle?.since !== idle?.since)
                this.store.setInitiativeIdle(goal.id, idle);
            for (const candidate of candidates)
                this.store.opportunities.save(candidate, resolveLevel(candidate, this.available(settings)), now);
        });
    }
    idleObservation(goal, scope, paused, now, previous) {
        if (!scope || !['active', 'paused'].includes(goal.status))
            return;
        // Each source is an independently continuous reason to be idle. Old rows
        // without a transition timestamp start at observation, never at invented history.
        const anchors = [];
        if (!goal.autopilot.enabled) {
            const disabled = this.store.autopilotEvents
                .list(goal.id)
                .findLast((e) => !e.actor && e.action === 'disabled');
            const enabledAt = goal.autopilot.enabledAt;
            const at = enabledAt === undefined
                ? scope.grantedAt
                : disabled && disabled.at >= enabledAt
                    ? disabled.at
                    : undefined;
            anchors.push({ key: 'off:' + String(goal.autopilot.enabledAt), ...(at === undefined ? {} : { at }) });
        }
        if (goal.status === 'paused') {
            const at = this.store
                .recallState('daily-brief-goal-changes', DailyGoalChangesSchema)
                ?.findLast((e) => e.goalId === goal.id && e.status === 'paused')?.at;
            anchors.push({ key: 'paused', ...(at === undefined ? {} : { at }) });
        }
        if (paused)
            anchors.push({ key: 'global:' + this.store.pauseVersion() });
        if (!anchors.length)
            return;
        const key = JSON.stringify([scope.id, ...anchors.map((a) => a.key)]);
        const observed = previous?.key === key ? previous.since : now;
        const since = Math.max(scope.grantedAt, Math.min(...anchors.map((a) => Math.min(now, a.at ?? observed))));
        return { key, since };
    }
    settings() {
        return this.deps.settings();
    }
    available(settings) {
        return { ...settings, channels: { ...settings.channels, cards: false, asks: false } };
    }
    panel() {
        const now = this.now();
        const rows = this.store.status().state !== 'error' ? this.store.opportunities.list() : [];
        const settings = this.settings();
        return {
            settings,
            findings: rows.sort(dateOrder).map((row) => ({
                ...row,
                status: row.status === 'open' && row.expiresAt <= now ? 'expired' : row.status,
                goalTitle: row.subject.goalId ? (this.store.goals.get(row.subject.goalId)?.title ?? '') : '',
            })),
            counts: Object.fromEntries(Object.keys(detectors).map((id) => [
                id,
                rows.filter((row) => row.detector === id && row.createdAt > now - INITIATIVE_TTL && row.createdAt <= now).length,
            ])),
        };
    }
    brief(now) {
        const settings = this.available(this.settings());
        if (!settings.enabled || !settings.channels.brief)
            return [];
        try {
            return this.recent(now)
                .filter((row) => row.level !== 'L0' && resolveLevel(row, settings) !== 'L0')
                .sort(scoreOrder)
                .slice(0, 3)
                .map((row) => ({
                detector: row.detector,
                title: row.subject.goalId ? (this.store.goals.get(row.subject.goalId)?.title ?? '') : '',
            }));
        }
        catch (error) {
            this.deps.log('initiative brief projection failed', error);
            return [];
        }
    }
    recent(now) {
        return this.store.status().state === 'ok'
            ? this.store.opportunities
                .list()
                .filter((row) => row.status === 'open' && row.createdAt <= now && row.expiresAt > now)
            : [];
    }
    /** Resolve references on demand. Raw tool and session bodies never enter findings or the brief. */
    evidence(id, panel = true) {
        const row = this.store.opportunities.get(id);
        if (!row)
            throw Error('initiative-finding-not-found');
        const goalId = row.subject.goalId;
        return row.evidence.map((ref) => {
            const missing = { ...ref, missing: true };
            if (!goalId)
                return missing;
            if (ref.kind === 'verification') {
                const record = this.store.verifications.get(ref.id);
                const command = ref.commandIndex === undefined ? undefined : record?.current[ref.commandIndex];
                if (!record ||
                    this.store.tasks.get(record.taskId)?.goalId !== goalId ||
                    (ref.hash && (!command || failureSignature(command, sha256.hash) !== ref.hash)))
                    return missing;
                return {
                    ...ref,
                    missing: false,
                    status: record.judgment.verdict,
                    at: record.createdAt,
                    ...(command ? { exitCode: command.exitCode } : {}),
                    ...(panel && command
                        ? {
                            command: redactSecrets(command.command).slice(0, 500),
                            excerpt: redactSecrets(command.tail ?? '').slice(-1000),
                        }
                        : {}),
                };
            }
            if (ref.kind === 'task') {
                const task = this.store.tasks.get(ref.id);
                return task?.goalId === goalId
                    ? { ...ref, missing: false, title: briefTitle(task.title), status: task.state }
                    : missing;
            }
            if (ref.kind === 'run') {
                const run = this.store.runs.get(ref.id);
                return run && this.store.tasks.get(run.taskId)?.goalId === goalId
                    ? { ...ref, missing: false, status: run.outcome, at: run.startedAt }
                    : missing;
            }
            if (ref.kind === 'notification') {
                const notification = this.store.notifications.get(ref.id);
                return notification?.goalId === goalId
                    ? {
                        ...ref,
                        missing: false,
                        status: notification.kind,
                        at: notification.deliveredAt ?? notification.createdAt,
                    }
                    : missing;
            }
            const goal = this.store.goals.get(GoalIdSchema.parse(ref.id));
            return goal?.id === goalId ? { ...ref, missing: false, status: goal.status } : missing;
        });
    }
    query() {
        const locale = this.deps.locale();
        return this.recent(this.now())
            .sort(dateOrder)
            .slice(0, 5)
            .map((row) => ({
            id: row.id,
            detector: row.detector,
            goalId: row.subject.goalId,
            summary: initiativeFindingCopy(locale, row.detector).summary,
            createdAt: row.createdAt,
            evidence: this.evidence(row.id, false),
        }));
    }
    delete(id) {
        return this.store.opportunities.delete(id);
    }
    async dispose() {
        this.stopped = true;
        this.unwatch?.();
        clearTimeout(this.timer);
        clearTimeout(this.midnight);
        await this.running;
    }
}
//# sourceMappingURL=service.js.map