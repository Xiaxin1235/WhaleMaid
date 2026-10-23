import { z } from 'zod'
import { GoalIdSchema, TaskIdSchema, RunIdSchema } from '../model/ids.js'
export const AutopilotEventSchema = z.strictObject({
  id: z.string(),
  goalId: GoalIdSchema,
  at: z.number().int().nonnegative(),
  action: z.string(),
  reason: z.string(),
  taskId: TaskIdSchema.optional(),
  runId: RunIdSchema.optional(),
})
export type AutopilotEvent = z.infer<typeof AutopilotEventSchema>
export const PlannerStateSchema = z.strictObject({
  id: GoalIdSchema,
  day: z.string(),
  calls: z.int().nonnegative(),
  status: z.enum(['none', 'continue', 'complete', 'need-user']),
  frontier: z.string().default(''),
  reason: z.string().default(''),
  notBefore: z.number().default(0),
})
export type PlannerState = z.infer<typeof PlannerStateSchema>
