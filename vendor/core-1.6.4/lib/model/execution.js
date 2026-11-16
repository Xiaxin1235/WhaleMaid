import { z } from 'zod';
import { RunScopeSchema } from '../run-scope.js';
import { TextSchema, TimestampSchema, VerdictSchema } from './common.js';
import { AttemptIdSchema, CheckpointIdSchema, GoalIdSchema, RunIdSchema, SessionIdSchema, TaskIdSchema, } from './ids.js';
export const RunSchema = z.strictObject({
    run_id: RunIdSchema,
    taskId: TaskIdSchema,
    sessionId: SessionIdSchema,
    worktreePath: TextSchema,
    baseCommit: TextSchema,
    startedAt: TimestampSchema,
    endedAt: TimestampSchema.optional(),
    status: z.enum(['running', 'ended']).default('ended'),
    runScope: RunScopeSchema.optional(),
    reason: z.string().optional(),
    finalReplyNonempty: z.boolean().optional(),
    toolCalls: z.number().int().nonnegative().default(0),
    deniedCalls: z.number().int().nonnegative().default(0),
    outcome: VerdictSchema.default('UNKNOWN'),
});
export const AttemptSchema = z.strictObject({
    attempt_id: AttemptIdSchema,
    runId: RunIdSchema,
    n: z.int().positive(),
    startedAt: TimestampSchema,
    endedAt: TimestampSchema.optional(),
    outcome: VerdictSchema.default('UNKNOWN'),
});
export const CheckpointSchema = z.strictObject({
    id: CheckpointIdSchema,
    goalId: GoalIdSchema,
    taskId: TaskIdSchema,
    commit: TextSchema,
    files: z.array(z.string()).default([]),
    diffStat: z.string().default(''),
    kind: z.enum(['baseline', 'progress', 'verified', 'rollback', 'reconciled']),
    createdAt: TimestampSchema,
});
//# sourceMappingURL=execution.js.map