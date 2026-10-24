import { z } from 'zod'
import { RunIdSchema, TaskIdSchema } from '../model/ids.js'
import { CommandResultSchema } from './parse.js'
import { JudgmentSchema } from './judge.js'
import { DecisionSchema } from './decide.js'
export const VerificationSchema = z.strictObject({
  id: RunIdSchema,
  taskId: TaskIdSchema,
  checkpoint: z.string(),
  createdAt: z.number(),
  baseline: z.array(CommandResultSchema),
  current: z.array(CommandResultSchema),
  judgment: JudgmentSchema,
  decision: DecisionSchema,
})
export type Verification = z.infer<typeof VerificationSchema>
export const DecisionChoiceSchema = z.enum([
  'abandon',
  'change-direction',
  'retry',
  'accept',
  'rollback',
  'pause-goal',
  'view-diff',
  'verify',
  'resume-goal',
])
export type DecisionChoice = z.infer<typeof DecisionChoiceSchema>
