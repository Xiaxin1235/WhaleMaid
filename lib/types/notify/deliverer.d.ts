import type { Notification, NotificationFacts, Locale } from '#whalemaid/core';
import type { WhaleStore } from '../store/index.js';
import type { ScopeService } from '../scope-service.js';
import type { InboxPort } from './inbox-session.js';
import type { NotificationRouter } from './router.js';
/** Deliver one durable attempt per notification generation; unhandled/cancelled asks never nag. */
export declare class NotificationDeliverer {
    readonly store: WhaleStore;
    private readonly scopes;
    private readonly inbox;
    private readonly router;
    private readonly locale;
    private readonly log;
    private stopped;
    private stopWatch;
    private timer;
    private debounce;
    private readonly pending;
    constructor(store: WhaleStore, scopes: Pick<ScopeService, 'activeScopeFor'>, inbox: InboxPort, router: NotificationRouter, locale: () => Locale, log: (message: string, error?: unknown) => void);
    /** Register state-change observation only after migrations, recovery and tool gates are ready. */
    start(): void;
    private mark;
    private cancelInvalid;
    private valid;
    /** Panel views share deterministic copy and the same persisted option identities. */
    center(goalId?: string): {
        preferences: {
            maxPerHour: number;
            muted: boolean;
            quietHours?: {
                start: string;
                end: string;
            } | undefined;
        };
        items: {
            goal: {
                id: string & import("zod").$brand<"GoalId">;
                title: string;
                version: number;
                status: "completed" | "cancelled" | "draft" | "active" | "paused" | "succeeded";
            } | undefined;
            notification: {
                id: string & import("zod").$brand<"NotificationId">;
                kind: "blocked" | "progress" | "decision" | "info";
                priority: "high" | "low" | "normal";
                dedupeKey: string;
                goalId: string & import("zod").$brand<"GoalId">;
                channel: "dsh-question" | "panel" | "system";
                createdAt: number;
                taskId?: (string & import("zod").$brand<"TaskId">) | undefined;
                runId?: string | undefined;
                taskVersion?: number | undefined;
                reason?: string | undefined;
                deliveryAttemptedAt?: number | undefined;
                deliveryState?: "cancelled" | "failed" | "delivered" | "held" | "muted" | "digest" | "dropped" | undefined;
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
            };
            copy: {
                header: string;
                question: string;
                detail: string;
            };
            suggestions: {
                id: string & import("zod").$brand<"SuggestionId">;
                notificationId: string & import("zod").$brand<"NotificationId">;
                label: string;
                intent: {
                    type: "read-file";
                    path: string;
                } | {
                    type: "write-file";
                    path: string;
                } | {
                    type: "run-command";
                    cmdline: string;
                    cwd: string;
                } | {
                    type: "git";
                    subcommand: string;
                    args: string[];
                } | {
                    type: "spawn-subagent";
                } | {
                    type: "network";
                    url: string;
                    method: string;
                } | {
                    type: "continue-goal";
                    goalId: string & import("zod").$brand<"GoalId">;
                } | {
                    type: "pause-goal";
                    goalId: string & import("zod").$brand<"GoalId">;
                } | {
                    type: "resume-goal";
                    goalId: string & import("zod").$brand<"GoalId">;
                } | {
                    type: "rollback-to-checkpoint";
                    checkpointId: string & import("zod").$brand<"CheckpointId">;
                } | {
                    type: "reply-to-session";
                    sessionId: string & import("zod").$brand<"SessionId">;
                    text: string;
                } | {
                    type: "open-workbench";
                    sessionId?: (string & import("zod").$brand<"SessionId">) | undefined;
                } | {
                    type: "expand-scope";
                    goalId: string & import("zod").$brand<"GoalId">;
                    patch: {
                        allowedPaths?: string[] | undefined;
                        protectedPaths?: string[] | undefined;
                        allowedActions?: ("read-file" | "write-file" | "run-command" | "git" | "network" | "spawn-subagent" | "continue-goal" | "pause-goal" | "resume-goal" | "rollback-to-checkpoint" | "reply-to-session" | "open-workbench" | "expand-scope")[] | undefined;
                        forbiddenActions?: ("read-file" | "write-file" | "run-command" | "git" | "network" | "spawn-subagent" | "continue-goal" | "pause-goal" | "resume-goal" | "rollback-to-checkpoint" | "reply-to-session" | "open-workbench" | "expand-scope")[] | undefined;
                        verifyCommands?: string[] | undefined;
                        permissionPreset?: "read-only" | "workspace-write" | undefined;
                        limits?: {
                            maxFixRounds?: number | undefined;
                            maxStallRounds?: number | undefined;
                            maxConcurrentWritePerProject?: number | undefined;
                            maxChangedFilesPerTask?: number | undefined;
                            maxRunMinutes?: number | undefined;
                            plannerCallsPerDay?: number | undefined;
                            maxRunsPerDay?: number | undefined;
                        } | undefined;
                    };
                } | {
                    type: "notification-action";
                    action: "snooze" | "open-panel";
                } | {
                    type: "panel-decision";
                    choice: "rollback" | "pause-goal" | "resume-goal" | "retry" | "abandon" | "change-direction" | "verify" | "accept" | "view-diff";
                };
                riskLevel: "high" | "low" | "medium";
                expiresAt: number;
                bindTo: {
                    goalId: string & import("zod").$brand<"GoalId">;
                    notificationId: string & import("zod").$brand<"NotificationId">;
                    scopeHash: string;
                    scopeId: string;
                    taskId?: (string & import("zod").$brand<"TaskId">) | undefined;
                    taskVersion?: number | undefined;
                    goalVersion?: number | undefined;
                } | {
                    goalId: string & import("zod").$brand<"GoalId">;
                } | {
                    goalId: string & import("zod").$brand<"GoalId">;
                    taskId: string & import("zod").$brand<"TaskId">;
                    taskVersion: number;
                    sessionId: string & import("zod").$brand<"SessionId">;
                };
                description?: string | undefined;
                consumedAt?: number | undefined;
            }[];
            notes: {
                id: string;
                goalId: string & import("zod").$brand<"GoalId">;
                at: number;
                text: string;
                notificationId?: (string & import("zod").$brand<"NotificationId">) | undefined;
                source?: "companion" | "decision" | undefined;
            }[];
            choices: {
                id: string;
                goalId: string & import("zod").$brand<"GoalId">;
                notificationId: string & import("zod").$brand<"NotificationId">;
                suggestionId: string;
                reason: string;
                action: string;
                source: "panel" | "inbox";
                at: number;
                result: "succeeded" | "failed" | "pending";
                detail?: string | undefined;
            }[];
        }[];
    };
    /** Structured evidence only; absence is displayed as unknown, never synthesized as zero. */
    facts(n: Notification): NotificationFacts;
    /** Refresh currently pending requests and admit new ones using fresh policy and authorization. */
    sweep(): Promise<void>;
    private send;
    private info;
    /** Cancel asks and stop all new delivery work; waiting cannot retain the plugin beyond five seconds. */
    dispose(): Promise<void>;
}
