import { z } from 'zod';
export declare const DEFAULT_LIMITS: Readonly<{
    maxFixRounds: 2;
    maxStallRounds: 3;
    maxConcurrentWritePerProject: 1;
    maxChangedFilesPerTask: 20;
    maxRunMinutes: 30;
    maxRunsPerDay: 20;
    plannerCallsPerDay: 5;
}>;
export declare const LimitsSchema: z.ZodObject<{
    maxFixRounds: z.ZodDefault<z.ZodInt>;
    maxStallRounds: z.ZodDefault<z.ZodInt>;
    maxConcurrentWritePerProject: z.ZodDefault<z.ZodInt>;
    maxChangedFilesPerTask: z.ZodDefault<z.ZodInt>;
    maxRunMinutes: z.ZodDefault<z.ZodNumber>;
    plannerCallsPerDay: z.ZodDefault<z.ZodInt>;
    maxRunsPerDay: z.ZodDefault<z.ZodInt>;
}, z.core.$strict>;
export type Limits = z.infer<typeof LimitsSchema>;
