import type { InitiativeSettings, Locale } from '#whalemaid/core';
import type { ScopeService } from '../scope-service.js';
import { type WhaleStore } from '../store/index.js';
export declare class InitiativeService {
    private readonly store;
    private readonly scopes;
    private readonly deps;
    private readonly pending;
    private readonly tasks;
    private full;
    private lastDay;
    private stopped;
    private unwatch;
    private timer;
    private midnight;
    private running;
    constructor(store: WhaleStore, scopes: Pick<ScopeService, 'activeScopeFor'>, deps: {
        settings(): InitiativeSettings;
        locale(): Locale;
        log(message: string, error?: unknown): void;
        now?(): number;
    });
    private now;
    start(): void;
    refresh(): void;
    private schedule;
    private scheduleMidnight;
    /** Coalesced jobs yield between goals and keep an unfinished batch queued. */
    scan(): Promise<void>;
    private detect;
    private detectGoal;
    private idleObservation;
    settings(): {
        enabled: boolean;
        detectors: Record<"repeatedFailure" | "stallWarning" | "noAcceptance" | "budgetBurn" | "pendingBacklog" | "idleGoal" | "leftovers", {
            enabled: boolean;
            maxLevel: "L0" | "L1" | "L2" | "L3";
        }>;
        channels: {
            brief: boolean;
            cards: boolean;
            asks: boolean;
        };
    };
    private available;
    panel(): {
        settings: {
            enabled: boolean;
            detectors: Record<"repeatedFailure" | "stallWarning" | "noAcceptance" | "budgetBurn" | "pendingBacklog" | "idleGoal" | "leftovers", {
                enabled: boolean;
                maxLevel: "L0" | "L1" | "L2" | "L3";
            }>;
            channels: {
                brief: boolean;
                cards: boolean;
                asks: boolean;
            };
        };
        findings: {
            status: "delivered" | "muted" | "expired" | "snoozed" | "open" | "accepted" | "dismissed";
            goalTitle: string;
            id: string;
            detector: "repeatedFailure" | "stallWarning" | "noAcceptance" | "budgetBurn" | "pendingBacklog" | "idleGoal" | "leftovers";
            subject: {
                goalId?: (string & import("zod").$brand<"GoalId">) | undefined;
                taskId?: (string & import("zod").$brand<"TaskId">) | undefined;
            };
            dedupeKey: string;
            evidence: {
                kind: "task" | "notification" | "verification" | "run" | "goal";
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
        }[];
        counts: {
            [k: string]: number;
        };
    };
    brief(now: number): {
        detector: "repeatedFailure" | "stallWarning" | "noAcceptance" | "budgetBurn" | "pendingBacklog" | "idleGoal" | "leftovers";
        title: string;
    }[];
    private recent;
    /** Resolve references on demand. Raw tool and session bodies never enter findings or the brief. */
    evidence(id: string, panel?: boolean): ({
        missing: boolean;
        kind: "task" | "notification" | "verification" | "run" | "goal";
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
        kind: "task" | "notification" | "verification" | "run" | "goal";
        id: string;
        commandIndex?: number | undefined;
        hash?: string | undefined;
    } | {
        missing: boolean;
        title: string;
        status: "PENDING" | "READY" | "RUNNING" | "VERIFYING" | "SUCCEEDED" | "WAITING_APPROVAL" | "BLOCKED" | "FAILED" | "UNKNOWN" | "PAUSED" | "CANCELLED";
        kind: "task" | "notification" | "verification" | "run" | "goal";
        id: string;
        commandIndex?: number | undefined;
        hash?: string | undefined;
    } | {
        missing: boolean;
        status: "blocked" | "info" | "progress" | "decision";
        at: number;
        kind: "task" | "notification" | "verification" | "run" | "goal";
        id: string;
        commandIndex?: number | undefined;
        hash?: string | undefined;
    } | {
        missing: boolean;
        status: "completed" | "cancelled" | "draft" | "active" | "paused" | "succeeded";
        kind: "task" | "notification" | "verification" | "run" | "goal";
        id: string;
        commandIndex?: number | undefined;
        hash?: string | undefined;
    })[];
    query(): {
        id: string;
        detector: "repeatedFailure" | "stallWarning" | "noAcceptance" | "budgetBurn" | "pendingBacklog" | "idleGoal" | "leftovers";
        goalId: (string & import("zod").$brand<"GoalId">) | undefined;
        summary: string;
        createdAt: number;
        evidence: ({
            missing: boolean;
            kind: "task" | "notification" | "verification" | "run" | "goal";
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
            kind: "task" | "notification" | "verification" | "run" | "goal";
            id: string;
            commandIndex?: number | undefined;
            hash?: string | undefined;
        } | {
            missing: boolean;
            title: string;
            status: "PENDING" | "READY" | "RUNNING" | "VERIFYING" | "SUCCEEDED" | "WAITING_APPROVAL" | "BLOCKED" | "FAILED" | "UNKNOWN" | "PAUSED" | "CANCELLED";
            kind: "task" | "notification" | "verification" | "run" | "goal";
            id: string;
            commandIndex?: number | undefined;
            hash?: string | undefined;
        } | {
            missing: boolean;
            status: "blocked" | "info" | "progress" | "decision";
            at: number;
            kind: "task" | "notification" | "verification" | "run" | "goal";
            id: string;
            commandIndex?: number | undefined;
            hash?: string | undefined;
        } | {
            missing: boolean;
            status: "completed" | "cancelled" | "draft" | "active" | "paused" | "succeeded";
            kind: "task" | "notification" | "verification" | "run" | "goal";
            id: string;
            commandIndex?: number | undefined;
            hash?: string | undefined;
        })[];
    }[];
    delete(id: string): boolean;
    dispose(): Promise<void>;
}
