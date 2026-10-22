import { z } from 'zod'

const IdSchema = z.string().trim().min(1)
export const GoalIdSchema = IdSchema.brand<'GoalId'>()
export const ScopeIdSchema = IdSchema.brand<'ScopeId'>()
export const TaskIdSchema = IdSchema.brand<'TaskId'>()
export const RunIdSchema = IdSchema.brand<'RunId'>()
export const AttemptIdSchema = IdSchema.brand<'AttemptId'>()
export const CheckpointIdSchema = IdSchema.brand<'CheckpointId'>()
export const EvidenceIdSchema = IdSchema.brand<'EvidenceId'>()
export const MemoryIdSchema = IdSchema.brand<'MemoryId'>()
export const NotificationIdSchema = IdSchema.brand<'NotificationId'>()
export const SuggestionIdSchema = IdSchema.brand<'SuggestionId'>()
export const TransitionIdSchema = IdSchema.brand<'TransitionId'>()
export const SessionIdSchema = IdSchema.brand<'SessionId'>()

export type GoalId = z.infer<typeof GoalIdSchema>
export type ScopeId = z.infer<typeof ScopeIdSchema>
export type TaskId = z.infer<typeof TaskIdSchema>
export type RunId = z.infer<typeof RunIdSchema>
export type AttemptId = z.infer<typeof AttemptIdSchema>
export type CheckpointId = z.infer<typeof CheckpointIdSchema>
export type EvidenceId = z.infer<typeof EvidenceIdSchema>
export type MemoryId = z.infer<typeof MemoryIdSchema>
export type NotificationId = z.infer<typeof NotificationIdSchema>
export type SuggestionId = z.infer<typeof SuggestionIdSchema>
export type TransitionId = z.infer<typeof TransitionIdSchema>
export type SessionId = z.infer<typeof SessionIdSchema>
