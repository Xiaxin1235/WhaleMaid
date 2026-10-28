import { z } from 'zod';
import type { MemoryScope, MemoryProposal, LessonTrigger, GoalId } from '#whalemaid/core';
import type { AskUserQuestionItem, AskUserQuestionAnswer } from '@deepseek-ai/dsh-user-questions';
import type { DraftModel } from '../goal-intake/model.js';
import { CompanionMemory } from './memory.js';
export interface ProposalInbox {
    ask(proposal: MemoryProposal, question: AskUserQuestionItem, signal: AbortSignal): Promise<AskUserQuestionAnswer>;
}
/** Event-driven model drafts. Only resolve() after owner UI/human answer creates confirmed content. */
export declare class MemoryDrafts {
    readonly memory: CompanionMemory;
    private readonly model;
    private readonly inbox;
    private readonly log;
    private stopWatch;
    private timer;
    private readonly lifetime;
    private readonly work;
    private readonly pending;
    private readonly seen;
    private readonly consolidating;
    constructor(memory: CompanionMemory, model: DraftModel, inbox: ProposalInbox, log: (message: string, error?: unknown) => void);
    private get store();
    /** Establish a baseline: enabling the feature does not replay historical completed goals. */
    start(): void;
    private track;
    private observe;
    private pendingCount;
    /** Called only from observed structured outcomes; no conversation text enters model facts. */
    draftLesson(goalId: GoalId, trigger: LessonTrigger): Promise<void>;
    /** One consolidation request, bounded by the stored active scope; suggestions do not mutate memories. */
    consolidate(scope: MemoryScope, manual?: boolean): Promise<{
        status: string;
    }>;
    private insert;
    list(): MemoryProposal[];
    /** Panel and inbox resolve the same proposal atomically; subsequent answers return the first outcome. */
    resolve(id: string, choice: 'confirm' | 'decline', text?: string, source?: 'panel' | 'inbox'): {
        id: string;
        kind: "memory-proposal";
        scope: {
            kind: "personal";
        } | {
            kind: "project";
            projectKey: string;
        };
        memoryKind: "decision" | "fact" | "preference" | "constraint";
        text: string;
        origin: "project-lesson" | "consolidation";
        replaces: {
            id: string;
            version: number;
            text: string;
        }[];
        createdAt: number;
        expiresAt: number;
        status: "expired" | "pending" | "saved" | "declined";
        version: number;
        goalId?: (string & z.core.$brand<"GoalId">) | undefined;
        trigger?: "completed" | "blocked" | "decision" | undefined;
        resolvedAt?: number | undefined;
        memoryId?: string | undefined;
        notifiedAt?: number | undefined;
        delivery?: "cancelled" | "failed" | "started" | "answered" | undefined;
    };
    private projection;
    /** Reuse P04 quiet hours, hourly budget and one durable attempt, through the same userQuestions port. */
    deliver(): Promise<void>;
    dispose(): Promise<void>;
}
