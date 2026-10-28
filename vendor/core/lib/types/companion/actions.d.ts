import { z } from 'zod';
import type { ProjectGoal } from '../model/goal.js';
import type { AuthorizationScope } from '../model/authorization.js';
import type { Locale } from '../i18n/index.js';
export declare const CompanionNoteSchema: z.ZodString;
export declare const ProposeGoalSchema: z.ZodObject<{
    kind: z.ZodLiteral<"draft-goal">;
    text: z.ZodString;
    projectRoot: z.ZodString;
}, z.core.$strict>;
/** Hand a task to a new ordinary Harness conversation in the project, so she stays free to chat. */
export declare const ProposeWorkSchema: z.ZodObject<{
    kind: z.ZodLiteral<"start-work">;
    projectRoot: z.ZodString;
    task: z.ZodString;
}, z.core.$strict>;
export declare const ProposeGoalPauseSchema: z.ZodObject<{
    kind: z.ZodLiteral<"goal-pause">;
    goalId: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
    paused: z.ZodBoolean;
}, z.core.$strict>;
export declare const ProposeAutopilotSchema: z.ZodObject<{
    kind: z.ZodLiteral<"autopilot">;
    goalId: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
    enabled: z.ZodBoolean;
}, z.core.$strict>;
export declare const ProposeGlobalPauseSchema: z.ZodObject<{
    kind: z.ZodLiteral<"global-pause">;
    paused: z.ZodBoolean;
}, z.core.$strict>;
export declare const ProposeGoalNoteSchema: z.ZodObject<{
    kind: z.ZodLiteral<"goal-note">;
    goalId: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
    text: z.ZodString;
}, z.core.$strict>;
export declare const CompanionActionSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"draft-goal">;
    text: z.ZodString;
    projectRoot: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"goal-pause">;
    goalId: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
    paused: z.ZodBoolean;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"autopilot">;
    goalId: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
    enabled: z.ZodBoolean;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"global-pause">;
    paused: z.ZodBoolean;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"goal-note">;
    goalId: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
    text: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"start-work">;
    projectRoot: z.ZodString;
    task: z.ZodString;
}, z.core.$strict>], "kind">;
export type CompanionAction = z.infer<typeof CompanionActionSchema>;
export declare const CompanionProposalSchema: z.ZodObject<{
    proposalId: z.ZodString;
    sessionId: z.ZodString;
    createdAt: z.ZodNumber;
    action: z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"draft-goal">;
        text: z.ZodString;
        projectRoot: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"goal-pause">;
        goalId: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
        paused: z.ZodBoolean;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"autopilot">;
        goalId: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
        enabled: z.ZodBoolean;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"global-pause">;
        paused: z.ZodBoolean;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"goal-note">;
        goalId: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
        text: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"start-work">;
        projectRoot: z.ZodString;
        task: z.ZodString;
    }, z.core.$strict>], "kind">;
    version: z.ZodString;
}, z.core.$strict>;
export interface ActionFacts {
    goal?: ProjectGoal | undefined;
    scope?: AuthorizationScope | undefined;
    globalPaused: boolean;
    globalVersion: number;
    notesVersion: string;
    notesCount: number;
}
/** Human copy never dispatches an action. */
export declare const actionCopy: (locale: Locale) => {
    question: string;
    confirm: string;
    decline: string;
    disabled: string;
    changed: string;
    missing: string;
    unchanged: string;
    invalid: string;
    noScope: string;
    pendingLimit: string;
    noEdit: string;
    draft: string;
    draftOnly: string;
    pause: string;
    autopilot: string;
    global: string;
    note: string;
    on: string;
    off: string;
    noteEffect: string;
    pauseEffect: string;
    autoEffect: string;
    globalEffect: string;
    attribution: (time: string) => string;
    work: string;
    workEffect: string;
    workStarted: string;
    drafts: string;
    review: string;
    saved: string;
    declined: string;
    failed: string;
    paths: string;
    permission: string;
    actions: string;
    commands: string;
    protected: string;
    quotas: string;
    runs: string;
    plans: string;
};
/** Detached version token, including monotonic pause revision and current note identities. */
export declare function actionVersion(facts: ActionFacts): string;
/** Labels for management audit rows, independent of stable action identifiers. */
export declare function actionLabel(kind: string, locale: Locale): string;
/** Refuse missing, unchanged or ineligible actions before asking. Authorization comes from host facts. */
export declare function describeAction(action: CompanionAction, facts: ActionFacts, locale: Locale): {
    ok: true;
    detail: string;
} | {
    ok: false;
    reason: string;
};
