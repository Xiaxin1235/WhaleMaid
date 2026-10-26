import { z } from 'zod';
export declare const AutopilotEventSchema: z.ZodObject<{
    id: z.ZodString;
    goalId: z.ZodOptional<z.core.$ZodBranded<z.ZodString, "GoalId", "out">>;
    actor: z.ZodOptional<z.ZodEnum<{
        user: "user";
        companion: "companion";
        "companion-proposal": "companion-proposal";
    }>>;
    decisionId: z.ZodOptional<z.ZodString>;
    proposalId: z.ZodOptional<z.ZodString>;
    sessionId: z.ZodOptional<z.ZodString>;
    confirmedAt: z.ZodOptional<z.ZodNumber>;
    at: z.ZodNumber;
    action: z.ZodString;
    companionOperation: z.ZodOptional<z.ZodEnum<{
        pause: "pause";
        resume: "resume";
        "enable-autopilot": "enable-autopilot";
        "disable-autopilot": "disable-autopilot";
        "pause-all": "pause-all";
        "resume-all": "resume-all";
    }>>;
    reason: z.ZodString;
    taskId: z.ZodOptional<z.core.$ZodBranded<z.ZodString, "TaskId", "out">>;
    runId: z.ZodOptional<z.core.$ZodBranded<z.ZodString, "RunId", "out">>;
}, z.core.$strict>;
export type AutopilotEvent = z.infer<typeof AutopilotEventSchema>;
export declare const PlannerStateSchema: z.ZodObject<{
    id: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
    day: z.ZodString;
    calls: z.ZodInt;
    status: z.ZodEnum<{
        continue: "continue";
        none: "none";
        complete: "complete";
        "need-user": "need-user";
    }>;
    frontier: z.ZodDefault<z.ZodString>;
    reason: z.ZodDefault<z.ZodString>;
    notBefore: z.ZodDefault<z.ZodNumber>;
}, z.core.$strict>;
export type PlannerState = z.infer<typeof PlannerStateSchema>;
