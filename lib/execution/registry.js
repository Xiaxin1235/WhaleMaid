import { companionSessionIds } from '#whalemaid/core';
/** Durable before-send registration and a retained session ownership index, including ended runs. */
export class RunRegistry {
    store;
    closed = new Set();
    sessions = new Map();
    constructor(store) {
        this.store = store;
        for (const run of store.status().state === 'error' ? [] : store.runs.all())
            this.sessions.set(run.sessionId, { id: run.run_id, closed: run.status !== 'running' || !!run.reason });
    }
    /** Subscribe to gate closure without discarding durable ownership. */
    onClosed(listener) {
        this.closed.add(listener);
        return () => this.closed.delete(listener);
    }
    /** Release ephemeral lineage for every terminal, cancellation and unload path. */
    close(sessionId) {
        const entry = this.sessions.get(sessionId);
        if (entry)
            entry.closed = true;
        for (const listener of this.closed)
            listener(sessionId);
    }
    /** Closing the gate is immediate, including unload before cancellation has settled. */
    isOpen(sessionId) {
        return this.sessions.get(sessionId)?.closed === false;
    }
    /** Retain ownership even if a stored run later becomes unreadable. */
    has(sessionId) {
        return (this.sessions.has(sessionId) || !!this.store.inboxSessions.get(sessionId) || this.isCompanion(sessionId));
    }
    /** Current or earlier companion sessions; ownership survives a rebuild. */
    isCompanion(sessionId) {
        const record = this.store.companionSession();
        return companionSessionIds(record, this.store.autopilotEvents.list()).includes(sessionId);
    }
    /** Every session WhaleMaid owns (runs, inboxes, companions), for hiding them from the companion's tools. */
    ownedSessionIds() {
        const record = this.store.companionSession();
        return new Set([
            ...this.sessions.keys(),
            ...this.store.inboxSessions.list().map((s) => s.id),
            ...companionSessionIds(record, this.store.autopilotEvents.list()),
        ]);
    }
    /** Re-read current durable state for a registered session. */
    get(sessionId) {
        const id = this.sessions.get(sessionId);
        return id ? this.store.runs.get(id.id) : undefined;
    }
    /** Persist before publishing the in-memory ownership index. */
    register(run) {
        this.store.runs.insert(run);
        this.sessions.set(run.sessionId, { id: run.run_id, closed: run.status !== 'running' || !!run.reason });
    }
    /** Apply the domain state machine and repository CAS together. */
    transition(task, state, reason, runId) {
        const result = this.store.tasks.transition(task.id, state, {
            expectedVersion: task.version,
            source: 'execution',
            reason,
            ...(runId ? { runId } : {}),
        });
        if (!result.ok)
            throw new Error(result.error.code);
    }
    /** A restarted host cannot safely infer delivery or completion. Reconcile later; never resend. */
    recover() {
        for (const run of this.store.runs.all().filter((run) => run.status === 'running')) {
            this.close(run.sessionId);
            this.store.transaction(() => {
                const task = this.store.tasks.get(run.taskId);
                if (task?.state === 'RUNNING')
                    this.transition(task, 'UNKNOWN', 'host-restarted', run.run_id);
                this.store.runs.update({
                    ...run,
                    status: 'ended',
                    endedAt: Date.now(),
                    outcome: 'UNKNOWN',
                    reason: 'host-restarted',
                });
            });
        }
    }
}
//# sourceMappingURL=registry.js.map