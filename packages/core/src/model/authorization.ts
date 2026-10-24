import { z } from 'zod'
import { ActionKindSchema } from './action.js'
import { TextSchema, TimestampSchema } from './common.js'
import { GoalIdSchema, ScopeIdSchema } from './ids.js'
import { DEFAULT_LIMITS, LimitsSchema } from './limits.js'

export { DEFAULT_LIMITS, LimitsSchema } from './limits.js'
export type { Limits } from './limits.js'

export const DEFAULT_PROTECTED_NAMES = [
  '.env',
  '.env.*',
  '*.pem',
  '*.key',
  'id_rsa*',
  'id_ed25519*',
  '.npmrc',
  '.pypirc',
] as const
export const ProtectedNamesSchema = z
  .array(
    z
      .string()
      .min(1)
      .max(200)
      .regex(/^[^\\/?:<>|"]+$/)
      .refine((value) => [...value].every((char) => char.charCodeAt(0) >= 32)),
  )
  .max(100)
  .default([...DEFAULT_PROTECTED_NAMES])

export const ScopeHashSchema = z.string().regex(/^[a-f0-9]{64}$/)
export function checkCommandMode(
  scope: { commandMode: 'confirmed' | 'trusted'; permissionPreset: string },
  ctx: z.RefinementCtx,
) {
  if (scope.commandMode === 'trusted' && scope.permissionPreset !== 'workspace-write')
    ctx.addIssue({ code: 'custom', path: ['commandMode'], message: 'trusted-requires-workspace-write' })
}
export const ScopeContentSchema = z
  .strictObject({
    id: ScopeIdSchema,
    goalId: GoalIdSchema,
    allowedPaths: z.array(TextSchema),
    protectedPaths: z.array(TextSchema),
    protectedNames: ProtectedNamesSchema,
    legacyAuthorization: z.literal(true).optional(),
    allowedActions: z.array(ActionKindSchema),
    forbiddenActions: z.array(ActionKindSchema),
    // Commands are exact user-confirmed strings, not whitespace-normalized shell text.
    verifyCommands: z.array(z.string().min(1)),
    limits: LimitsSchema.default(DEFAULT_LIMITS),
    permissionPreset: z.enum(['read-only', 'workspace-write']),
    commandMode: z.enum(['confirmed', 'trusted']).default('confirmed'),
    supersedes: ScopeIdSchema.optional(),
    status: z.enum(['active', 'revoked', 'superseded']),
    grantedAt: TimestampSchema,
    revokedAt: TimestampSchema.optional(),
  })
  .superRefine(checkCommandMode)
export const AuthorizationScopeSchema = ScopeContentSchema.safeExtend({ hash: ScopeHashSchema })
export const ScopeSchema = AuthorizationScopeSchema
export type AuthorizationScope = z.infer<typeof AuthorizationScopeSchema>
export type ScopeContent = z.infer<typeof ScopeContentSchema>
