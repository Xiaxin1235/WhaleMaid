import { z } from 'zod'
import { CheckpointIdSchema, GoalIdSchema, SessionIdSchema } from './ids.js'
import { TextSchema } from './common.js'
import { LimitsSchema } from './limits.js'

export const ActionKindSchema = z.enum([
  'read-file',
  'write-file',
  'run-command',
  'git',
  'network',
  'continue-goal',
  'pause-goal',
  'resume-goal',
  'rollback-to-checkpoint',
  'reply-to-session',
  'open-workbench',
  'expand-scope',
])

// Scope expansion remains an inert proposal. Only the UI can confirm and apply it.
export const ScopePatchSchema = z.strictObject({
  allowedPaths: z.array(TextSchema).optional(),
  protectedPaths: z.array(TextSchema).optional(),
  allowedActions: z.array(ActionKindSchema).optional(),
  forbiddenActions: z.array(ActionKindSchema).optional(),
  verifyCommands: z.array(TextSchema).optional(),
  permissionPreset: z.enum(['read-only', 'workspace-write']).optional(),
  limits: LimitsSchema.partial().optional(),
})

export const ActionIntentSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('read-file'), path: TextSchema }),
  z.strictObject({ type: z.literal('write-file'), path: TextSchema }),
  z.strictObject({ type: z.literal('run-command'), cmdline: TextSchema, cwd: TextSchema }),
  z.strictObject({ type: z.literal('git'), subcommand: TextSchema, args: z.array(z.string()) }),
  z.strictObject({ type: z.literal('network'), url: z.url(), method: TextSchema }),
  z.strictObject({ type: z.literal('continue-goal'), goalId: GoalIdSchema }),
  z.strictObject({ type: z.literal('pause-goal'), goalId: GoalIdSchema }),
  z.strictObject({ type: z.literal('resume-goal'), goalId: GoalIdSchema }),
  z.strictObject({ type: z.literal('rollback-to-checkpoint'), checkpointId: CheckpointIdSchema }),
  z.strictObject({ type: z.literal('reply-to-session'), sessionId: SessionIdSchema, text: TextSchema }),
  z.strictObject({ type: z.literal('open-workbench'), sessionId: SessionIdSchema.optional() }),
  z.strictObject({ type: z.literal('expand-scope'), goalId: GoalIdSchema, patch: ScopePatchSchema }),
])

export type ActionKind = z.infer<typeof ActionKindSchema>
export type ActionIntent = z.infer<typeof ActionIntentSchema>
export type ScopePatch = z.infer<typeof ScopePatchSchema>
