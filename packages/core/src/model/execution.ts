import { z } from 'zod'
import { TextSchema, TimestampSchema, VerdictSchema } from './common.js'
import {
  AttemptIdSchema,
  CheckpointIdSchema,
  GoalIdSchema,
  RunIdSchema,
  SessionIdSchema,
  TaskIdSchema,
} from './ids.js'

export const RunSchema = z.strictObject({
  run_id: RunIdSchema,
  taskId: TaskIdSchema,
  sessionId: SessionIdSchema,
  worktreePath: TextSchema,
  baseCommit: TextSchema,
  startedAt: TimestampSchema,
  endedAt: TimestampSchema.optional(),
  outcome: VerdictSchema.default('UNKNOWN'),
})
export const AttemptSchema = z.strictObject({
  attempt_id: AttemptIdSchema,
  runId: RunIdSchema,
  n: z.int().positive(),
  startedAt: TimestampSchema,
  endedAt: TimestampSchema.optional(),
  outcome: VerdictSchema.default('UNKNOWN'),
})
export const CheckpointSchema = z.strictObject({
  id: CheckpointIdSchema,
  goalId: GoalIdSchema,
  taskId: TaskIdSchema,
  commit: TextSchema,
  kind: z.enum(['baseline', 'progress', 'verified', 'rollback']),
  createdAt: TimestampSchema,
})
export type Run = z.infer<typeof RunSchema>
export type Attempt = z.infer<typeof AttemptSchema>
export type Checkpoint = z.infer<typeof CheckpointSchema>
