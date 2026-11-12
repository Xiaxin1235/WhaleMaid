import { z } from 'zod';
import type { ProjectGoal } from '../model/goal.js';
import type { AuthorizationScope } from '../model/authorization.js';
import type { Task } from '../model/task.js';
import type { Clock, IdGen, Result } from '../infra.js';
import type { Locale } from '../i18n/index.js';
export declare const PlannerResponseSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    status: z.ZodLiteral<"continue">;
    tasks: z.ZodArray<z.ZodObject<{
        title: z.ZodString;
        kind: z.ZodEnum<{
            analyze: "analyze";
            edit: "edit";
            test: "test";
            doc: "doc";
            research: "research";
        }>;
        dependsOn: z.ZodDefault<z.ZodArray<z.ZodUnion<readonly [z.core.$ZodBranded<z.ZodString, "TaskId", "out">, z.ZodInt]>>>;
    }, z.core.$strict>>;
}, z.core.$strict>, z.ZodObject<{
    status: z.ZodLiteral<"complete">;
    reason: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    status: z.ZodLiteral<"need-user">;
    question: z.ZodString;
}, z.core.$strict>], "status">;
export type PlannerResponse = z.infer<typeof PlannerResponseSchema>;
export interface PlannerHistory {
    commands?: {
        command: string;
        status: string;
        counts?: {
            passed: number;
            failed: number;
            skipped: number;
        };
    }[];
    title: string;
    kind: string;
    state: string;
    verdict: string;
    reasons: string[];
    counts: {
        passed: number;
        failed: number;
        skipped: number;
    }[];
    failureSummary: string;
}
/** Supply structured facts only; project file contents and model completion prose are excluded. */
export declare function buildPlannerPrompt(goal: ProjectGoal, scopeSummary: Pick<AuthorizationScope, 'permissionPreset' | 'allowedActions' | 'allowedPaths' | 'protectedPaths' | 'protectedNames' | 'verifyCommands' | 'limits'>, history: (PlannerHistory & {
    id: string;
})[], locale: Locale, userNotes?: readonly string[]): string;
/** Parse one JSON fence and strictly validate before any proposal can enter the ledger. */
export declare function parsePlannerResponse(text: string): Result<PlannerResponse, {
    code: 'invalid-planner-response';
}>;
/** Convert dependency references and apply the existing stable-key/DAG merge and write-scope guard. */
export declare function mergePlannerTasks(goal: ProjectGoal, scope: AuthorizationScope, existing: Task[], proposal: Extract<PlannerResponse, {
    status: 'continue';
}>, deps: {
    clock: Clock;
    idGen: IdGen;
}): {
    added: Task[];
    rejected: {
        title: string;
        reason: string;
    }[];
};
