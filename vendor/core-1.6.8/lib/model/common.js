import { z } from 'zod';
export const TextSchema = z
    .string()
    .min(1)
    .refine((value) => value.trim().length > 0);
export const TimestampSchema = z.number().int().nonnegative().safe();
export const VersionSchema = z.number().int().nonnegative().safe();
export const TaskKindSchema = z.enum(['analyze', 'edit', 'test', 'doc', 'research']);
export const TaskStateSchema = z.enum([
    'PENDING',
    'READY',
    'RUNNING',
    'VERIFYING',
    'SUCCEEDED',
    'WAITING_APPROVAL',
    'BLOCKED',
    'FAILED',
    'UNKNOWN',
    'PAUSED',
    'CANCELLED',
]);
export const VerdictSchema = z.enum(['PASS', 'FAIL', 'INSUFFICIENT_EVIDENCE', 'NOT_SCORABLE', 'UNKNOWN']);
export const GoalStatusSchema = z.enum(['draft', 'active', 'paused', 'succeeded', 'completed', 'cancelled']);
//# sourceMappingURL=common.js.map