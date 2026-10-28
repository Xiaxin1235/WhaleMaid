import type { Context } from '@deepseek-ai/cordis';
import type { CompanionMemory } from './memory.js';
import type { CompanionActions } from './actions.js';
import type { CompanionRecall } from './recall.js';
import type { CompanionDailyBrief } from './daily-brief.js';
import type { Locale, Notification, NotificationFacts, TranscriptPage } from '#whalemaid/core';
import type { WhaleStore } from '../store/index.js';
declare module '@deepseek-ai/cordis' {
    interface Context {
        whaledotCompanion: CompanionApi;
    }
}
/** The agent preset whose sessions are the companion; C08 recognises the session by this id. */
export declare const COMPANION_PRESET = "whaledot-companion";
export interface CompanionSettings {
    personaPath?: string | undefined;
    shareSessionTitles: boolean;
    readSessionContent: boolean;
    excludedSessions: readonly string[];
}
/** Companion facts and human-confirmed memory; every result is data, never authority. */
export interface CompanionApi {
    brief?: CompanionDailyBrief | undefined;
    recall?: CompanionRecall | undefined;
    actions?: CompanionActions | undefined;
    memory?: CompanionMemory | undefined;
    persona(): string;
    goalsOverview(): GoalOverview[];
    pendingDecisions(): PendingDecision[];
    goalDetail(goalId: string): GoalDetail | undefined;
    recentSessions(signal?: AbortSignal): Promise<RecentSessions>;
    readSession(sessionId: string, beforeSeq?: number, signal?: AbortSignal): Promise<SessionRead>;
}
export interface GoalOverview {
    id: string;
    title: string;
    status: string;
    autopilot: boolean;
    tasksDone: number;
    tasksTotal: number;
    lastVerdict?: string;
    pendingDecisions: number;
}
export interface PendingDecision {
    goal: string;
    header: string;
    question: string;
    options: string[];
    where: string;
}
export interface GoalDetail {
    projectMemories?: string;
    id: string;
    title: string;
    objective: string;
    expectedOutcome: string;
    status: string;
    autopilot: boolean;
    scope?: {
        permission: string;
        allowedPaths: string[];
        verifyCommands: string[];
    };
    tasks: {
        title: string;
        kind: string;
        state: string;
        failure?: string;
    }[];
    recentVerdicts: {
        task: string;
        verdict: string;
        reasons: string[];
    }[];
    lastCheckpoint?: string;
    userNotes: string[];
}
export type RecentSessions = {
    titlesShared: true;
    sessions: {
        id: string;
        title: string;
        status: string;
        lastActive: string;
    }[];
} | {
    titlesShared: false;
    total: number;
    running: number;
    idle: number;
};
export type SessionRead = {
    ok: true;
    title?: string;
    page: TranscriptPage;
} | {
    ok: false;
    reason: string;
};
/** Host wall-clock time with its UTC offset, e.g. `2026-10-23 07:57 (UTC-07:00)`; models misread bare UTC. */
export declare function localTime(ms: number): string;
/** Builds the companion's read model from WhaleMaid's store and DSH's public session controller. */
export declare class CompanionService implements CompanionApi {
    private readonly ctx;
    private readonly store;
    private readonly deps;
    brief: CompanionDailyBrief | undefined;
    recall: CompanionRecall | undefined;
    actions: CompanionActions | undefined;
    memory: CompanionMemory | undefined;
    private personaText;
    private readonly titles;
    constructor(ctx: Context, store: WhaleStore, deps: {
        locale: () => Locale;
        settings: () => CompanionSettings;
        facts: (n: Notification) => NotificationFacts;
        companionSessionId: () => string | undefined;
        ownedSessions: () => ReadonlySet<string>;
        log: (message: string, error?: unknown) => void;
    });
    private personaKey;
    /** Load the persona once per locale/setting change; fall back to the bundled text. */
    loadPersona(): Promise<void>;
    persona(): string;
    goalsOverview(): GoalOverview[];
    pendingDecisions(): PendingDecision[];
    goalDetail(goalId: string): GoalDetail | undefined;
    recentSessions(signal?: AbortSignal): Promise<RecentSessions>;
    readSession(sessionId: string, beforeSeq?: number, signal?: AbortSignal): Promise<SessionRead>;
    private openDecisions;
    private controller;
    /** The companion's own session and WhaleMaid run/inbox sessions are never listed or read. */
    private hidden;
    private excluded;
    private title;
}
