import type { Run, RunId, Task, TaskState } from '#whalemaid/core';
import type { WhaleStore } from '../store/index.js';
/** Durable before-send registration and a retained session ownership index, including ended runs. */
export declare class RunRegistry {
    readonly store: WhaleStore;
    private readonly closed;
    private readonly sessions;
    constructor(store: WhaleStore);
    /** Subscribe to gate closure without discarding durable ownership. */
    onClosed(listener: (sessionId: string) => void): () => void;
    /** Release ephemeral lineage for every terminal, cancellation and unload path. */
    close(sessionId: string): void;
    /** Closing the gate is immediate, including unload before cancellation has settled. */
    isOpen(sessionId: string): boolean;
    /** Retain ownership even if a stored run later becomes unreadable. */
    has(sessionId: string): boolean;
    /** Current or earlier companion sessions; ownership survives a rebuild. */
    isCompanion(sessionId: string): boolean;
    /** Every session WhaleMaid owns (runs, inboxes, companions), for hiding them from the companion's tools. */
    ownedSessionIds(): Set<string>;
    /** Re-read current durable state for a registered session. */
    get(sessionId: string): Run | undefined;
    /** Persist before publishing the in-memory ownership index. */
    register(run: Run): void;
    /** Apply the domain state machine and repository CAS together. */
    transition(task: Task, state: TaskState, reason: string, runId?: RunId): void;
    /** A restarted host cannot safely infer delivery or completion. Reconcile later; never resend. */
    recover(): void;
}
