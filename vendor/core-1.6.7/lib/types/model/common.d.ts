import { z } from 'zod';
export declare const TextSchema: z.ZodString;
export declare const TimestampSchema: z.ZodNumber;
export declare const VersionSchema: z.ZodNumber;
export declare const TaskKindSchema: z.ZodEnum<{
    analyze: "analyze";
    edit: "edit";
    test: "test";
    doc: "doc";
    research: "research";
}>;
export declare const TaskStateSchema: z.ZodEnum<{
    PENDING: "PENDING";
    READY: "READY";
    RUNNING: "RUNNING";
    VERIFYING: "VERIFYING";
    SUCCEEDED: "SUCCEEDED";
    WAITING_APPROVAL: "WAITING_APPROVAL";
    BLOCKED: "BLOCKED";
    FAILED: "FAILED";
    UNKNOWN: "UNKNOWN";
    PAUSED: "PAUSED";
    CANCELLED: "CANCELLED";
}>;
export declare const VerdictSchema: z.ZodEnum<{
    UNKNOWN: "UNKNOWN";
    PASS: "PASS";
    FAIL: "FAIL";
    INSUFFICIENT_EVIDENCE: "INSUFFICIENT_EVIDENCE";
    NOT_SCORABLE: "NOT_SCORABLE";
}>;
export declare const GoalStatusSchema: z.ZodEnum<{
    draft: "draft";
    active: "active";
    paused: "paused";
    succeeded: "succeeded";
    completed: "completed";
    cancelled: "cancelled";
}>;
export type TaskKind = z.infer<typeof TaskKindSchema>;
export type TaskState = z.infer<typeof TaskStateSchema>;
export type Verdict = z.infer<typeof VerdictSchema>;
