import { z } from 'zod'
import { GoalStatusSchema, TextSchema, TimestampSchema, VersionSchema } from './common.js'
import { GoalIdSchema, ScopeIdSchema } from './ids.js'

export const GoalSchema = z.strictObject({
  id: GoalIdSchema,
  title: TextSchema,
  objective: TextSchema,
  expectedOutcome: TextSchema,
  projectRoot: TextSchema,
  acceptance: z.array(TextSchema),
  stopConditions: z.array(TextSchema),
  mode: z.enum(['suggest', 'autonomous', 'high']),
  status: GoalStatusSchema,
  scopeId: ScopeIdSchema.optional(),
  createdAt: TimestampSchema,
  confirmedAt: TimestampSchema.optional(),
  version: VersionSchema,
})
export const ProjectGoalSchema = GoalSchema
export type ProjectGoal = z.infer<typeof GoalSchema>
