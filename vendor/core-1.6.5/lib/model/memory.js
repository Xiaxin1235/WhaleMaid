import { z } from 'zod';
import { TextSchema, VersionSchema } from './common.js';
import { EvidenceIdSchema, MemoryIdSchema } from './ids.js';
export const MemoryRecordSchema = z.strictObject({
    id: MemoryIdSchema,
    scope: z.enum(['user', 'project']),
    content: TextSchema,
    type: z.enum(['fact', 'preference', 'inference', 'external']),
    source: TextSchema,
    evidenceRef: EvidenceIdSchema.optional(),
    valid: z.boolean(),
    version: VersionSchema,
    privacy: z.enum(['private', 'project', 'public']),
});
//# sourceMappingURL=memory.js.map