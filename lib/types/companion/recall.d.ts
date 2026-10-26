import type { Locale, TranscriptEvent } from '#whalemaid/core';
import type { WhaleStore } from '../store/index.js';
import type { DraftModel } from '../goal-intake/model.js';
import type { MemoryExecution } from './memory.js';
export interface RecallSettings {
    enabled: boolean;
    summarize: boolean;
}
export interface RecallDependencies {
    settings(): RecallSettings;
    locale(): Locale;
    sessionIds(): string[];
    currentSession(): string | undefined;
    owns(id: string): boolean;
    read(id: string, signal: AbortSignal): Promise<readonly TranscriptEvent[]>;
    log(message: string): void;
    now?(): number;
    id?(): string;
}
/** Durable automatic recollections. No write path reaches confirmed memory or project actions. */
export declare class CompanionRecall {
    readonly store: WhaleStore;
    private readonly model;
    readonly deps: RecallDependencies;
    private readonly lifetime;
    private readonly pending;
    private timer;
    private unwatch;
    constructor(store: WhaleStore, model: DraftModel, deps: RecallDependencies);
    private now;
    private state;
    settings(): RecallSettings;
    block(): string;
    search(raw: unknown, exec: MemoryExecution): {
        items: {
            id: string;
            kind: import("#whalemaid/core").CompanionJournal["kind"];
            date: string;
            text: string;
        }[];
        total: number;
        truncated: boolean;
    } | {
        disabled: boolean;
        message: string;
    };
    panelList(): {
        settings: RecallSettings;
        items: ({
            kind: "conversation";
            sessionId: string;
            fromSeq: number;
            toSeq: number;
            id: string;
            text: string;
            createdAt: number;
            status: "active" | "deleted";
        } | {
            kind: "experience";
            refs: string[];
            id: string;
            text: string;
            createdAt: number;
            status: "active" | "deleted";
            sessionId?: string | undefined;
        })[];
        calls7d: number;
        characters: number;
    };
    /** Forget existing material in every owned conversation, including answers that quoted a deleted recall. Future messages remain eligible. */
    remove(id?: string): Promise<void>;
    /** Startup catches unsummarized owned conversations; switching is observed without changing creation. */
    start(): void;
    private observe;
    /** A final turn must be idle for 30 minutes; an unfinished turn never qualifies. */
    idle(): Promise<void>;
    summarize(id: string, idleOnly?: boolean): Promise<void>;
    private generate;
    private append;
    private experiences;
    /** Missing action declines and direct-memory outcomes are available only at the exact tool return. */
    toolOutcome(kind: 'action' | 'memory', input: unknown, result: unknown, sessionId: string, callId: string): void;
    private recordToolOutcome;
    dispose(): Promise<void>;
}
