import { z } from 'zod';
import type { DetectorId, GoalId, InitiativeSettings, Locale, Notification, Opportunity, Suggestion } from '#whalemaid/core';
import type { GoalIntake } from '../goal-intake/service.js';
import type { ScopeService } from '../scope-service.js';
import type { RouteResult } from '../notify/router.js';
import { type WhaleStore } from '../store/index.js';
import type { RadarService } from '../radar/service.js';
/** Cards own the initiative lifecycle. The notification router owns the shared durable claim. */
export declare class InitiativeCards {
    private readonly store;
    private readonly scopes;
    private readonly intake;
    private readonly settings;
    private readonly locale;
    private readonly radar?;
    constructor(store: WhaleStore, scopes: Pick<ScopeService, 'activeScopeFor'>, intake: Pick<GoalIntake, 'setPaused'>, settings: () => InitiativeSettings, locale: () => Locale, radar?: RadarService | undefined);
    private feedback;
    private muted;
    findingLive(row: Opportunity): boolean;
    level(row: Pick<Opportunity, 'score' | 'detector'>, settings?: {
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
    }): "L2" | "L3" | "L0" | "L1";
    restore(input: {
        detector: DetectorId;
        goalId?: GoalId | undefined;
    }, now: number): void;
    panel(rows: readonly Opportunity[], now: number): {
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
            readonly goalId: string & z.core.$brand<"GoalId">;
            readonly detector: "radarDependency" | "radarCI" | "radarConflict" | "radarRelated" | "repeatedFailure" | "stallWarning" | "noAcceptance" | "budgetBurn" | "pendingBacklog" | "idleGoal" | "leftovers";
            readonly title: string;
        }[];
    };
    refresh(n: Notification, now?: number): Notification;
    enabled(n: Notification): boolean;
    canDeliver(n: Notification): boolean;
    conflictNotice(id: GoalId): {
        id: string & z.core.$brand<"NotificationId">;
        kind: "blocked" | "info" | "progress" | "decision" | "initiative";
        priority: "high" | "low" | "normal";
        dedupeKey: string;
        goalId: string & z.core.$brand<"GoalId">;
        channel: "dsh-question" | "panel" | "system";
        createdAt: number;
        taskId?: (string & z.core.$brand<"TaskId">) | undefined;
        runId?: string | undefined;
        taskVersion?: number | undefined;
        reason?: string | undefined;
        initiative?: {
            ids: string[];
            level: "L2" | "L3";
            goalFingerprint: string;
        } | undefined;
        decisionDelivery?: {
            generation: number;
            failures: number;
            outcome: "cancelled" | "failed" | "ready" | "asking" | "answered" | "unanswered";
            reason?: string | undefined;
            retryAt?: number | undefined;
        } | undefined;
        decisionBinding?: {
            scopeId: string;
            scopeHash: string;
            transitionId?: string | null | undefined;
        } | undefined;
        deliveryAttemptedAt?: number | undefined;
        deliveryState?: "cancelled" | "failed" | "delivered" | "muted" | "held" | "digest" | "dropped" | undefined;
        deliveryReason?: string | undefined;
        nextDeliveryAt?: number | undefined;
        remindAt?: number | undefined;
        suggestionIds?: string[] | undefined;
        routingSuggestionId?: string | undefined;
        lastSelectionId?: string | undefined;
        resolvedSource?: "panel" | "inbox" | undefined;
        choices?: ("rollback" | "pause-goal" | "resume-goal" | "retry" | "abandon" | "change-direction" | "verify" | "accept" | "view-diff")[] | undefined;
        expiresAt?: number | undefined;
        resolvedReason?: "superseded" | "expired" | undefined;
        resolvedChoice?: "rollback" | "pause-goal" | "resume-goal" | "retry" | "abandon" | "change-direction" | "verify" | "accept" | "view-diff" | undefined;
        resolvedAt?: number | undefined;
        deliveredAt?: number | undefined;
        snoozedUntil?: number | undefined;
        readAt?: number | undefined;
    } | undefined;
    private rows;
    copy(n: Notification): {
        header: string;
        question: string;
        detail: string;
    };
    options(n: Notification, goalVersion: number, now: number): Suggestion[];
    allows(n: Notification, s: Suggestion, version: number): boolean | undefined;
    delivered(n: Notification, at: number): void;
    failedDelivery(n: Notification): void;
    recover(): void;
    /** Called inside the router's effect transaction after it durably claims the option. */
    apply(n: Notification, s: Suggestion, now: number): RouteResult;
    tick(now: number): void;
    private queue;
    private track;
}
