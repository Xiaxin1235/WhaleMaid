import type { GoalId } from '#whalemaid/core';
import type { WhaleStore } from '../store/index.js';
import type { ScopeService } from '../scope-service.js';
/** Owner-only decisions share the existing serialized verification/decision slot. No tool exposes this. */
export declare class GoalDecisions {
    private readonly store;
    private readonly scopes;
    private readonly stopGoal;
    constructor(store: WhaleStore, scopes: Pick<ScopeService, 'activeScopeFor'>, stopGoal: (id: GoalId) => Promise<void>);
    apply(notificationId: string, action: 'abandon' | 'change-direction', input: {
        source: 'panel' | 'inbox';
        confirm?: boolean | undefined;
        goalVersion: number;
        direction?: string | undefined;
    }): Promise<{
        state: "cancelled" | "active";
    }>;
}
