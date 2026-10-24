import { z } from 'zod'
import { MemoryScopeSchema, MemoryKindSchema, MemoryTextSchema } from './index.js'
import { GoalIdSchema } from '../model/ids.js'
/** Generation limits do not change the historical proposal storage schema below. */
export const MAX_CONSOLIDATION_SOURCES = 10
export const LessonDraftSchema = z.union([
  z.strictObject({ skip: z.literal(true) }),
  z.strictObject({ kind: z.enum(['decision', 'constraint']), text: MemoryTextSchema }),
])
export const ConsolidationDraftSchema = z.strictObject({
  kind: MemoryKindSchema,
  text: MemoryTextSchema,
  replaces: z.array(z.string()).min(2).max(MAX_CONSOLIDATION_SOURCES),
})
/** A draft is never a Memory: expiry and resolution cannot grant execution authority. */
export const MemoryProposalSchema = z.strictObject({
  id: z.string().min(1).max(128),
  kind: z.literal('memory-proposal'),
  scope: MemoryScopeSchema,
  memoryKind: MemoryKindSchema,
  text: MemoryTextSchema,
  origin: z.enum(['project-lesson', 'consolidation']),
  goalId: GoalIdSchema.optional(),
  trigger: z.enum(['completed', 'blocked', 'decision']).optional(),
  replaces: z
    .array(z.strictObject({ id: z.string().max(128), version: z.int().positive(), text: MemoryTextSchema }))
    .max(100),
  createdAt: z.int().nonnegative(),
  expiresAt: z.int().nonnegative(),
  status: z.enum(['pending', 'saved', 'declined', 'expired']),
  resolvedAt: z.int().nonnegative().optional(),
  memoryId: z.string().optional(),
  version: z.int().positive(),
  notifiedAt: z.int().nonnegative().optional(),
  delivery: z.enum(['started', 'answered', 'cancelled', 'failed']).optional(),
})
export type MemoryProposal = z.infer<typeof MemoryProposalSchema>
export type LessonTrigger = NonNullable<MemoryProposal['trigger']>
/** Accept only explicit structured outcomes; labels, free text and user notes never become triggers. */
export function lessonTrigger(event: {
  kind: 'goal' | 'notification' | 'choice'
  status?: string | undefined
  reason?: string | undefined
  action?: string | undefined
}): LessonTrigger | undefined {
  if (event.kind === 'goal' && event.status === 'completed') return 'completed'
  if (
    event.kind === 'notification' &&
    ['stalled', 'verification-unknown'].includes(event.reason?.split(':', 1)[0]?.trim() ?? '')
  )
    return 'blocked'
  if (
    event.kind === 'choice' &&
    event.status === 'succeeded' &&
    ['abandon', 'change-direction'].includes(event.action ?? '')
  )
    return 'decision'
  return undefined
}
/** Same trigger/goal consumes its allowance before a model request, including a failed request. */
export function mayDraftLesson(
  last: number | undefined,
  now: number,
  pending: number,
  enabled: boolean,
): boolean {
  return enabled && pending < 3 && (last === undefined || now - last >= 86400000)
}
