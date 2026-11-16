import { z } from 'zod';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { Context } from '@deepseek-ai/cordis';
import type { AskUserQuestionItem, AskUserQuestionAnswer } from '@deepseek-ai/dsh-user-questions';
import type { Memory, MemoryScope, Locale } from '#whalemaid/core';
import type { WhaleStore } from '../store/index.js';
export declare const MemoryQuerySchema: z.ZodObject<{
    scope: z.ZodEnum<{
        personal: "personal";
        project: "project";
    }>;
    goalId: z.ZodOptional<z.ZodString>;
    path: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>>;
    query: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const MemoryProposeSchema: z.ZodObject<{
    scope: z.ZodEnum<{
        personal: "personal";
        project: "project";
    }>;
    goalId: z.ZodOptional<z.ZodString>;
    path: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>>;
    query: z.ZodOptional<z.ZodNever>;
    kind: z.ZodEnum<{
        fact: "fact";
        preference: "preference";
        decision: "decision";
        constraint: "constraint";
    }>;
    text: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
    replaces: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const MemoryForgetSchema: z.ZodObject<{
    id: z.ZodString;
    reason: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export interface MemorySettings {
    enabled: boolean;
    suggest: boolean;
    maxChars: number;
    draftProjectLessons: boolean;
}
export interface MemoryExecution {
    agent?: Agent;
    signal: AbortSignal;
}
export interface MemoryDependencies {
    locale(): Locale;
    settings(): MemorySettings;
    owns(id: string): boolean;
    ask(agent: Agent, question: AskUserQuestionItem, signal: AbortSignal): Promise<AskUserQuestionAnswer>;
    now?(): number;
    id?(): string;
    timeoutMs?: number;
}
/** Literal review content: Markdown must not swallow Windows path separators or reinterpret text. */
export declare function memoryReview(text: string): string;
/** Confirmation lives here, outside model arguments; a model never supplies a consent flag. */
export declare class CompanionMemory {
    readonly store: WhaleStore;
    readonly deps: MemoryDependencies;
    constructor(store: WhaleStore, deps: MemoryDependencies);
    now(): number;
    settings(): MemorySettings;
    block(): string;
    guidance(): string;
    scope(input: z.infer<typeof MemoryQuerySchema>): MemoryScope;
    countCall(): void;
    list(raw: unknown, exec: MemoryExecution): {
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
    } | {
        disabled: boolean;
        message: string;
    };
    propose(raw: unknown, exec: MemoryExecution): Promise<{
        status: string;
        message: string;
        id?: never;
    } | {
        status: string;
        message?: never;
        id?: never;
    } | {
        status: string;
        id: string;
        message?: never;
    }>;
    forget(raw: unknown, exec: MemoryExecution): Promise<{
        status: string;
        message: string;
    } | {
        status: string;
        message?: never;
    }>;
    /** A synchronous transaction atomically archives exactly the versions the human reviewed. */
    save(scope: MemoryScope, kind: Memory['kind'], text: string, source: Memory['source'], replaces?: Memory[]): {
        id: string;
        scope: {
            kind: "personal";
        } | {
            kind: "project";
            projectKey: string;
        };
        kind: "decision" | "fact" | "preference" | "constraint";
        text: string;
        source: {
            via: "companion" | "panel";
            sessionId?: string | undefined;
            seq?: number | undefined;
        };
        confirmedAt: number;
        createdAt: number;
        updatedAt: number;
        status: "active" | "archived";
        version: number;
        supersedes?: string | undefined;
    };
    update(id: string, version: number, patch: {
        text?: string;
        status?: Memory['status'];
    }, via?: 'panel' | 'companion'): {
        text: string;
        source: {
            via: "companion" | "panel";
            sessionId?: string | undefined;
            seq?: number | undefined;
        };
        confirmedAt: number;
        updatedAt: number;
        version: number;
        status: "active" | "archived";
        id: string;
        scope: {
            kind: "personal";
        } | {
            kind: "project";
            projectKey: string;
        };
        kind: "decision" | "fact" | "preference" | "constraint";
        createdAt: number;
        supersedes?: string | undefined;
    };
    panelList(includeArchived?: boolean): {
        memories: {
            stale: boolean;
            id: string;
            scope: {
                kind: "personal";
            } | {
                kind: "project";
                projectKey: string;
            };
            kind: "decision" | "fact" | "preference" | "constraint";
            text: string;
            source: {
                via: "companion" | "panel";
                sessionId?: string | undefined;
                seq?: number | undefined;
            };
            confirmedAt: number;
            createdAt: number;
            updatedAt: number;
            status: "active" | "archived";
            version: number;
            supersedes?: string | undefined;
        }[];
        characters: number;
        estimatedTokens: number;
        calls7d: number;
        settings: MemorySettings;
    };
    export(format: 'markdown' | 'json'): {
        content: string;
        filename: string;
    };
    private admit;
    confirm(exec: MemoryExecution, question: AskUserQuestionItem): Promise<AskUserQuestionAnswer | undefined>;
}
/** The agent comes from ToolExecution, never a session id supplied by the model. */
export declare function memoryQuestionAdapter(ctx: Context): MemoryDependencies['ask'];
