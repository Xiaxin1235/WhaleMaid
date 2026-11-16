import type { ProjectGoal, DecisionChoice, Locale, Notification } from '#whalemaid/core';
import type { WhaleStore } from './store/index.js';
/** Persist goal-bound notices; task acceptance and task versions are deliberately independent. */
export declare function goalNotice(store: WhaleStore, goal: ProjectGoal, reason: string, locale: Locale, choices?: DecisionChoice[], kind?: Notification['kind']): void;
