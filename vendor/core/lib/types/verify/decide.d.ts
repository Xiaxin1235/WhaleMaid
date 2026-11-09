import { z } from 'zod';
import type { Limits } from '../model/limits.js';
import type { Judgment } from './judge.js';
declare const current: z.ZodObject<{
    taskOutcome: z.ZodEnum<{
        reconcile: "reconcile";
        succeed: "succeed";
        retry: "retry";
        "rollback-and-retry": "rollback-and-retry";
        "ask-user": "ask-user";
    }>;
    goalAction: z.ZodEnum<{
        continue: "continue";
        pause: "pause";
    }>;
    unknownVerifications: z.ZodInt;
    reason: z.ZodString;
    goalProgress: z.ZodInt;
    attempts: z.ZodInt;
    failureSummary: z.ZodString;
}, z.core.$strict>;
export declare const DecisionSchema: z.ZodUnion<readonly [z.ZodObject<{
    taskOutcome: z.ZodEnum<{
        reconcile: "reconcile";
        succeed: "succeed";
        retry: "retry";
        "rollback-and-retry": "rollback-and-retry";
        "ask-user": "ask-user";
    }>;
    goalAction: z.ZodEnum<{
        continue: "continue";
        pause: "pause";
    }>;
    unknownVerifications: z.ZodInt;
    reason: z.ZodString;
    goalProgress: z.ZodInt;
    attempts: z.ZodInt;
    failureSummary: z.ZodString;
}, z.core.$strict>, z.ZodPipe<z.ZodObject<{
    type: z.ZodEnum<{
        "pause-goal": "pause-goal";
        reconcile: "reconcile";
        succeed: "succeed";
        retry: "retry";
        "rollback-and-retry": "rollback-and-retry";
        "ask-user": "ask-user";
    }>;
    reason: z.ZodString;
    goalProgress: z.ZodInt;
    attempts: z.ZodInt;
    failureSummary: z.ZodString;
}, z.core.$strict>, z.ZodTransform<{
    taskOutcome: "reconcile" | "succeed" | "retry" | "rollback-and-retry" | "ask-user";
    goalAction: "continue" | "pause";
    unknownVerifications: number;
    reason: string;
    goalProgress: number;
    attempts: number;
    failureSummary: string;
}, {
    type: "pause-goal" | "reconcile" | "succeed" | "retry" | "rollback-and-retry" | "ask-user";
    reason: string;
    goalProgress: number;
    attempts: number;
    failureSummary: string;
}>>]>;
export type Decision = z.infer<typeof current>;
/** Separate task acceptance from goal-level stalls; neutral leaves the stall counter untouched. */
export declare function decideNext(input: {
    judgment: Judgment;
    attempts: number;
    limits: Limits;
    stalled: number;
    tampered: boolean;
    unknownVerifications?: number;
}): Decision;
export {};
