import { z } from 'zod';
import type { Locale } from '../i18n/index.js';
/** Shared refusal check; a redacted substitute must never be saved as the original. */
export declare function containsMemorySecret(value: string): boolean;
/** Validate content before confirmation and again before persistence; never save a redacted substitute. */
export declare function validateMemoryText(text: string): {
    ok: true;
    text: string;
} | {
    ok: false;
    reason: string;
};
export declare const MemoryTextSchema: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
export declare const ProjectKeySchema: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
export declare const MemoryScopeSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"personal">;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"project">;
    projectKey: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
}, z.core.$strict>], "kind">;
export declare const MemoryKindSchema: z.ZodEnum<{
    fact: "fact";
    preference: "preference";
    decision: "decision";
    constraint: "constraint";
}>;
export declare const MemorySchema: z.ZodObject<{
    id: z.ZodString;
    scope: z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"personal">;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"project">;
        projectKey: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
    }, z.core.$strict>], "kind">;
    kind: z.ZodEnum<{
        fact: "fact";
        preference: "preference";
        decision: "decision";
        constraint: "constraint";
    }>;
    text: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
    source: z.ZodObject<{
        via: z.ZodEnum<{
            companion: "companion";
            panel: "panel";
        }>;
        sessionId: z.ZodOptional<z.ZodString>;
        seq: z.ZodOptional<z.ZodInt>;
    }, z.core.$strict>;
    confirmedAt: z.ZodInt;
    createdAt: z.ZodInt;
    updatedAt: z.ZodInt;
    status: z.ZodEnum<{
        active: "active";
        archived: "archived";
    }>;
    supersedes: z.ZodOptional<z.ZodString>;
    version: z.ZodInt;
}, z.core.$strict>;
export type Memory = z.infer<typeof MemorySchema>;
export type MemoryScope = z.infer<typeof MemoryScopeSchema>;
/** A project follows the goal's first explicitly allowed authorization path. */
export declare function projectKeyForGoal(goal: {
    scopeId?: string | undefined;
}, scope?: {
    id: string;
    allowedPaths: readonly string[];
}): string | undefined;
/** Canonical storage and retrieval identity for a confirmed memory scope. */
export declare function memoryScopeKey(scope: MemoryScope): string;
/** Enforce the active cap for insert, restore and replacement alike. */
export declare function canActivateMemory(rows: readonly Memory[], candidate: Memory, replacing?: readonly string[]): boolean;
/** Stable bytes for an unchanged set, bounded by code units; select recent entries then order by id. */
export declare function renderMemoryBlock(memories: readonly Memory[], locale: Locale, maxChars?: number): string;
/** Bounded literal retrieval with explicit coverage and age; no semantic guesses. */
export declare function searchMemories(rows: readonly Memory[], scope: MemoryScope, query: string | undefined, now: number, references?: Record<string, number>): {
    items: {
        id: string;
        kind: Memory["kind"];
        text: string;
        confirmedAt: number;
        updatedAt: number;
        stale: boolean;
    }[];
    total: number;
    truncated: boolean;
};
