import { DecisionChoiceSchema } from '../verify/model.js';
import { z } from 'zod';
import { ActionIntentSchema } from './action.js';
import { INITIATIVE_CARD_CAPACITY, INITIATIVE_NOTIFICATION_KIND, InitiativeChoiceSchema, } from '../initiative/model.js';
import { TextSchema, TimestampSchema, VersionSchema } from './common.js';
import { GoalIdSchema, NotificationIdSchema, SessionIdSchema, SuggestionIdSchema, TaskIdSchema, } from './ids.js';
export const DecisionDeliverySchema = z.strictObject({
    generation: z.int().nonnegative(),
    failures: z.int().nonnegative(),
    outcome: z.enum(['ready', 'asking', 'answered', 'unanswered', 'cancelled', 'failed']),
    reason: z.string().optional(),
    retryAt: TimestampSchema.optional(),
});
export function isDecision(n) {
    return n.kind === 'decision' || n.kind === 'blocked';
}
export function isReliableQuestion(n) {
    return isDecision(n) || n.kind === INITIATIVE_NOTIFICATION_KIND;
}
export const NotificationSchema = z.strictObject({
    id: NotificationIdSchema,
    kind: z.enum(['progress', 'decision', 'blocked', 'info', INITIATIVE_NOTIFICATION_KIND]),
    priority: z.enum(['low', 'normal', 'high']),
    dedupeKey: TextSchema,
    goalId: GoalIdSchema,
    taskId: TaskIdSchema.optional(),
    channel: z.enum(['dsh-question', 'panel', 'system']),
    createdAt: TimestampSchema,
    runId: z.string().optional(),
    taskVersion: VersionSchema.optional(),
    reason: z.string().optional(),
    initiative: z
        .strictObject({
        ids: z.array(z.string()).min(1).max(INITIATIVE_CARD_CAPACITY),
        level: z.enum(['L2', 'L3']),
        goalFingerprint: z.string(),
    })
        .optional(),
    decisionDelivery: DecisionDeliverySchema.optional(),
    decisionBinding: z
        .strictObject({
        scopeId: z.string(),
        scopeHash: z.string(),
        transitionId: z.string().nullable().optional(),
    })
        .optional(),
    deliveryAttemptedAt: TimestampSchema.optional(),
    deliveryState: z
        .enum(['delivered', 'held', 'muted', 'digest', 'dropped', 'cancelled', 'failed'])
        .optional(),
    deliveryReason: z.string().optional(),
    nextDeliveryAt: TimestampSchema.optional(),
    remindAt: TimestampSchema.optional(),
    suggestionIds: z.array(z.string()).optional(),
    routingSuggestionId: z.string().optional(),
    lastSelectionId: z.string().optional(),
    resolvedSource: z.enum(['inbox', 'panel']).optional(),
    choices: z.array(DecisionChoiceSchema).optional(),
    expiresAt: TimestampSchema.optional(),
    resolvedReason: z.enum(['expired', 'superseded']).optional(),
    resolvedChoice: DecisionChoiceSchema.optional(),
    resolvedAt: TimestampSchema.optional(),
    deliveredAt: TimestampSchema.optional(),
    snoozedUntil: TimestampSchema.optional(),
    readAt: TimestampSchema.optional(),
});
export const SuggestionSchema = z.strictObject({
    id: SuggestionIdSchema,
    notificationId: NotificationIdSchema,
    label: TextSchema,
    description: z.string().optional(),
    initiative: z.strictObject({ choice: InitiativeChoiceSchema, opportunityId: z.string() }).optional(),
    intent: z.union([
        ActionIntentSchema,
        z.strictObject({ type: z.literal('notification-action'), action: z.enum(['snooze', 'open-panel']) }),
        z.strictObject({ type: z.literal('panel-decision'), choice: DecisionChoiceSchema }),
    ]),
    riskLevel: z.enum(['low', 'medium', 'high']),
    expiresAt: TimestampSchema,
    bindTo: z.union([
        z.strictObject({
            goalId: GoalIdSchema,
            notificationId: NotificationIdSchema,
            taskId: TaskIdSchema.optional(),
            taskVersion: VersionSchema.optional(),
            generation: z.int().nonnegative().optional(),
            goalVersion: VersionSchema.optional(),
            scopeHash: z.string(),
            scopeId: z.string(),
        }),
        z.strictObject({ goalId: GoalIdSchema }),
        z.strictObject({
            goalId: GoalIdSchema,
            taskId: TaskIdSchema,
            taskVersion: VersionSchema,
            sessionId: SessionIdSchema,
        }),
    ]),
    consumedAt: TimestampSchema.optional(),
});
//# sourceMappingURL=notification.js.map