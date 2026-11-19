import { z } from 'zod';
export declare const GoalSchema: z.ZodObject<{
    id: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
    title: z.ZodString;
    objective: z.ZodString;
    expectedOutcome: z.ZodString;
    projectRoot: z.ZodString;
    acceptance: z.ZodArray<z.ZodString>;
    stopConditions: z.ZodArray<z.ZodString>;
    mode: z.ZodEnum<{
        suggest: "suggest";
        autonomous: "autonomous";
        high: "high";
    }>;
    status: z.ZodEnum<{
        draft: "draft";
        active: "active";
        paused: "paused";
        succeeded: "succeeded";
        completed: "completed";
        cancelled: "cancelled";
    }>;
    autopilot: z.ZodDefault<z.ZodObject<{
        enabled: z.ZodBoolean;
        enabledAt: z.ZodOptional<z.ZodNumber>;
        disabledReason: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    inboxSessionId: z.ZodOptional<z.ZodString>;
    scopeId: z.ZodOptional<z.core.$ZodBranded<z.ZodString, "ScopeId", "out">>;
    createdAt: z.ZodNumber;
    confirmedAt: z.ZodOptional<z.ZodNumber>;
    stalled: z.ZodOptional<z.ZodInt>;
    version: z.ZodNumber;
}, z.core.$strict>;
export declare const ProjectGoalSchema: z.ZodObject<{
    id: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
    title: z.ZodString;
    objective: z.ZodString;
    expectedOutcome: z.ZodString;
    projectRoot: z.ZodString;
    acceptance: z.ZodArray<z.ZodString>;
    stopConditions: z.ZodArray<z.ZodString>;
    mode: z.ZodEnum<{
        suggest: "suggest";
        autonomous: "autonomous";
        high: "high";
    }>;
    status: z.ZodEnum<{
        draft: "draft";
        active: "active";
        paused: "paused";
        succeeded: "succeeded";
        completed: "completed";
        cancelled: "cancelled";
    }>;
    autopilot: z.ZodDefault<z.ZodObject<{
        enabled: z.ZodBoolean;
        enabledAt: z.ZodOptional<z.ZodNumber>;
        disabledReason: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    inboxSessionId: z.ZodOptional<z.ZodString>;
    scopeId: z.ZodOptional<z.core.$ZodBranded<z.ZodString, "ScopeId", "out">>;
    createdAt: z.ZodNumber;
    confirmedAt: z.ZodOptional<z.ZodNumber>;
    stalled: z.ZodOptional<z.ZodInt>;
    version: z.ZodNumber;
}, z.core.$strict>;
export type ProjectGoal = z.infer<typeof GoalSchema>;
