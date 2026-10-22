import { z } from 'zod'
import { TaskKindSchema, TaskStateSchema, TextSchema, TimestampSchema, VersionSchema } from './common.js'
import { GoalIdSchema, TaskIdSchema } from './ids.js'

export const TaskSchema = z.strictObject({
  id: TaskIdSchema,
  goalId: GoalIdSchema,
  key: TextSchema,
  title: TextSchema,
  kind: TaskKindSchema,
  dependsOn: z.array(TaskIdSchema),
  state: TaskStateSchema,
  acceptance: z.array(TextSchema),
  failureSummary: z.string().optional(),
  attempts: z.int().nonnegative(),
  createdBy: z.enum(['user', 'planner']),
  createdAt: TimestampSchema,
  version: VersionSchema,
})
export type Task = z.infer<typeof TaskSchema>
