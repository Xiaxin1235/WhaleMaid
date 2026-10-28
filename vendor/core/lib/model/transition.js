import { z } from 'zod';
import { TaskStateSchema, TextSchema, TimestampSchema } from './common.js';
import { RunIdSchema, TaskIdSchema, TransitionIdSchema } from './ids.js';
export const StateTransitionSchema = z.strictObject({
    id: TransitionIdSchema,
    entity: z.literal('task'),
    entityId: TaskIdSchema,
    from: TaskStateSchema,
    to: TaskStateSchema,
    at: TimestampSchema,
    source: TextSchema,
    reason: TextSchema,
    runId: RunIdSchema.optional(),
});
//# sourceMappingURL=transition.js.map