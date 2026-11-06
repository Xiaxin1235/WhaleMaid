import type { Suggestion, Notification, NotificationAction, Locale, GoalId } from '#whalemaid/core';
import type { PeerScope } from '@deepseek-ai/dsh-client-connection';
import type { WhaleStore } from '../store/index.js';
import type { ScopeService } from '../scope-service.js';
import type { TaskVerifier } from '../verify/verify-task.js';
import type { GoalDecisions } from './goal-decisions.js';
export interface RouteResult {
    ok: boolean;
    reason?: string;
    goalId?: GoalId;
    openPanel?: boolean;
    state?: string;
    files?: string[];
    stat?: string;
}
/** One durable claim precedes every effect, regardless of the display label or originating UI. */
export declare class NotificationRouter {
    readonly store: WhaleStore;
    private readonly scopes;
    private readonly verifier;
    private readonly locale;
    private readonly wake;
    private readonly goalDecisions?;
    constructor(store: WhaleStore, scopes: Pick<ScopeService, 'activeScopeFor'>, verifier: Pick<TaskVerifier, 'resolveDecision'>, locale: () => Locale, wake: (id: GoalId) => void, goalDecisions?: GoalDecisions | undefined);
    /** Build the fixed recommendation set even when reminders are muted or held. */
    options(n: Notification): Suggestion[];
    private validate;
    /** Route the persisted intent, never a caller-supplied action or free-text answer. */
    route(input: {
        suggestionId: string;
        source: 'inbox' | 'panel';
        peer?: PeerScope;
        confirm?: boolean | undefined;
        goalVersion?: number | undefined;
        direction?: string | undefined;
    }): Promise<RouteResult>;
    /** Preserve P09 panel actions by minting only choices already offered by the ledger. */
    routeChoice(notificationId: string, action: NotificationAction, peer: PeerScope, extra?: {
        confirm?: boolean | undefined;
        goalVersion?: number | undefined;
        direction?: string | undefined;
    }): Promise<RouteResult>;
    /** Explicit owner reminder is the only manual exception to no-repeat delivery. */
    remind(notificationId: string): void;
    private expired;
    private event;
}
