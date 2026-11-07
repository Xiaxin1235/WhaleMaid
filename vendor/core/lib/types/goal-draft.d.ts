import { z } from 'zod';
import type { Clock, IdGen, Result } from './infra.js';
import type { Locale } from './i18n/index.js';
export declare const InitialTaskSchema: z.ZodObject<{
    title: z.ZodString;
    kind: z.ZodEnum<{
        analyze: "analyze";
        edit: "edit";
        test: "test";
        doc: "doc";
        research: "research";
    }>;
    dependsOnIndex: z.ZodArray<z.ZodInt>;
}, z.core.$strict>;
export declare const GoalDraftSchema: z.ZodObject<{
    proposedVerifyCommands: z.ZodArray<z.ZodString>;
    proposedProtectedPaths: z.ZodArray<z.ZodString>;
    title: z.ZodString;
    objective: z.ZodString;
    expectedOutcome: z.ZodString;
    acceptance: z.ZodArray<z.ZodString>;
    stopConditions: z.ZodArray<z.ZodString>;
    mode: z.ZodEnum<{
        suggest: "suggest";
        autonomous: "autonomous";
        high: "high";
    }>;
    initialTasks: z.ZodArray<z.ZodObject<{
        title: z.ZodString;
        kind: z.ZodEnum<{
            analyze: "analyze";
            edit: "edit";
            test: "test";
            doc: "doc";
            research: "research";
        }>;
        dependsOnIndex: z.ZodArray<z.ZodInt>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type GoalDraft = z.infer<typeof GoalDraftSchema>;
export declare const IntakeActionSchema: z.ZodEnum<{
    "read-file": "read-file";
    "write-file": "write-file";
    "run-command": "run-command";
    git: "git";
    "continue-goal": "continue-goal";
    "pause-goal": "pause-goal";
    "resume-goal": "resume-goal";
    "open-workbench": "open-workbench";
}>;
export declare const DEFAULT_INTAKE_ACTIONS: readonly ["read-file", "continue-goal", "pause-goal", "resume-goal", "open-workbench"];
export declare const ConfirmedGoalFormSchema: z.ZodObject<{
    draftId: z.ZodOptional<z.ZodString>;
    projectRoot: z.ZodString;
    allowedPaths: z.ZodArray<z.ZodString>;
    protectedPaths: z.ZodArray<z.ZodString>;
    protectedNames: z.ZodDefault<z.ZodArray<z.ZodString>>;
    allowedActions: z.ZodArray<z.ZodEnum<{
        "read-file": "read-file";
        "write-file": "write-file";
        "run-command": "run-command";
        git: "git";
        "continue-goal": "continue-goal";
        "pause-goal": "pause-goal";
        "resume-goal": "resume-goal";
        "open-workbench": "open-workbench";
    }>>;
    permissionPreset: z.ZodEnum<{
        "read-only": "read-only";
        "workspace-write": "workspace-write";
    }>;
    commandMode: z.ZodDefault<z.ZodEnum<{
        confirmed: "confirmed";
        trusted: "trusted";
    }>>;
    trustedConfirmed: z.ZodOptional<z.ZodLiteral<true>>;
    verifyCommands: z.ZodArray<z.ZodString>;
    limits: z.ZodObject<{
        maxFixRounds: z.ZodDefault<z.ZodInt>;
        maxStallRounds: z.ZodDefault<z.ZodInt>;
        maxConcurrentWritePerProject: z.ZodDefault<z.ZodInt>;
        maxChangedFilesPerTask: z.ZodDefault<z.ZodInt>;
        maxRunMinutes: z.ZodDefault<z.ZodNumber>;
        plannerCallsPerDay: z.ZodDefault<z.ZodInt>;
        maxRunsPerDay: z.ZodDefault<z.ZodInt>;
    }, z.core.$strict>;
    limitsExpandedConfirmed: z.ZodBoolean;
    confirm: z.ZodLiteral<true>;
    title: z.ZodString;
    objective: z.ZodString;
    expectedOutcome: z.ZodString;
    acceptance: z.ZodArray<z.ZodString>;
    stopConditions: z.ZodArray<z.ZodString>;
    mode: z.ZodEnum<{
        suggest: "suggest";
        autonomous: "autonomous";
        high: "high";
    }>;
    initialTasks: z.ZodArray<z.ZodObject<{
        title: z.ZodString;
        kind: z.ZodEnum<{
            analyze: "analyze";
            edit: "edit";
            test: "test";
            doc: "doc";
            research: "research";
        }>;
        dependsOnIndex: z.ZodArray<z.ZodInt>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type ConfirmedGoalForm = z.infer<typeof ConfirmedGoalFormSchema>;
export interface DraftError {
    code: 'missing-json-block' | 'invalid-json' | 'invalid-draft';
    reason: string;
}
/** Treat project facts and user input as quoted data; no authority is delegated to model text. */
export declare function buildDraftPrompt(userText: string, locale: Locale, projectFacts: unknown): string;
/** Parse the last JSON fence and return precise validation failures without throwing. */
export declare function parseDraftResponse(response: string): Result<GoalDraft, DraftError>;
/** The confirmed form is authoritative; a model draft only prefilled that form. */
export declare function draftToRecords(_draft: GoalDraft | undefined, input: ConfirmedGoalForm, deps: {
    clock: Clock;
    idGen: IdGen;
}): {
    goal: {
        id: string & z.core.$brand<"GoalId">;
        title: string;
        objective: string;
        expectedOutcome: string;
        acceptance: string[];
        stopConditions: string[];
        mode: "suggest" | "autonomous" | "high";
        projectRoot: string;
        status: "active";
        autopilot: {
            enabled: boolean;
        };
        createdAt: number;
        confirmedAt: number;
        version: number;
    };
    scopeDraft: {
        goalId: string & z.core.$brand<"GoalId">;
        allowedPaths: string[];
        protectedPaths: string[];
        protectedNames: string[];
        allowedActions: ("read-file" | "write-file" | "run-command" | "git" | "continue-goal" | "pause-goal" | "resume-goal" | "open-workbench")[];
        forbiddenActions: never[];
        verifyCommands: string[];
        limits: {
            maxFixRounds: number;
            maxStallRounds: number;
            maxConcurrentWritePerProject: number;
            maxChangedFilesPerTask: number;
            maxRunMinutes: number;
            plannerCallsPerDay: number;
            maxRunsPerDay: number;
        };
        permissionPreset: "read-only" | "workspace-write";
        commandMode: "confirmed" | "trusted";
    };
    tasks: {
        id: string & z.core.$brand<"TaskId">;
        goalId: string & z.core.$brand<"GoalId">;
        key: string;
        title: string;
        kind: "analyze" | "edit" | "test" | "doc" | "research";
        dependsOn: (string & z.core.$brand<"TaskId">)[];
        state: "PENDING" | "READY" | "RUNNING" | "VERIFYING" | "SUCCEEDED" | "WAITING_APPROVAL" | "BLOCKED" | "FAILED" | "UNKNOWN" | "PAUSED" | "CANCELLED";
        acceptance: string[];
        attempts: number;
        createdBy: "user" | "planner";
        createdAt: number;
        version: number;
        failureSummary?: string | undefined;
        unknownVerifications?: number | undefined;
    }[];
    rejected: {
        task: import("./index.js").Task;
        reason: "foreign-goal" | "duplicate" | "dangling-dependency" | "cycle";
    }[];
};
