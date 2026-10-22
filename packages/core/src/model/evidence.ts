import { z } from 'zod'
import { TextSchema, VerdictSchema } from './common.js'
import { EvidenceIdSchema, RunIdSchema } from './ids.js'

export const EvidenceSchema = z
  .strictObject({
    id: EvidenceIdSchema,
    runId: RunIdSchema,
    kind: z.enum(['test-report', 'diff', 'file', 'metric', 'log']),
    path: TextSchema.optional(),
    hash: TextSchema.optional(),
    summary: TextSchema,
    verdict: VerdictSchema,
  })
  .refine((value) => value.path !== undefined || value.hash !== undefined, {
    message: 'Evidence requires a path or hash',
  })
export type Evidence = z.infer<typeof EvidenceSchema>
