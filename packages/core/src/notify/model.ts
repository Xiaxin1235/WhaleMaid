import { z } from 'zod'
import { GoalIdSchema, NotificationIdSchema } from '../model/ids.js'
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
export const NotificationPreferencesSchema = z.strictObject({
  quietHours: z.strictObject({ start: time, end: time }).optional(),
  maxPerHour: z.int().min(1).max(100).default(4),
  muted: z.boolean().default(false),
})
export type NotificationPreferences = z.infer<typeof NotificationPreferencesSchema>
export const UserNoteSchema = z
  .strictObject({
    id: z.string(),
    goalId: GoalIdSchema,
    notificationId: NotificationIdSchema.optional(),
    source: z.literal('companion').optional(),
    at: z.number(),
    text: z.string().refine((value) => Array.from(value).length <= 500, 'User note exceeds 500 characters'),
  })
  .refine((n) => n.notificationId !== undefined || n.source === 'companion', 'note-source-required')
export const NotificationChoiceSchema = z.strictObject({
  id: z.string(),
  goalId: GoalIdSchema,
  notificationId: NotificationIdSchema,
  suggestionId: z.string(),
  reason: z.string(),
  action: z.string(),
  source: z.enum(['inbox', 'panel']),
  at: z.number(),
  result: z.enum(['pending', 'succeeded', 'failed']),
  detail: z.string().optional(),
})
export type NotificationChoice = z.infer<typeof NotificationChoiceSchema>
export const InboxSessionSchema = z.strictObject({ id: z.string(), goalId: GoalIdSchema, at: z.number() })
export const DeliveryRecordSchema = z.strictObject({
  id: z.string(),
  goalId: GoalIdSchema,
  notificationId: NotificationIdSchema,
  at: z.number(),
  result: z.enum(['started', 'answered', 'cancelled', 'failed']),
  detail: z.string().optional(),
})
