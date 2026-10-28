import { z } from 'zod';
/** Generation limits do not change the historical proposal storage schema below. */
export declare const MAX_CONSOLIDATION_SOURCES = 10;
export declare const LessonDraftSchema: z.ZodUnion<readonly [z.ZodObject<{
    skip: z.ZodLiteral<true>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodEnum<{
        decision: "decision";
        constraint: "constraint";
    }>;
    text: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
}, z.core.$strict>]>;
export declare const ConsolidationDraftSchema: z.ZodObject<{
    kind: z.ZodEnum<{
        fact: "fact";
        preference: "preference";
        decision: "decision";
        constraint: "constraint";
    }>;
    text: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
    replaces: z.ZodArray<z.ZodString>;
}, z.core.$strict>;
/** A draft is never a Memory: expiry and resolution cannot grant execution authority. */
export declare const MemoryProposalSchema: z.ZodObject<{
    id: z.ZodString;
    kind: z.ZodLiteral<"memory-proposal">;
    scope: z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"personal">;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"project">;
        projectKey: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
    }, z.core.$strict>], "kind">;
    memoryKind: z.ZodEnum<{
        fact: "fact";
        preference: "preference";
        decision: "decision";
        constraint: "constraint";
    }>;
    text: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
    origin: z.ZodEnum<{
        "project-lesson": "project-lesson";
        consolidation: "consolidation";
    }>;
    goalId: z.ZodOptional<z.core.$ZodBranded<z.ZodString, "GoalId", "out">>;
    trigger: z.ZodOptional<z.ZodEnum<{
        completed: "completed";
        decision: "decision";
        blocked: "blocked";
    }>>;
    replaces: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        version: z.ZodInt;
        text: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
    }, z.core.$strict>>;
    createdAt: z.ZodInt;
    expiresAt: z.ZodInt;
    status: z.ZodEnum<{
        expired: "expired";
        pending: "pending";
        saved: "saved";
        declined: "declined";
    }>;
    resolvedAt: z.ZodOptional<z.ZodInt>;
    memoryId: z.ZodOptional<z.ZodString>;
    version: z.ZodInt;
    notifiedAt: z.ZodOptional<z.ZodInt>;
    delivery: z.ZodOptional<z.ZodEnum<{
        cancelled: "cancelled";
        failed: "failed";
        started: "started";
        answered: "answered";
    }>>;
}, z.core.$strict>;
export type MemoryProposal = z.infer<typeof MemoryProposalSchema>;
export type LessonTrigger = NonNullable<MemoryProposal['trigger']>;
/** Accept only explicit structured outcomes; labels, free text and user notes never become triggers. */
export declare function lessonTrigger(event: {
    kind: 'goal' | 'notification' | 'choice';
    status?: string | undefined;
    reason?: string | undefined;
    action?: string | undefined;
}): LessonTrigger | undefined;
/** Same trigger/goal consumes its allowance before a model request, including a failed request. */
export declare function mayDraftLesson(last: number | undefined, now: number, pending: number, enabled: boolean): boolean;
