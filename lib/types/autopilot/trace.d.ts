import type { GoalId } from '#whalemaid/core';
import type { WhaleStore } from '../store/index.js';
/** Export only the addressed goal ledger; no caller path, credential file or session body is read. */
export declare function exportTrace(store: WhaleStore, goalId: GoalId): {
    markdown: string;
    filename: string;
};
