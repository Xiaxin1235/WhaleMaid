import { z } from 'zod';
export declare const CommandResultSchema: z.ZodObject<{
    command: z.ZodString;
    status: z.ZodEnum<{
        error: "error";
        passed: "passed";
        failed: "failed";
        timeout: "timeout";
    }>;
    exitCode: z.ZodNullable<z.ZodNumber>;
    counts: z.ZodOptional<z.ZodObject<{
        passed: z.ZodInt;
        failed: z.ZodInt;
        skipped: z.ZodInt;
    }, z.core.$strict>>;
    durationMs: z.ZodOptional<z.ZodNumber>;
    logPath: z.ZodOptional<z.ZodString>;
    hash: z.ZodOptional<z.ZodString>;
    tail: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export type CommandResult = z.infer<typeof CommandResultSchema>;
/** Read only known runner summary lines; exit status remains authoritative. */
export declare function parseCommandResult(input: {
    command: string;
    exitCode: number | null;
    timedOut: boolean;
    stdout: string;
    stderr: string;
    spawnError?: boolean;
    signal?: string | null;
}): CommandResult;
