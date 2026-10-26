import { z } from 'zod';
export declare const CodexArgumentsSchema: z.ZodObject<{
    task: z.ZodString;
    mode: z.ZodDefault<z.ZodEnum<{
        "read-only": "read-only";
        "workspace-write": "workspace-write";
    }>>;
}, z.core.$strict>;
export declare const CodexSettingsSchema: z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    timeoutMinutes: z.ZodDefault<z.ZodNumber>;
}, z.core.$strict>;
export declare const CodexRecordSchema: z.ZodObject<{
    id: z.ZodString;
    at: z.ZodNumber;
    sessionId: z.ZodString;
    mode: z.ZodEnum<{
        "read-only": "read-only";
        "workspace-write": "workspace-write";
    }>;
    cwd: z.ZodString;
    task: z.ZodString;
    status: z.ZodString;
    exitCode: z.ZodNullable<z.ZodNumber>;
    elapsedMs: z.ZodNumber;
    files: z.ZodArray<z.ZodString>;
    logPath: z.ZodString;
    pid: z.ZodOptional<z.ZodNumber>;
}, z.core.$strict>;
export declare const CodexPanelSchema: z.ZodObject<{
    settings: z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        timeoutMinutes: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strict>;
    records: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        at: z.ZodNumber;
        sessionId: z.ZodString;
        mode: z.ZodEnum<{
            "read-only": "read-only";
            "workspace-write": "workspace-write";
        }>;
        cwd: z.ZodString;
        task: z.ZodString;
        status: z.ZodString;
        exitCode: z.ZodNullable<z.ZodNumber>;
        elapsedMs: z.ZodNumber;
        files: z.ZodArray<z.ZodString>;
        logPath: z.ZodString;
        pid: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type CodexSettings = z.infer<typeof CodexSettingsSchema>;
export type CodexRecord = z.infer<typeof CodexRecordSchema>;
export type CodexArguments = z.infer<typeof CodexArgumentsSchema>;
export declare const codexCopy: (locale: "zh-CN" | "en") => {
    title: string;
    enabled: string;
    timeout: string;
    description: string;
    history: string;
    empty: string;
    save: string;
    failed: string;
};
