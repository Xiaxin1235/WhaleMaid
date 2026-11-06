import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { notificationCopy, readTranscript, shortTitle, transcriptTitle, projectKeyForGoal, renderMemoryBlock, goalDecisionCopy, } from '#whalemaid/core';
/** The agent preset whose sessions are the companion; C08 recognises the session by this id. */
export const COMPANION_PRESET = 'whaledot-companion';
const MAX = { text: 300, list: 40, sessions: 20 };
const clip = (value, n = MAX.text) => {
    const flat = value.replace(/\s+/g, ' ').trim();
    return Array.from(flat).length > n ? Array.from(flat).slice(0, n).join('') + '…' : flat;
};
/** Host wall-clock time with its UTC offset, e.g. `2026-10-23 07:57 (UTC-07:00)`; models misread bare UTC. */
export function localTime(ms) {
    const d = new Date(ms);
    const pad = (n) => String(Math.abs(n)).padStart(2, '0');
    const offset = -d.getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    return (`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}` +
        ` (UTC${sign}${pad(Math.trunc(offset / 60))}:${pad(offset % 60)})`);
}
const defaultPersona = (locale) => fileURLToPath(new URL(`../../companion/persona.${locale}.md`, import.meta.url));
/** Builds the companion's read model from WhaleMaid's store and DSH's public session controller. */
export class CompanionService {
    ctx;
    store;
    deps;
    brief;
    recall;
    actions;
    memory;
    personaText = '';
    titles = new Map();
    constructor(ctx, store, deps) {
        this.ctx = ctx;
        this.store = store;
        this.deps = deps;
    }
    personaKey = '';
    /** Load the persona once per locale/setting change; fall back to the bundled text. */
    async loadPersona() {
        const custom = this.deps.settings().personaPath;
        this.personaKey = `${this.deps.locale()}|${custom ?? ''}`;
        for (const path of [custom, defaultPersona(this.deps.locale())]) {
            if (!path)
                continue;
            try {
                const text = (await readFile(path, 'utf8')).trim();
                // `{{` would be read as a prompt variable reference and fail prompt assembly.
                if (text) {
                    this.personaText = text.replaceAll('{{', '{ {');
                    return;
                }
            }
            catch (error) {
                this.deps.log(`companion persona unreadable: ${path}`, error);
            }
        }
    }
    persona() {
        // A language or persona-path change takes effect from the next prompt assembly.
        if (this.personaKey !== `${this.deps.locale()}|${this.deps.settings().personaPath ?? ''}`)
            void this.loadPersona();
        return this.personaText || 'You are Da Fei Yu, the user’s whale maid companion. Be brief and honest.';
    }
    goalsOverview() {
        const notifications = this.openDecisions();
        const verifications = this.store.verifications.list();
        return this.store.goals
            .list()
            .slice(-MAX.list)
            .map((goal) => {
            const tasks = this.store.tasks.list(goal.id);
            const ids = new Set(tasks.map((t) => t.id));
            const last = verifications
                .filter((v) => ids.has(v.taskId))
                .sort((a, b) => a.createdAt - b.createdAt)
                .at(-1);
            return {
                id: goal.id,
                title: clip(goal.title, 80),
                status: goal.status,
                autopilot: goal.autopilot.enabled,
                tasksDone: tasks.filter((t) => t.state === 'SUCCEEDED').length,
                tasksTotal: tasks.length,
                ...(last ? { lastVerdict: last.judgment.verdict } : {}),
                pendingDecisions: notifications.filter((n) => n.goalId === goal.id).length,
            };
        });
    }
    pendingDecisions() {
        const locale = this.deps.locale();
        return this.openDecisions()
            .slice(-MAX.list)
            .map((n) => {
            const copy = notificationCopy(n, this.deps.facts(n), locale);
            const options = (n.suggestionIds ?? []).flatMap((id) => {
                const s = this.store.suggestions.get(id);
                return s && s.consumedAt === undefined ? [clip(s.label, 40)] : [];
            });
            return {
                goal: clip(this.store.goals.get(n.goalId)?.title ?? n.goalId, 80),
                header: copy.header,
                question: copy.question,
                options: [
                    ...new Set([
                        ...options,
                        ...(n.choices?.includes('abandon') ? [goalDecisionCopy(locale).abandon] : []),
                        ...(n.choices?.includes('change-direction') ? [goalDecisionCopy(locale).change] : []),
                    ]),
                ],
                where: locale === 'zh-CN'
                    ? '请在小信封或 WhaleMaid 面板里处理'
                    : 'Resolve it in the inbox or the WhaleMaid panel',
            };
        });
    }
    goalDetail(goalId) {
        const goal = this.store.goals.list().find((g) => g.id === goalId || g.title === goalId);
        if (!goal)
            return undefined;
        const scope = goal.scopeId ? this.store.scopes.get(goal.scopeId) : undefined;
        const tasks = this.store.tasks.list(goal.id);
        const titles = new Map(tasks.map((t) => [t.id, t.title]));
        const verdicts = this.store.verifications
            .list()
            .filter((v) => titles.has(v.taskId))
            .sort((a, b) => a.createdAt - b.createdAt)
            .slice(-5);
        return {
            id: goal.id,
            ...(this.memory?.settings().enabled && projectKeyForGoal(goal, scope)
                ? {
                    projectMemories: renderMemoryBlock(this.store.memories.list(`project:${projectKeyForGoal(goal, scope)}`), this.deps.locale()),
                }
                : {}),
            title: clip(goal.title, 120),
            objective: clip(goal.objective, 600),
            expectedOutcome: clip(goal.expectedOutcome, 300),
            status: goal.status,
            autopilot: goal.autopilot.enabled,
            ...(scope
                ? {
                    scope: {
                        permission: scope.status === 'active' ? scope.permissionPreset : `${scope.status}`,
                        allowedPaths: scope.allowedPaths.slice(0, 10).map((p) => clip(p, 200)),
                        verifyCommands: scope.verifyCommands.slice(0, 10).map((c) => clip(c, 120)),
                    },
                }
                : {}),
            tasks: tasks.slice(-MAX.list).map((t) => ({
                title: clip(t.title, 120),
                kind: t.kind,
                state: t.state,
                ...(t.failureSummary ? { failure: clip(t.failureSummary, 200) } : {}),
            })),
            recentVerdicts: verdicts.map((v) => ({
                task: clip(titles.get(v.taskId) ?? '', 80),
                verdict: v.judgment.verdict,
                reasons: v.judgment.reasons.slice(0, 5).map((r) => clip(r, 120)),
            })),
            ...(this.store.checkpoints.list(goal.id).at(-1)
                ? { lastCheckpoint: this.store.checkpoints.list(goal.id).at(-1).commit.slice(0, 12) }
                : {}),
            userNotes: this.store.userNotes
                .list(goal.id)
                .slice(-5)
                .map((n) => clip(n.text, 300)),
        };
    }
    async recentSessions(signal = AbortSignal.timeout(15000)) {
        const controller = this.controller();
        const listed = (await controller.list({}, signal)).items
            .filter((s) => !s.blank && !s.origin && !this.hidden(s.sessionId))
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, MAX.sessions);
        if (!this.deps.settings().shareSessionTitles)
            return {
                titlesShared: false,
                total: listed.length,
                running: listed.filter((s) => s.running).length,
                idle: listed.filter((s) => !s.running).length,
            };
        const sessions = [];
        for (const s of listed) {
            const title = await this.title(s.sessionId, s.updatedAt, signal);
            if (title?.startsWith('[WhaleMaid]') ||
                title?.startsWith('[WhaleDot]') ||
                this.excluded(s.sessionId, title))
                continue;
            sessions.push({
                id: s.sessionId,
                title: clip(title ?? '(untitled)', 80),
                status: s.running ? 'running' : 'idle',
                lastActive: localTime(s.updatedAt),
            });
        }
        return { titlesShared: true, sessions };
    }
    async readSession(sessionId, beforeSeq, signal = AbortSignal.timeout(15000)) {
        if (!this.deps.settings().readSessionContent)
            return { ok: false, reason: 'reading-session-content-disabled' };
        if (this.hidden(sessionId))
            return { ok: false, reason: 'session-not-readable' };
        let events;
        try {
            events = (await this.controller().inspect(sessionId, signal))
                .events;
        }
        catch (error) {
            if (error instanceof Error &&
                ['ApiSessionNotFound', 'SessionPersistenceNotFoundError'].includes(error.name))
                return { ok: false, reason: 'session-not-found' };
            throw error;
        }
        const title = transcriptTitle(events);
        if (title?.startsWith('[WhaleMaid]') ||
            title?.startsWith('[WhaleDot]') ||
            this.excluded(sessionId, title))
            return { ok: false, reason: 'session-not-readable' };
        return {
            ok: true,
            ...(title && this.deps.settings().shareSessionTitles ? { title: clip(title, 80) } : {}),
            page: readTranscript(events, { ...(beforeSeq === undefined ? {} : { beforeSeq }) }),
        };
    }
    openDecisions() {
        return this.store.notifications
            .list()
            .filter((n) => ['decision', 'blocked'].includes(n.kind) && n.resolvedAt === undefined);
    }
    controller() {
        const controller = this.ctx.get('sessionController');
        if (!controller)
            throw new Error('session-controller-unavailable');
        return controller;
    }
    /** The companion's own session and WhaleMaid run/inbox sessions are never listed or read. */
    hidden(id) {
        return id === this.deps.companionSessionId() || this.deps.ownedSessions().has(id);
    }
    excluded(id, title) {
        return this.deps.settings().excludedSessions.some((entry) => {
            const needle = entry.trim();
            return !!needle && (needle === id || (!!title && title.includes(needle)));
        });
    }
    async title(id, updatedAt, signal) {
        const cached = this.titles.get(id);
        if (cached && cached.updatedAt === updatedAt)
            return cached.title;
        let title;
        try {
            title = transcriptTitle((await this.controller().inspect(id, signal)).events);
        }
        catch (error) {
            this.deps.log('companion title lookup failed', error);
        }
        this.titles.set(id, { updatedAt, ...(title ? { title: shortTitle(title) } : {}) });
        return title;
    }
}
//# sourceMappingURL=service.js.map