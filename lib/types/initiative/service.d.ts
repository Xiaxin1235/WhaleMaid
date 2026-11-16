import type { GoalId, InitiativeSettings, Locale } from '#whalemaid/core';
import type { ScopeService } from '../scope-service.js';
import { type WhaleStore } from '../store/index.js';
import type { InitiativeCards } from './cards.js';
import type { RadarService } from '../radar/service.js';
export declare class InitiativeService {
    private readonly store;
    private readonly scopes;
    private readonly deps;
    private readonly cards?;
    private readonly radar?;
    private readonly pending;
    private readonly tasks;
    private full;
    private lastDay;
    private stopped;
    private unwatch;
    private timer;
    private midnight;
    private running;
    private cardTimer;
    private recoveredCards;
    constructor(store: WhaleStore, scopes: Pick<ScopeService, 'activeScopeFor'>, deps: {
        settings(): InitiativeSettings;
        locale(): Locale;
        log(message: string, error?: unknown): void;
        now?(): number;
    }, cards?: InitiativeCards | undefined, radar?: RadarService | undefined);
    private now;
    start(): void;
    refresh(): void;
    refreshFacts(id: GoalId): void;
    private schedule;
    private scheduleMidnight;
    /** Coalesced jobs yield between goals and keep an unfinished batch queued. */
    scan(): Promise<void>;
    private detect;
    private detectGoal;
    private idleObservation;
    settings(): {
        enabled: boolean;
        detectors: Record<"radarDependency" | "radarCI" | "radarConflict" | "radarRelated" | "repeatedFailure" | "stallWarning" | "noAcceptance" | "budgetBurn" | "pendingBacklog" | "idleGoal" | "leftovers", {
            enabled: boolean;
            maxLevel: "L2" | "L3" | "L0" | "L1";
        }>;
        channels: {
            brief: boolean;
            cards: boolean;
            asks: boolean;
        };
        limits: {
            cardIntervalHours: number;
            cooldownDays: number;
        };
        companion: {
            journal: boolean;
        };
    };
    restore(input: Parameters<InitiativeCards['restore']>[0]): void;
    panel(): {
        radar?: {
            settings: {
                enabled: boolean;
                sources: {
                    dependencies: boolean;
                    localGit: boolean;
                    github: boolean;
                };
                checkHours: number;
            };
            checks: number;
            passed: number;
            requests: number;
        };
        findings: {
            status: "delivered" | "muted" | "expired" | "open" | "accepted" | "snoozed" | "dismissed";
            goalTitle: string;
            id: string;
            detector: "radarDependency" | "radarCI" | "radarConflict" | "radarRelated" | "repeatedFailure" | "stallWarning" | "noAcceptance" | "budgetBurn" | "pendingBacklog" | "idleGoal" | "leftovers";
            subject: {
                goalId?: (string & import("zod").$brand<"GoalId">) | undefined;
                taskId?: (string & import("zod").$brand<"TaskId">) | undefined;
            };
            dedupeKey: string;
            evidence: {
                kind: "task" | "notification" | "verification" | "goal" | "run" | "radar";
                id: string;
                commandIndex?: number | undefined;
                hash?: string | undefined;
            }[];
            summary: string;
            score: number;
            level: "L2" | "L3" | "L0" | "L1";
            actions: ({
                kind: "draft-goal";
                text: string;
                projectRoot: string;
            } | {
                kind: "goal-pause";
                goalId: string & import("zod").$brand<"GoalId">;
                paused: boolean;
            } | {
                kind: "autopilot";
                goalId: string & import("zod").$brand<"GoalId">;
                enabled: boolean;
            } | {
                kind: "global-pause";
                paused: boolean;
            } | {
                kind: "goal-note";
                goalId: string & import("zod").$brand<"GoalId">;
                text: string;
            } | {
                kind: "start-work";
                projectRoot: string;
                task: string;
            })[];
            createdAt: number;
            expiresAt: number;
            outcomeAt?: number | undefined;
            notificationId?: string | undefined;
            deliveredAt?: number | undefined;
            falsePositive?: boolean | undefined;
            neutral?: boolean | undefined;
            progressAt?: number | undefined;
            progressClosed?: boolean | undefined;
            progressGoal?: (string & import("zod").$brand<"GoalId">) | undefined;
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
        counts: {
            [k: string]: number;
        };
        metrics: {
            detector: "radarDependency" | "radarCI" | "radarConflict" | "radarRelated" | "repeatedFailure" | "stallWarning" | "noAcceptance" | "budgetBurn" | "pendingBacklog" | "idleGoal" | "leftovers";
            week: {
                delivered: number;
                accepted: number;
                interruptions: number;
                progressed: number;
                inaccurate: number;
                modelCost: 0;
            };
            month: {
                delivered: number;
                accepted: number;
                interruptions: number;
                progressed: number;
                inaccurate: number;
                modelCost: 0;
            };
            adjustment: {
                at: number;
                level: "L2" | "L3" | "L0" | "L1";
                minimumScore: number;
                delivered: number;
                interruptions: number;
                accepted: number;
            } | undefined;
        }[];
        muted: {
            readonly goalId: string & import("zod").$brand<"GoalId">;
            readonly detector: "radarDependency" | "radarCI" | "radarConflict" | "radarRelated" | "repeatedFailure" | "stallWarning" | "noAcceptance" | "budgetBurn" | "pendingBacklog" | "idleGoal" | "leftovers";
            readonly title: string;
        }[];
        settings: {
            enabled: boolean;
            detectors: Record<"radarDependency" | "radarCI" | "radarConflict" | "radarRelated" | "repeatedFailure" | "stallWarning" | "noAcceptance" | "budgetBurn" | "pendingBacklog" | "idleGoal" | "leftovers", {
                enabled: boolean;
                maxLevel: "L2" | "L3" | "L0" | "L1";
            }>;
            channels: {
                brief: boolean;
                cards: boolean;
                asks: boolean;
            };
            limits: {
                cardIntervalHours: number;
                cooldownDays: number;
            };
            companion: {
                journal: boolean;
            };
        };
    };
    brief(now: number): {
        detector: "radarDependency" | "radarCI" | "radarConflict" | "radarRelated" | "repeatedFailure" | "stallWarning" | "noAcceptance" | "budgetBurn" | "pendingBacklog" | "idleGoal" | "leftovers";
        title: string;
    }[];
    private recent;
    /** Resolve references on demand. Raw tool and session bodies never enter findings or the brief. */
    evidence(id: string, panel?: boolean): ({
        missing: boolean;
        kind: "task" | "notification" | "verification" | "goal" | "run" | "radar";
        id: string;
        commandIndex?: number | undefined;
        hash?: string | undefined;
    } | {
        excerpt?: string;
        missing: boolean;
        at: number;
        status: "dependencies" | "github" | "localGit";
        kind: "task" | "notification" | "verification" | "goal" | "run" | "radar";
        id: string;
        commandIndex?: number | undefined;
        hash?: string | undefined;
    } | {
        command?: string;
        excerpt?: string;
        exitCode?: number | null;
        missing: boolean;
        status: "UNKNOWN" | "PASS" | "FAIL" | "INSUFFICIENT_EVIDENCE" | "NOT_SCORABLE";
        at: number;
        kind: "task" | "notification" | "verification" | "goal" | "run" | "radar";
        id: string;
        commandIndex?: number | undefined;
        hash?: string | undefined;
    } | {
        missing: boolean;
        title: string;
        status: "PENDING" | "READY" | "RUNNING" | "VERIFYING" | "SUCCEEDED" | "WAITING_APPROVAL" | "BLOCKED" | "FAILED" | "UNKNOWN" | "PAUSED" | "CANCELLED";
        kind: "task" | "notification" | "verification" | "goal" | "run" | "radar";
        id: string;
        commandIndex?: number | undefined;
        hash?: string | undefined;
    } | {
        missing: boolean;
        status: "blocked" | "info" | "progress" | "decision" | "initiative";
        at: number;
        kind: "task" | "notification" | "verification" | "goal" | "run" | "radar";
        id: string;
        commandIndex?: number | undefined;
        hash?: string | undefined;
    } | {
        missing: boolean;
        status: "completed" | "cancelled" | "draft" | "active" | "paused" | "succeeded";
        kind: "task" | "notification" | "verification" | "goal" | "run" | "radar";
        id: string;
        commandIndex?: number | undefined;
        hash?: string | undefined;
    })[];
    query(): {
        id: string;
        detector: "radarDependency" | "radarCI" | "radarConflict" | "radarRelated" | "repeatedFailure" | "stallWarning" | "noAcceptance" | "budgetBurn" | "pendingBacklog" | "idleGoal" | "leftovers";
        goalId: (string & import("zod").$brand<"GoalId">) | undefined;
        summary: string;
        createdAt: number;
        evidence: ({
            missing: boolean;
            kind: "task" | "notification" | "verification" | "goal" | "run" | "radar";
            id: string;
            commandIndex?: number | undefined;
            hash?: string | undefined;
        } | {
            excerpt?: string;
            missing: boolean;
            at: number;
            status: "dependencies" | "github" | "localGit";
            kind: "task" | "notification" | "verification" | "goal" | "run" | "radar";
            id: string;
            commandIndex?: number | undefined;
            hash?: string | undefined;
        } | {
            command?: string;
            excerpt?: string;
            exitCode?: number | null;
            missing: boolean;
            status: "UNKNOWN" | "PASS" | "FAIL" | "INSUFFICIENT_EVIDENCE" | "NOT_SCORABLE";
            at: number;
            kind: "task" | "notification" | "verification" | "goal" | "run" | "radar";
            id: string;
            commandIndex?: number | undefined;
            hash?: string | undefined;
        } | {
            missing: boolean;
            title: string;
            status: "PENDING" | "READY" | "RUNNING" | "VERIFYING" | "SUCCEEDED" | "WAITING_APPROVAL" | "BLOCKED" | "FAILED" | "UNKNOWN" | "PAUSED" | "CANCELLED";
            kind: "task" | "notification" | "verification" | "goal" | "run" | "radar";
            id: string;
            commandIndex?: number | undefined;
            hash?: string | undefined;
        } | {
            missing: boolean;
            status: "blocked" | "info" | "progress" | "decision" | "initiative";
            at: number;
            kind: "task" | "notification" | "verification" | "goal" | "run" | "radar";
            id: string;
            commandIndex?: number | undefined;
            hash?: string | undefined;
        } | {
            missing: boolean;
            status: "completed" | "cancelled" | "draft" | "active" | "paused" | "succeeded";
            kind: "task" | "notification" | "verification" | "goal" | "run" | "radar";
            id: string;
            commandIndex?: number | undefined;
            hash?: string | undefined;
        })[];
    }[];
    delete(id: string): boolean;
    dispose(): Promise<void>;
}
