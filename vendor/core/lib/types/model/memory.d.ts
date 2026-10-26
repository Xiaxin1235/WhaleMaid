import { z } from 'zod';
export declare const MemoryRecordSchema: z.ZodObject<{
    id: z.core.$ZodBranded<z.ZodString, "MemoryId", "out">;
    scope: z.ZodEnum<{
        user: "user";
        project: "project";
    }>;
    content: z.ZodString;
    type: z.ZodEnum<{
        fact: "fact";
        preference: "preference";
        inference: "inference";
        external: "external";
    }>;
    source: z.ZodString;
    evidenceRef: z.ZodOptional<z.core.$ZodBranded<z.ZodString, "EvidenceId", "out">>;
    valid: z.ZodBoolean;
    version: z.ZodNumber;
    privacy: z.ZodEnum<{
        project: "project";
        private: "private";
        public: "public";
    }>;
}, z.core.$strict>;
export type MemoryRecord = z.infer<typeof MemoryRecordSchema>;
