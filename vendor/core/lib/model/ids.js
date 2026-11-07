import { z } from 'zod';
const IdSchema = z.string().trim().min(1);
export const GoalIdSchema = IdSchema.brand();
export const ScopeIdSchema = IdSchema.brand();
export const TaskIdSchema = IdSchema.brand();
export const RunIdSchema = IdSchema.brand();
export const AttemptIdSchema = IdSchema.brand();
export const CheckpointIdSchema = IdSchema.brand();
export const EvidenceIdSchema = IdSchema.brand();
export const MemoryIdSchema = IdSchema.brand();
export const NotificationIdSchema = IdSchema.brand();
export const SuggestionIdSchema = IdSchema.brand();
export const TransitionIdSchema = IdSchema.brand();
export const SessionIdSchema = IdSchema.brand();
//# sourceMappingURL=ids.js.map