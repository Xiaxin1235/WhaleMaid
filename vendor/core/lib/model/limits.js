import { z } from 'zod';
export const DEFAULT_LIMITS = Object.freeze({
    maxFixRounds: 2,
    maxStallRounds: 3,
    maxConcurrentWritePerProject: 1,
    maxChangedFilesPerTask: 20,
    maxRunMinutes: 30,
    maxRunsPerDay: 20,
    plannerCallsPerDay: 5,
});
export const LimitsSchema = z.strictObject({
    maxFixRounds: z.int().nonnegative().default(DEFAULT_LIMITS.maxFixRounds),
    maxStallRounds: z.int().positive().default(DEFAULT_LIMITS.maxStallRounds),
    maxConcurrentWritePerProject: z.int().positive().default(DEFAULT_LIMITS.maxConcurrentWritePerProject),
    maxChangedFilesPerTask: z.int().nonnegative().default(DEFAULT_LIMITS.maxChangedFilesPerTask),
    maxRunMinutes: z.number().positive().finite().default(DEFAULT_LIMITS.maxRunMinutes),
    plannerCallsPerDay: z.int().nonnegative().default(DEFAULT_LIMITS.plannerCallsPerDay),
    maxRunsPerDay: z.int().nonnegative().default(DEFAULT_LIMITS.maxRunsPerDay),
});
//# sourceMappingURL=limits.js.map