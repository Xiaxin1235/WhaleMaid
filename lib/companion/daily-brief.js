import { z } from 'zod';
import { buildDailyBrief, briefTitle, DailyBriefRecordSchema, DailyBriefQuerySchema, DailyGoalChangesSchema, dailyBriefCopy, } from '#whalemaid/core';
import { localDay } from '../autopilot/day.js';
const State = z.object({
    records: z.array(DailyBriefRecordSchema).max(30),
    chatDays: z.array(z.string()).max(30),
});
const WEEK = 7 * 86400000;
/** Local fixed-format snapshots: no model, notifications, scheduler writes or project actions. */
export class CompanionDailyBrief {
    store;
    scopes;
    deps;
    turns = new WeakMap();
    constructor(store, scopes, deps) {
        this.store = store;
        this.scopes = scopes;
        this.deps = deps;
    }
    now() {
        return this.deps.now?.() ?? Date.now();
    }
    state() {
        return this.store.recallState('daily-brief', State) ?? { records: [], chatDays: [] };
    }
    save(state) {
        this.store.setRecallState('daily-brief', state);
    }
    facts(from, to) {
        const within = (at) => at > from && at <= to;
        const goals = this.store.goals.list();
        const tasks = goals.flatMap((g) => this.store.tasks.list(g.id));
        const title = (id) => goals.find((g) => g.id === id)?.title ?? '';
        const taskTitle = (id) => tasks.find((t) => t.id === id)?.title ?? '';
        const changes = (this.store.recallState('daily-brief-goal-changes', DailyGoalChangesSchema) ?? [])
            .filter((v) => within(v.at))
            .map((v, i) => ({
            id: `goal:${v.goalId}:${v.at}:${i}`,
            at: v.at,
            title: title(v.goalId),
            kind: 'goal',
            status: v.status,
        }));
        const transitions = tasks
            .flatMap((t) => this.store.transitions.list(t.id))
            .filter((v) => within(v.at))
            .map((v) => ({ id: v.id, at: v.at, title: taskTitle(v.entityId), kind: 'task', status: v.to }));
        const verifications = this.store.verifications
            .list()
            .filter((v) => within(v.createdAt))
            .map((v) => ({
            id: v.id,
            at: v.createdAt,
            title: taskTitle(v.taskId),
            kind: 'verification',
            status: v.judgment.verdict,
        }));
        const events = this.store.autopilotEvents.list();
        // Older installations have no status timestamp on a goal row. Use their existing completion
        // audit when present; never assign an invented historical timestamp to the current status.
        for (const event of events.filter((e) => !e.actor && e.action === 'complete' && e.goalId && within(e.at))) {
            if (!changes.some((v) => v.id.startsWith(`goal:${event.goalId}:`) && ['completed', 'succeeded'].includes(v.status)))
                changes.push({
                    id: event.id,
                    at: event.at,
                    title: title(event.goalId),
                    kind: 'goal',
                    status: 'completed',
                });
        }
        const runs = this.store.runs.all();
        const today = localDay(to);
        return {
            completed: [...changes, ...transitions, ...verifications].filter((v) => ['completed', 'succeeded', 'SUCCEEDED', 'PASS'].includes(v.status)),
            problems: [...changes, ...transitions, ...verifications].filter((v) => ['paused', 'cancelled', 'FAILED', 'BLOCKED', 'UNKNOWN', 'FAIL', 'NOT_SCORABLE'].includes(v.status)),
            // A still-pending decision remains relevant even if older than the covered interval.
            decisions: this.store.notifications
                .list()
                .filter((n) => ['decision', 'blocked'].includes(n.kind) && n.resolvedAt === undefined && n.createdAt <= to)
                .map((n) => ({ id: n.id, goalId: n.goalId, title: briefTitle(title(n.goalId)), at: n.createdAt })),
            automation: {
                runs: runs.filter((v) => within(v.startedAt)).length,
                plans: events.filter((v) => !v.actor && v.action === 'plan' && within(v.at)).length,
                quotas: goals.flatMap((g) => {
                    const scope = this.scopes.activeScopeFor(g.id);
                    if (!scope)
                        return [];
                    const state = this.store.plannerState.get(g.id);
                    const used = runs.filter((r) => localDay(r.startedAt) === today && tasks.some((t) => t.id === r.taskId && t.goalId === g.id)).length;
                    return [
                        {
                            id: g.id,
                            title: g.title,
                            runsRemaining: Math.max(0, scope.limits.maxRunsPerDay - used),
                            plansRemaining: Math.max(0, scope.limits.plannerCallsPerDay - (state?.day === today ? state.calls : 0)),
                        },
                    ];
                }),
            },
            proposals: events
                .filter((v) => v.actor === 'companion-proposal' && within(v.at))
                .map((v) => ({
                id: v.id,
                at: v.at,
                title: v.goalId ? title(v.goalId) : '',
                action: v.companionOperation ?? v.action,
                confirmed: v.confirmedAt !== undefined,
            })),
            experiences: this.store.journal
                .list()
                .filter((v) => v.kind === 'experience' && v.status === 'active' && within(v.createdAt))
                .map((v) => ({ id: v.id, at: v.createdAt })),
        };
    }
    /** The first nonempty snapshot of a day is frozen; panel and conversation share these exact bytes. */
    ensure() {
        if (!this.deps.enabled() || this.store.status().state !== 'ok')
            return;
        const now = this.now(), date = localDay(now), state = this.state();
        const existing = state.records.find((v) => v.date === date);
        if (existing)
            return existing;
        const previous = Math.max(0, ...state.records.map((v) => v.to));
        const from = Math.max(now - WEEK, Math.min(previous, now));
        const facts = this.facts(from, now), text = buildDailyBrief(facts, this.deps.locale());
        if (!text)
            return;
        const decisions = [...facts.decisions]
            .sort((a, b) => b.at - a.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
            .slice(0, 5)
            .map(({ id, goalId, title }) => ({ id, goalId, title }));
        const record = DailyBriefRecordSchema.parse({ date, generatedAt: now, from, to: now, text, decisions });
        state.records = [record, ...state.records].sort((a, b) => b.generatedAt - a.generatedAt).slice(0, 30);
        this.save(state);
        return record;
    }
    panel() {
        const today = this.ensure();
        return { enabled: this.deps.enabled(), today, records: this.state().records };
    }
    /** Public claimed-input event precedes system-prompt assembly; synthetic input cannot consume a day. */
    enter(agent, turn, messages) {
        if (!this.deps.owns(agent.session.id) || this.store.status().state !== 'ok')
            return;
        const day = localDay(this.now()), active = this.turns.get(agent);
        if (active?.turn === turn && active.human)
            return;
        const human = messages.some((m) => m.source.kind === 'user');
        this.turns.set(agent, { turn, day, text: '', human });
        if (!human)
            return;
        const state = this.state();
        if (state.chatDays.includes(day))
            return;
        // Also consume an empty/disabled/explicitly skipped first turn. Later turns aren't the day's first.
        state.chatDays = [day, ...state.chatDays].slice(0, 30);
        this.save(state);
        if (!this.deps.enabled())
            return;
        const humanText = messages
            .filter((m) => m.source.kind === 'user')
            .flatMap((m) => m.content.filter((p) => p.type === 'text').map((p) => p.text))
            .join('\n');
        if (/先别说进展|不要.*(?:简报|进展)|(?:skip|no|don't|do not)\s+(?:the\s+)?(?:daily\s+)?(?:brief|progress)/i.test(humanText))
            return;
        const record = this.ensure();
        if (record && record.deliveredAt === undefined)
            this.turns.set(agent, { turn, day, text: record.text, human: true });
    }
    block(agent) {
        if (!agent || agent.status !== 'running' || !this.deps.owns(agent.session.id) || !this.deps.enabled())
            return '';
        const active = this.turns.get(agent);
        if (!active?.text || active.day !== localDay(this.now()))
            return '';
        const state = this.state(), record = state.records.find((r) => r.date === active.day);
        if (!record)
            return '';
        if (record.deliveredAt === undefined) {
            record.deliveredAt = this.now();
            this.save(state);
        }
        return `${dailyBriefCopy(this.deps.locale()).preamble}\n${active.text}`;
    }
    /** Querying an existing snapshot never generates one or changes the delivery marker. */
    query(raw, exec) {
        exec.signal.throwIfAborted();
        if (!exec.agent || !this.deps.owns(exec.agent.session.id))
            throw Error('companion-only');
        const q = DailyBriefQuerySchema.parse(raw);
        if (!this.deps.enabled())
            return { disabled: true, message: dailyBriefCopy(this.deps.locale()).disabled };
        return { brief: this.state().records.find((r) => r.date === (q.date ?? localDay(this.now()))) ?? null };
    }
}
//# sourceMappingURL=daily-brief.js.map