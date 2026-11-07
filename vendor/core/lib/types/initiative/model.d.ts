import { z } from 'zod';
export declare const DETECTORS: readonly ["repeatedFailure", "stallWarning", "noAcceptance", "budgetBurn", "pendingBacklog", "idleGoal", "leftovers"];
export declare const DetectorSchema: z.ZodEnum<{
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
};
export declare const INITIATIVE_DAY = 86400000;
export declare const INITIATIVE_TTL: number;
export declare const INITIATIVE_NOTIFICATION_KIND = "initiative";
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
    }>;
    id: z.ZodString;
    commandIndex: z.ZodOptional<z.ZodInt>;
    hash: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export type OpportunityEvidence = z.infer<typeof OpportunityEvidenceSchema>;
export declare const OpportunitySchema: z.ZodObject<{
    id: z.ZodString;
    detector: z.ZodEnum<{
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
        delivered: "delivered";
        muted: "muted";
        expired: "expired";
        snoozed: "snoozed";
        open: "open";
        accepted: "accepted";
        dismissed: "dismissed";
    }>;
    createdAt: z.ZodNumber;
    expiresAt: z.ZodNumber;
    outcomeAt: z.ZodOptional<z.ZodNumber>;
}, z.core.$strict>;
export type Opportunity = z.infer<typeof OpportunitySchema>;
export type OpportunityCandidate = Pick<Opportunity, 'detector' | 'subject' | 'dedupeKey' | 'evidence' | 'summary' | 'score'>;
export declare function resolveLevel(candidate: Pick<OpportunityCandidate, 'detector' | 'score'>, settings: InitiativeSettings): InitiativeLevel;
/** A future delivery can use this factor without changing an already-open finding's score. */
export declare function opportunityNovelty(now: number, previous?: {
    cooldownUntil?: number;
    snoozedUntil?: number;
}): number;
