import { z } from 'zod';
export declare const TaskSchema: z.ZodObject<{
    id: z.core.$ZodBranded<z.ZodString, "TaskId", "out">;
    goalId: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
    key: z.ZodString;
    title: z.ZodString;
    kind: z.ZodEnum<{
        analyze: "analyze";
        edit: "edit";
        test: "test";
        doc: "doc";
        research: "research";
    }>;
    dependsOn: z.ZodArray<z.core.$ZodBranded<z.ZodString, "TaskId", "out">>;
    state: z.ZodEnum<{
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
    acceptance: z.ZodArray<z.ZodString>;
    failureSummary: z.ZodOptional<z.ZodString>;
    unknownVerifications: z.ZodOptional<z.ZodInt>;
    attempts: z.ZodInt;
    createdBy: z.ZodEnum<{
        user: "user";
        planner: "planner";
    }>;
    createdAt: z.ZodNumber;
    version: z.ZodNumber;
}, z.core.$strict>;
export type Task = z.infer<typeof TaskSchema>;
