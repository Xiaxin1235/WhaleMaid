import type { Notification } from '../model/notification.js';
import type { NotificationPreferences } from './model.js';
/** Shared interruption policy also serves memory proposals, which need no task/authorization binding. */
export type DeliveryNotice = Omit<Pick<Notification, 'id' | 'kind' | 'goalId' | 'dedupeKey' | 'resolvedAt' | 'expiresAt' | 'deliveryAttemptedAt' | 'remindAt' | 'deliveredAt' | 'reason'>, 'id' | 'kind' | 'goalId'> & {
    id: string;
    kind: Notification['kind'] | 'memory-proposal';
    goalId?: string | undefined;
};
export interface DeliveryContext {
    now: number;
    localMinutes: number;
    nextQuietEnd: number;
    preferences: NotificationPreferences;
    recent: DeliveryNotice[];
    history: DeliveryNotice[];
}
export type DeliveryDecision = {
    action: 'deliver-now' | 'hold' | 'digest' | 'drop';
    until?: number;
    reason: string;
};
/** Decide interruption policy from explicit time and local-calendar facts, never an ambient clock. */
export declare function decideDelivery(n: DeliveryNotice, c: DeliveryContext): DeliveryDecision;
