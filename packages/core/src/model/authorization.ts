import { z } from 'zod'
import { ActionKindSchema } from './action.js'
import { TextSchema, TimestampSchema } from './common.js'
import { GoalIdSchema, ScopeIdSchema } from './ids.js'
import { DEFAULT_LIMITS, LimitsSchema } from './limits.js'

export { DEFAULT_LIMITS, LimitsSchema } from './limits.js'
export type { Limits } from './limits.js'

export const ScopeHashSchema = z.string().regex(/^[a-f0-9]{64}$/)
export const ScopeContentSchema = z.strictObject({
  id: ScopeIdSchema,
  goalId: GoalIdSchema,
  allowedPaths: z.array(TextSchema),
  protectedPaths: z.array(TextSchema),
  allowedActions: z.array(ActionKindSchema),
  forbiddenActions: z.array(ActionKindSchema),
  // Commands are exact user-confirmed strings, not whitespace-normalized shell text.
  verifyCommands: z.array(z.string().min(1)),
  limits: LimitsSchema.default(DEFAULT_LIMITS),
  permissionPreset: z.enum(['read-only', 'workspace-write']),
  supersedes: ScopeIdSchema.optional(),
  status: z.enum(['active', 'revoked', 'superseded']),
  grantedAt: TimestampSchema,
  revokedAt: TimestampSchema.optional(),
})
export const AuthorizationScopeSchema = ScopeContentSchema.extend({ hash: ScopeHashSchema })
export const ScopeSchema = AuthorizationScopeSchema
export type AuthorizationScope = z.infer<typeof AuthorizationScopeSchema>
export type ScopeContent = z.infer<typeof ScopeContentSchema>
