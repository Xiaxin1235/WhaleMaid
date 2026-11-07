import { z } from 'zod';
export declare const StateTransitionSchema: z.ZodObject<{
    id: z.core.$ZodBranded<z.ZodString, "TransitionId", "out">;
    entity: z.ZodLiteral<"task">;
    entityId: z.core.$ZodBranded<z.ZodString, "TaskId", "out">;
    from: z.ZodEnum<{
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
    to: z.ZodEnum<{
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
    at: z.ZodNumber;
    source: z.ZodString;
    reason: z.ZodString;
    runId: z.ZodOptional<z.core.$ZodBranded<z.ZodString, "RunId", "out">>;
}, z.core.$strict>;
export type StateTransition = z.infer<typeof StateTransitionSchema>;
