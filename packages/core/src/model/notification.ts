import { DecisionChoiceSchema } from '../verify/model.js'
import { z } from 'zod'
import { ActionIntentSchema } from './action.js'
import { TextSchema, TimestampSchema, VersionSchema } from './common.js'
import {
  GoalIdSchema,
  NotificationIdSchema,
  SessionIdSchema,
  SuggestionIdSchema,
  TaskIdSchema,
} from './ids.js'

export const NotificationSchema = z.strictObject({
  id: NotificationIdSchema,
  kind: z.enum(['progress', 'decision', 'blocked', 'info']),
  priority: z.enum(['low', 'normal', 'high']),
  dedupeKey: TextSchema,
  goalId: GoalIdSchema,
  taskId: TaskIdSchema.optional(),
  channel: z.enum(['dsh-question', 'panel', 'system']),
  createdAt: TimestampSchema,
  runId: z.string().optional(),
  taskVersion: VersionSchema.optional(),
  reason: z.string().optional(),
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
})
export const SuggestionSchema = z.strictObject({
  id: SuggestionIdSchema,
  notificationId: NotificationIdSchema,
  label: TextSchema,
  description: z.string().optional(),
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
})
export type Notification = z.infer<typeof NotificationSchema>
export type Suggestion = z.infer<typeof SuggestionSchema>
