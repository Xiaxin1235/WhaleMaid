import { z } from 'zod';
export declare const I1_DETECTORS: readonly ["repeatedFailure", "stallWarning", "noAcceptance", "budgetBurn", "pendingBacklog", "idleGoal", "leftovers"];
export declare const DETECTORS: readonly ["repeatedFailure", "stallWarning", "noAcceptance", "budgetBurn", "pendingBacklog", "idleGoal", "leftovers", "radarDependency", "radarCI", "radarConflict", "radarRelated"];
export declare const DetectorSchema: z.ZodEnum<{
    radarDependency: "radarDependency";
    radarCI: "radarCI";
    radarConflict: "radarConflict";
    radarRelated: "radarRelated";
    repeatedFailure: "repeatedFailure";
    stallWarning: "stallWarning";
    noAcceptance: "noAcceptance";
    budgetBurn: "budgetBurn";
    pendingBacklog: "pendingBacklog";
    idleGoal: "idleGoal";
    leftovers: "leftovers";
}>;
export type DetectorId = z.infer<typeof DetectorSchema>;
export declare const LEVELS: readonly ["L0", "L1", "L2", "L3"];
export declare const InitiativeLevelSchema: z.ZodEnum<{
    L0: "L0";
    L1: "L1";
    L2: "L2";
    L3: "L3";
}>;
export type InitiativeLevel = z.infer<typeof InitiativeLevelSchema>;
export declare const DETECTOR_LEVELS: {
    repeatedFailure: "L2";
    stallWarning: "L2";
    noAcceptance: "L1";
    budgetBurn: "L3";
    pendingBacklog: "L2";
    idleGoal: "L1";
    leftovers: "L1";
    radarDependency: "L2";
    radarCI: "L2";
    radarConflict: "L3";
    radarRelated: "L1";
};
export declare const INITIATIVE_DAY = 86400000;
export declare const INITIATIVE_TTL: number;
export declare const INITIATIVE_NOTIFICATION_KIND = "initiative";
export declare const INITIATIVE_HOUR = 3600000;
export declare const INITIATIVE_CARD_CAPACITY = 64;
export declare const InitiativeLimitsSchema: z.ZodObject<{
    cardIntervalHours: z.ZodInt;
    cooldownDays: z.ZodInt;
}, z.core.$strict>;
export declare const DEFAULT_INITIATIVE_LIMITS: {
    readonly cardIntervalHours: 4;
    readonly cooldownDays: 7;
};
export declare const DetectorSettingsSchema: z.ZodObject<{
    enabled: z.ZodBoolean;
    maxLevel: z.ZodEnum<{
        L0: "L0";
        L1: "L1";
        L2: "L2";
        L3: "L3";
    }>;
}, z.core.$strict>;
export declare const InitiativeSettingsSchema: z.ZodObject<{
    enabled: z.ZodBoolean;
    detectors: z.ZodRecord<z.ZodEnum<{
        radarDependency: "radarDependency";
        radarCI: "radarCI";
        radarConflict: "radarConflict";
        radarRelated: "radarRelated";
        repeatedFailure: "repeatedFailure";
        stallWarning: "stallWarning";
        noAcceptance: "noAcceptance";
        budgetBurn: "budgetBurn";
        pendingBacklog: "pendingBacklog";
        idleGoal: "idleGoal";
        leftovers: "leftovers";
    }>, z.ZodObject<{
        enabled: z.ZodBoolean;
        maxLevel: z.ZodEnum<{
            L0: "L0";
            L1: "L1";
            L2: "L2";
            L3: "L3";
        }>;
    }, z.core.$strict>>;
    channels: z.ZodObject<{
        brief: z.ZodBoolean;
        cards: z.ZodBoolean;
        asks: z.ZodBoolean;
    }, z.core.$strict>;
    limits: z.ZodObject<{
        cardIntervalHours: z.ZodInt;
        cooldownDays: z.ZodInt;
    }, z.core.$strict>;
    companion: z.ZodObject<{
        journal: z.ZodBoolean;
    }, z.core.$strict>;
}, z.core.$strict>;
export type InitiativeSettings = z.infer<typeof InitiativeSettingsSchema>;
export declare function defaultInitiativeSettings(): InitiativeSettings;
export declare const OpportunityEvidenceSchema: z.ZodObject<{
    kind: z.ZodEnum<{
        verification: "verification";
        task: "task";
        goal: "goal";
        run: "run";
        notification: "notification";
        radar: "radar";
    }>;
    id: z.ZodString;
    commandIndex: z.ZodOptional<z.ZodInt>;
    hash: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export type OpportunityEvidence = z.infer<typeof OpportunityEvidenceSchema>;
export declare const OpportunitySchema: z.ZodObject<{
    id: z.ZodString;
    detector: z.ZodEnum<{
        radarDependency: "radarDependency";
        radarCI: "radarCI";
        radarConflict: "radarConflict";
        radarRelated: "radarRelated";
        repeatedFailure: "repeatedFailure";
        stallWarning: "stallWarning";
        noAcceptance: "noAcceptance";
        budgetBurn: "budgetBurn";
        pendingBacklog: "pendingBacklog";
        idleGoal: "idleGoal";
        leftovers: "leftovers";
    }>;
    subject: z.ZodObject<{
        goalId: z.ZodOptional<z.core.$ZodBranded<z.ZodString, "GoalId", "out">>;
        taskId: z.ZodOptional<z.core.$ZodBranded<z.ZodString, "TaskId", "out">>;
    }, z.core.$strict>;
    dedupeKey: z.ZodString;
    evidence: z.ZodArray<z.ZodObject<{
        kind: z.ZodEnum<{
            verification: "verification";
            task: "task";
            goal: "goal";
            run: "run";
            notification: "notification";
            radar: "radar";
        }>;
        id: z.ZodString;
        commandIndex: z.ZodOptional<z.ZodInt>;
        hash: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    summary: z.ZodString;
    score: z.ZodNumber;
    level: z.ZodEnum<{
        L0: "L0";
        L1: "L1";
        L2: "L2";
        L3: "L3";
    }>;
    actions: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
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
    }, z.core.$strict>], "kind">>;
    status: z.ZodEnum<{
        open: "open";
        delivered: "delivered";
        accepted: "accepted";
        snoozed: "snoozed";
        dismissed: "dismissed";
        muted: "muted";
        expired: "expired";
    }>;
    createdAt: z.ZodNumber;
    expiresAt: z.ZodNumber;
    outcomeAt: z.ZodOptional<z.ZodNumber>;
    notificationId: z.ZodOptional<z.ZodString>;
    deliveredAt: z.ZodOptional<z.ZodNumber>;
    falsePositive: z.ZodOptional<z.ZodBoolean>;
    neutral: z.ZodOptional<z.ZodBoolean>;
    progressAt: z.ZodOptional<z.ZodNumber>;
    progressClosed: z.ZodOptional<z.ZodBoolean>;
    progressGoal: z.ZodOptional<z.core.$ZodBranded<z.ZodString, "GoalId", "out">>;
    progressStatus: z.ZodOptional<z.ZodString>;
    awaitsDraft: z.ZodOptional<z.ZodBoolean>;
    draft: z.ZodOptional<z.ZodObject<{
        id: z.ZodString;
        projectRoot: z.ZodString;
        content: z.ZodObject<{
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
    }, z.core.$strict>>;
}, z.core.$strict>;
export type Opportunity = z.infer<typeof OpportunitySchema>;
export type OpportunityCandidate = Pick<Opportunity, 'detector' | 'subject' | 'dedupeKey' | 'evidence' | 'summary' | 'score'>;
export declare function resolveLevel(candidate: Pick<OpportunityCandidate, 'detector' | 'score'>, settings: InitiativeSettings): InitiativeLevel;
export declare const InitiativeChoiceSchema: z.ZodEnum<{
    evidence: "evidence";
    pause: "pause";
    "draft-diagnosis": "draft-diagnosis";
    "draft-followup": "draft-followup";
    "split-note": "split-note";
    "open-goal": "open-goal";
    "open-decision": "open-decision";
    "idle-pause": "idle-pause";
    "idle-keep": "idle-keep";
    snooze: "snooze";
    dismiss: "dismiss";
    mute: "mute";
    inaccurate: "inaccurate";
}>;
export type InitiativeChoice = z.infer<typeof InitiativeChoiceSchema>;
export declare const INITIATIVE_ADOPTIONS: {
    readonly repeatedFailure: readonly ["draft-diagnosis", "pause"];
    readonly stallWarning: readonly ["split-note", "pause"];
    readonly noAcceptance: readonly ["open-goal"];
    readonly budgetBurn: readonly ["pause", "open-goal"];
    readonly pendingBacklog: readonly ["open-decision"];
    readonly idleGoal: readonly ["idle-pause", "idle-keep"];
    readonly leftovers: readonly ["draft-followup"];
    readonly radarDependency: readonly ["draft-diagnosis", "split-note"];
    readonly radarCI: readonly ["pause", "draft-diagnosis"];
    readonly radarConflict: readonly ["idle-keep", "pause", "evidence"];
    readonly radarRelated: readonly [];
};
export declare const INITIATIVE_FEEDBACK: readonly ["snooze", "dismiss", "mute", "inaccurate", "evidence"];
export declare function initiativeOptions(rows: readonly Opportunity[]): {
    choice: "evidence" | "pause" | "draft-diagnosis" | "draft-followup" | "split-note" | "open-goal" | "open-decision" | "idle-pause" | "idle-keep" | "snooze" | "dismiss" | "mute" | "inaccurate";
    opportunityId: string;
}[];
export declare const InitiativeMetricsSchema: z.ZodObject<{
    delivered: z.ZodInt;
    accepted: z.ZodInt;
    interruptions: z.ZodInt;
    progressed: z.ZodInt;
    inaccurate: z.ZodInt;
    modelCost: z.ZodLiteral<0>;
}, z.core.$strict>;
export declare function initiativeMetrics(rows: readonly Opportunity[], now: number, days: number): {
    delivered: number;
    accepted: number;
    interruptions: number;
    progressed: number;
    inaccurate: number;
    modelCost: 0;
};
export declare const InitiativeAdjustmentSchema: z.ZodObject<{
    at: z.ZodNumber;
    level: z.ZodEnum<{
        L0: "L0";
        L1: "L1";
        L2: "L2";
        L3: "L3";
    }>;
    minimumScore: z.ZodNumber;
    delivered: z.ZodInt;
    interruptions: z.ZodInt;
    accepted: z.ZodInt;
}, z.core.$strict>;
export type InitiativeAdjustment = z.infer<typeof InitiativeAdjustmentSchema>;
/** One explainable change per 30-day sample; restoring starts a fresh sample. */
export declare function learnInitiative(rows: readonly Opportunity[], now: number, level: InitiativeLevel, since: number): {
    at: number;
    level: "L0" | "L1" | "L2" | "L3";
    minimumScore: number;
    delivered: number;
    interruptions: number;
    accepted: number;
} | undefined;
/** Opportunities in the next card for one goal. L3 never waits behind L2's interval. */
export declare function initiativeBatch(rows: readonly Opportunity[], now: number, lastCard: number, hours: number): {
    id: string;
    detector: "radarDependency" | "radarCI" | "radarConflict" | "radarRelated" | "repeatedFailure" | "stallWarning" | "noAcceptance" | "budgetBurn" | "pendingBacklog" | "idleGoal" | "leftovers";
    subject: {
        goalId?: (string & z.core.$brand<"GoalId">) | undefined;
        taskId?: (string & z.core.$brand<"TaskId">) | undefined;
    };
    dedupeKey: string;
    evidence: {
        kind: "verification" | "task" | "goal" | "run" | "notification" | "radar";
        id: string;
        commandIndex?: number | undefined;
        hash?: string | undefined;
    }[];
    summary: string;
    score: number;
    level: "L0" | "L1" | "L2" | "L3";
    actions: ({
        kind: "draft-goal";
        text: string;
        projectRoot: string;
    } | {
        kind: "start-work";
        projectRoot: string;
        task: string;
    } | {
        kind: "goal-pause";
        goalId: string & z.core.$brand<"GoalId">;
        paused: boolean;
    } | {
        kind: "autopilot";
        goalId: string & z.core.$brand<"GoalId">;
        enabled: boolean;
    } | {
        kind: "global-pause";
        paused: boolean;
    } | {
        kind: "goal-note";
        goalId: string & z.core.$brand<"GoalId">;
        text: string;
    })[];
    status: "open" | "delivered" | "accepted" | "snoozed" | "dismissed" | "muted" | "expired";
    createdAt: number;
    expiresAt: number;
    outcomeAt?: number | undefined;
    notificationId?: string | undefined;
    deliveredAt?: number | undefined;
    falsePositive?: boolean | undefined;
    neutral?: boolean | undefined;
    progressAt?: number | undefined;
    progressClosed?: boolean | undefined;
    progressGoal?: (string & z.core.$brand<"GoalId">) | undefined;
    progressStatus?: string | undefined;
    awaitsDraft?: boolean | undefined;
    draft?: {
        id: string;
        projectRoot: string;
        content: {
            proposedVerifyCommands: string[];
            proposedProtectedPaths: string[];
            title: string;
            objective: string;
            expectedOutcome: string;
            acceptance: string[];
            stopConditions: string[];
            mode: "suggest" | "autonomous" | "high";
            initialTasks: {
                title: string;
                kind: "analyze" | "edit" | "test" | "doc" | "research";
                dependsOnIndex: number[];
            }[];
        };
    } | undefined;
}[];
export declare function initiativeInCooldown(row: Opportunity, previous: readonly Opportunity[], now: number, days: number): boolean;
/** A future delivery can use this factor without changing an already-open finding's score. */
export declare function opportunityNovelty(now: number, previous?: {
    cooldownUntil?: number;
    snoozedUntil?: number;
}): number;
