import { z } from 'zod';
export declare const VerificationSchema: z.ZodObject<{
    id: z.core.$ZodBranded<z.ZodString, "RunId", "out">;
    taskId: z.core.$ZodBranded<z.ZodString, "TaskId", "out">;
    checkpoint: z.ZodString;
    createdAt: z.ZodNumber;
    baseline: z.ZodArray<z.ZodObject<{
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
    }, z.core.$strict>>;
    current: z.ZodArray<z.ZodObject<{
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
    }, z.core.$strict>>;
    judgment: z.ZodObject<{
        verdict: z.ZodEnum<{
            UNKNOWN: "UNKNOWN";
            PASS: "PASS";
            FAIL: "FAIL";
            INSUFFICIENT_EVIDENCE: "INSUFFICIENT_EVIDENCE";
            NOT_SCORABLE: "NOT_SCORABLE";
        }>;
        reasons: z.ZodArray<z.ZodString>;
        progress: z.ZodEnum<{
            unknown: "unknown";
            neutral: "neutral";
            improved: "improved";
            unchanged: "unchanged";
            regressed: "regressed";
        }>;
    }, z.core.$strict>;
    decision: z.ZodUnion<readonly [z.ZodObject<{
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
}, z.core.$strict>;
export type Verification = z.infer<typeof VerificationSchema>;
export declare const DecisionChoiceSchema: z.ZodEnum<{
    "pause-goal": "pause-goal";
    "resume-goal": "resume-goal";
    abandon: "abandon";
    "change-direction": "change-direction";
    verify: "verify";
    rollback: "rollback";
    retry: "retry";
    accept: "accept";
    "view-diff": "view-diff";
}>;
export type DecisionChoice = z.infer<typeof DecisionChoiceSchema>;
