import { z } from 'zod';
import type { AuthorizationScope, Clock, IdGen, ScopeHasher } from '#whalemaid/core';
import type { GoalRepo, ScopeRepo, TaskRepo, TransitionRepo, RunRepo, CheckpointRepo, EvidenceRepo } from './repos.js';
export declare const CompanionSessionRecordSchema: z.ZodObject<{
    sessionId: z.ZodString;
    createdAt: z.ZodNumber;
    previous: z.ZodDefault<z.ZodArray<z.ZodString>>;
    writable: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strict>;
export type CompanionSessionRecord = z.infer<typeof CompanionSessionRecordSchema>;
import type { Migration } from './migrations.js';
import { EverydayApprovalPanelSchema } from '../everyday-approval/contract.js';
import type { EverydayApprovalRecord } from '../everyday-approval/contract.js';
import { CodexSettingsSchema } from '../codex/contract.js';
export declare const productionClock: Clock;
export declare const productionIdGen: IdGen;
export declare const sha256: ScopeHasher;
export interface StoreStatus {
    state: 'ok' | 'read-only' | 'error';
    corruptRows: number;
    message?: string;
}
export interface StoreOptions {
    clock?: Clock;
    idGen?: IdGen;
    migrations?: readonly Migration[];
    log(message: string, error?: unknown): void;
}
/** Owns one SQLite handle and writer lock. All domain writes validate core schemas. */
export declare class WhaleStore {
    private readonly dataDir;
    private readonly options;
    private db;
    private unlock;
    private state;
    private message;
    private readonly corrupt;
    private readonly clock;
    private readonly idGen;
    private transactionDepth;
    readonly goals: GoalRepo;
    readonly scopes: ScopeRepo;
    readonly tasks: TaskRepo;
    readonly transitions: TransitionRepo;
    readonly checkpoints: CheckpointRepo;
    readonly evidence: EvidenceRepo;
    readonly runs: RunRepo;
    private readonly listeners;
    private changeQueued;
    /** Observe durable state changes; listeners re-read state, rather than trusting event payloads. */
    watchChanges(listener: () => void): () => void;
    private changed;
    readonly autopilotEvents: {
        list: (id?: string) => {
            id: string;
            at: number;
            action: string;
            reason: string;
            goalId?: (string & z.core.$brand<"GoalId">) | undefined;
            actor?: "user" | "companion" | "companion-proposal" | undefined;
            decisionId?: string | undefined;
            proposalId?: string | undefined;
            sessionId?: string | undefined;
            confirmedAt?: number | undefined;
            companionOperation?: "pause" | "resume" | "enable-autopilot" | "disable-autopilot" | "pause-all" | "resume-all" | undefined;
            taskId?: (string & z.core.$brand<"TaskId">) | undefined;
            runId?: (string & z.core.$brand<"RunId">) | undefined;
        }[];
        insert: (input: import("#whalemaid/core").AutopilotEvent) => void;
    };
    readonly plannerState: {
        get: (id: string) => {
            id: string & z.core.$brand<"GoalId">;
            day: string;
            calls: number;
            status: "continue" | "none" | "complete" | "need-user";
            frontier: string;
            reason: string;
            notBefore: number;
        } | undefined;
        put: (input: import("#whalemaid/core").PlannerState) => void;
    };
    readonly verifications: {
        get: (id: string) => {
            id: string & z.core.$brand<"RunId">;
            taskId: string & z.core.$brand<"TaskId">;
            checkpoint: string;
            createdAt: number;
            baseline: {
                command: string;
                status: "error" | "failed" | "passed" | "timeout";
                exitCode: number | null;
                counts?: {
                    passed: number;
                    failed: number;
                    skipped: number;
                } | undefined;
                durationMs?: number | undefined;
                logPath?: string | undefined;
                hash?: string | undefined;
                tail?: string | undefined;
            }[];
            current: {
                command: string;
                status: "error" | "failed" | "passed" | "timeout";
                exitCode: number | null;
                counts?: {
                    passed: number;
                    failed: number;
                    skipped: number;
                } | undefined;
                durationMs?: number | undefined;
                logPath?: string | undefined;
                hash?: string | undefined;
                tail?: string | undefined;
            }[];
            judgment: {
                verdict: "UNKNOWN" | "PASS" | "FAIL" | "INSUFFICIENT_EVIDENCE" | "NOT_SCORABLE";
                reasons: string[];
                progress: "unknown" | "neutral" | "improved" | "unchanged" | "regressed";
            };
            decision: {
                taskOutcome: "reconcile" | "succeed" | "retry" | "rollback-and-retry" | "ask-user";
                goalAction: "continue" | "pause";
                unknownVerifications: number;
                reason: string;
                goalProgress: number;
                attempts: number;
                failureSummary: string;
            } | {
                taskOutcome: "reconcile" | "succeed" | "retry" | "rollback-and-retry" | "ask-user";
                goalAction: "pause" | "continue";
                unknownVerifications: number;
                reason: string;
                goalProgress: number;
                attempts: number;
                failureSummary: string;
            };
        } | undefined;
        list: () => {
            id: string & z.core.$brand<"RunId">;
            taskId: string & z.core.$brand<"TaskId">;
            checkpoint: string;
            createdAt: number;
            baseline: {
                command: string;
                status: "error" | "failed" | "passed" | "timeout";
                exitCode: number | null;
                counts?: {
                    passed: number;
                    failed: number;
                    skipped: number;
                } | undefined;
                durationMs?: number | undefined;
                logPath?: string | undefined;
                hash?: string | undefined;
                tail?: string | undefined;
            }[];
            current: {
                command: string;
                status: "error" | "failed" | "passed" | "timeout";
                exitCode: number | null;
                counts?: {
                    passed: number;
                    failed: number;
                    skipped: number;
                } | undefined;
                durationMs?: number | undefined;
                logPath?: string | undefined;
                hash?: string | undefined;
                tail?: string | undefined;
            }[];
            judgment: {
                verdict: "UNKNOWN" | "PASS" | "FAIL" | "INSUFFICIENT_EVIDENCE" | "NOT_SCORABLE";
                reasons: string[];
                progress: "unknown" | "neutral" | "improved" | "unchanged" | "regressed";
            };
            decision: {
                taskOutcome: "reconcile" | "succeed" | "retry" | "rollback-and-retry" | "ask-user";
                goalAction: "continue" | "pause";
                unknownVerifications: number;
                reason: string;
                goalProgress: number;
                attempts: number;
                failureSummary: string;
            } | {
                taskOutcome: "reconcile" | "succeed" | "retry" | "rollback-and-retry" | "ask-user";
                goalAction: "pause" | "continue";
                unknownVerifications: number;
                reason: string;
                goalProgress: number;
                attempts: number;
                failureSummary: string;
            };
        }[];
        insert: (input: import("#whalemaid/core").Verification) => void;
    };
    readonly notifications: {
        get: (id: string) => {
            id: string & z.core.$brand<"NotificationId">;
            kind: "blocked" | "progress" | "decision" | "info";
            priority: "high" | "low" | "normal";
            dedupeKey: string;
            goalId: string & z.core.$brand<"GoalId">;
            channel: "dsh-question" | "panel" | "system";
            createdAt: number;
            taskId?: (string & z.core.$brand<"TaskId">) | undefined;
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
        } | undefined;
        list: () => {
            id: string & z.core.$brand<"NotificationId">;
            kind: "blocked" | "progress" | "decision" | "info";
            priority: "high" | "low" | "normal";
            dedupeKey: string;
            goalId: string & z.core.$brand<"GoalId">;
            channel: "dsh-question" | "panel" | "system";
            createdAt: number;
            taskId?: (string & z.core.$brand<"TaskId">) | undefined;
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
        }[];
        insert: (input: import("#whalemaid/core").Notification) => void;
        update: (input: import("#whalemaid/core").Notification) => void;
    };
    readonly suggestions: {
        get: (id: string) => {
            id: string & z.core.$brand<"SuggestionId">;
            notificationId: string & z.core.$brand<"NotificationId">;
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
                goalId: string & z.core.$brand<"GoalId">;
            } | {
                type: "pause-goal";
                goalId: string & z.core.$brand<"GoalId">;
            } | {
                type: "resume-goal";
                goalId: string & z.core.$brand<"GoalId">;
            } | {
                type: "rollback-to-checkpoint";
                checkpointId: string & z.core.$brand<"CheckpointId">;
            } | {
                type: "reply-to-session";
                sessionId: string & z.core.$brand<"SessionId">;
                text: string;
            } | {
                type: "open-workbench";
                sessionId?: (string & z.core.$brand<"SessionId">) | undefined;
            } | {
                type: "expand-scope";
                goalId: string & z.core.$brand<"GoalId">;
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
                goalId: string & z.core.$brand<"GoalId">;
                notificationId: string & z.core.$brand<"NotificationId">;
                scopeHash: string;
                scopeId: string;
                taskId?: (string & z.core.$brand<"TaskId">) | undefined;
                taskVersion?: number | undefined;
                goalVersion?: number | undefined;
            } | {
                goalId: string & z.core.$brand<"GoalId">;
            } | {
                goalId: string & z.core.$brand<"GoalId">;
                taskId: string & z.core.$brand<"TaskId">;
                taskVersion: number;
                sessionId: string & z.core.$brand<"SessionId">;
            };
            description?: string | undefined;
            consumedAt?: number | undefined;
        } | undefined;
        update: (input: import("#whalemaid/core").Suggestion) => void;
        list: () => {
            id: string & z.core.$brand<"SuggestionId">;
            notificationId: string & z.core.$brand<"NotificationId">;
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
                goalId: string & z.core.$brand<"GoalId">;
            } | {
                type: "pause-goal";
                goalId: string & z.core.$brand<"GoalId">;
            } | {
                type: "resume-goal";
                goalId: string & z.core.$brand<"GoalId">;
            } | {
                type: "rollback-to-checkpoint";
                checkpointId: string & z.core.$brand<"CheckpointId">;
            } | {
                type: "reply-to-session";
                sessionId: string & z.core.$brand<"SessionId">;
                text: string;
            } | {
                type: "open-workbench";
                sessionId?: (string & z.core.$brand<"SessionId">) | undefined;
            } | {
                type: "expand-scope";
                goalId: string & z.core.$brand<"GoalId">;
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
                goalId: string & z.core.$brand<"GoalId">;
                notificationId: string & z.core.$brand<"NotificationId">;
                scopeHash: string;
                scopeId: string;
                taskId?: (string & z.core.$brand<"TaskId">) | undefined;
                taskVersion?: number | undefined;
                goalVersion?: number | undefined;
            } | {
                goalId: string & z.core.$brand<"GoalId">;
            } | {
                goalId: string & z.core.$brand<"GoalId">;
                taskId: string & z.core.$brand<"TaskId">;
                taskVersion: number;
                sessionId: string & z.core.$brand<"SessionId">;
            };
            description?: string | undefined;
            consumedAt?: number | undefined;
        }[];
        insert: (input: import("#whalemaid/core").Suggestion) => void;
        consume: (notificationId: string, at: number) => void;
    };
    readonly userNotes: {
        get: (id: string) => {
            id: string;
            goalId: string & z.core.$brand<"GoalId">;
            at: number;
            text: string;
            notificationId?: (string & z.core.$brand<"NotificationId">) | undefined;
            source?: "companion" | "decision" | undefined;
        } | undefined;
        list: (goalId?: string) => {
            id: string;
            goalId: string & z.core.$brand<"GoalId">;
            at: number;
            text: string;
            notificationId?: (string & z.core.$brand<"NotificationId">) | undefined;
            source?: "companion" | "decision" | undefined;
        }[];
        insert: (input: {
            id: string;
            goalId: string & z.core.$brand<"GoalId">;
            at: number;
            text: string;
            notificationId?: (string & z.core.$brand<"NotificationId">) | undefined;
            source?: "companion" | "decision" | undefined;
        }) => void;
        update: (input: {
            id: string;
            goalId: string & z.core.$brand<"GoalId">;
            at: number;
            text: string;
            notificationId?: (string & z.core.$brand<"NotificationId">) | undefined;
            source?: "companion" | "decision" | undefined;
        }) => void;
    };
    readonly notificationChoices: {
        get: (id: string) => {
            id: string;
            goalId: string & z.core.$brand<"GoalId">;
            notificationId: string & z.core.$brand<"NotificationId">;
            suggestionId: string;
            reason: string;
            action: string;
            source: "panel" | "inbox";
            at: number;
            result: "succeeded" | "failed" | "pending";
            detail?: string | undefined;
        } | undefined;
        list: (goalId?: string) => {
            id: string;
            goalId: string & z.core.$brand<"GoalId">;
            notificationId: string & z.core.$brand<"NotificationId">;
            suggestionId: string;
            reason: string;
            action: string;
            source: "panel" | "inbox";
            at: number;
            result: "succeeded" | "failed" | "pending";
            detail?: string | undefined;
        }[];
        insert: (input: {
            id: string;
            goalId: string & z.core.$brand<"GoalId">;
            notificationId: string & z.core.$brand<"NotificationId">;
            suggestionId: string;
            reason: string;
            action: string;
            source: "panel" | "inbox";
            at: number;
            result: "succeeded" | "failed" | "pending";
            detail?: string | undefined;
        }) => void;
        update: (input: {
            id: string;
            goalId: string & z.core.$brand<"GoalId">;
            notificationId: string & z.core.$brand<"NotificationId">;
            suggestionId: string;
            reason: string;
            action: string;
            source: "panel" | "inbox";
            at: number;
            result: "succeeded" | "failed" | "pending";
            detail?: string | undefined;
        }) => void;
    };
    readonly inboxSessions: {
        get: (id: string) => {
            id: string;
            goalId: string & z.core.$brand<"GoalId">;
            at: number;
        } | undefined;
        list: (goalId?: string) => {
            id: string;
            goalId: string & z.core.$brand<"GoalId">;
            at: number;
        }[];
        insert: (input: {
            id: string;
            goalId: string & z.core.$brand<"GoalId">;
            at: number;
        }) => void;
        update: (input: {
            id: string;
            goalId: string & z.core.$brand<"GoalId">;
            at: number;
        }) => void;
    };
    readonly notificationDeliveries: {
        get: (id: string) => {
            id: string;
            goalId: string & z.core.$brand<"GoalId">;
            notificationId: string & z.core.$brand<"NotificationId">;
            at: number;
            result: "cancelled" | "failed" | "started" | "answered";
            detail?: string | undefined;
        } | undefined;
        list: (goalId?: string) => {
            id: string;
            goalId: string & z.core.$brand<"GoalId">;
            notificationId: string & z.core.$brand<"NotificationId">;
            at: number;
            result: "cancelled" | "failed" | "started" | "answered";
            detail?: string | undefined;
        }[];
        insert: (input: {
            id: string;
            goalId: string & z.core.$brand<"GoalId">;
            notificationId: string & z.core.$brand<"NotificationId">;
            at: number;
            result: "cancelled" | "failed" | "started" | "answered";
            detail?: string | undefined;
        }) => void;
        update: (input: {
            id: string;
            goalId: string & z.core.$brand<"GoalId">;
            notificationId: string & z.core.$brand<"NotificationId">;
            at: number;
            result: "cancelled" | "failed" | "started" | "answered";
            detail?: string | undefined;
        }) => void;
    };
    readonly memories: {
        get: (id: string) => {
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
        } | undefined;
        list: (scopeKey?: string, options?: {
            includeArchived?: boolean;
        }) => {
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
        insert: (input: import("#whalemaid/core").Memory) => void;
        update: (input: import("#whalemaid/core").Memory, expectedVersion: number) => void;
        delete: (id: string) => void;
    };
    readonly memoryProposals: {
        get: (id: string) => {
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
        } | undefined;
        list: () => {
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
        }[];
        insert: (input: import("#whalemaid/core").MemoryProposal) => void;
        update: (input: import("#whalemaid/core").MemoryProposal, version: number) => void;
    };
    readonly journal: {
        get: (id: string) => {
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
        } | undefined;
        list: () => ({
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
        insert: (input: import("#whalemaid/core").CompanionJournal) => void;
        delete: (id?: string) => void;
    };
    constructor(dataDir: string, options: StoreOptions);
    /** Detached status; corruptRows counts distinct invalid stored rows observed this startup. */
    status(): StoreStatus;
    /** Only the authenticated panel's explicit owner confirmation may call this recovery path. */
    takeover(): void;
    /** Synchronous transactions must contain no async work or external side effects. */
    transaction<T>(work: () => T): T;
    /** Lifecycle writes change only status/revokedAt and their digest; grants are append-only. */
    replaceScope(nextInput: AuthorizationScope, previousInput?: AuthorizationScope): void;
    /** Revocation and replacement never accept modified grant fields. */
    writeScopeLifecycle(input: AuthorizationScope): void;
    codexSettings(): ReturnType<typeof CodexSettingsSchema.parse>;
    setCodexSettings(input: unknown): void;
    everydayApprovalState(): ReturnType<typeof EverydayApprovalPanelSchema.parse>;
    setEverydayApprovalEnabled(enabled: boolean): void;
    recordEverydayApproval(input: EverydayApprovalRecord): void;
    private writeEverydayApproval;
    /** Persist notification preferences in the existing settings ledger; malformed settings mute delivery. */
    notificationPreferences(): import('#whalemaid/core').NotificationPreferences;
    /** Owner-facing adapter validates before calling this durable mutation. */
    setNotificationPreferences(input: unknown): void;
    /** The companion session WhaleMaid created, if any; malformed rows read as absent. */
    companionSession(): CompanionSessionRecord | undefined;
    setCompanionSession(input: CompanionSessionRecord): void;
    paused(): boolean;
    /** Auxiliary memory usage, references and draft deduplication; never interpreted as confirmed content. */
    memoryMeta(): {
        calls: number[];
        references: Record<string, number>;
        drafts: Record<string, number>;
    };
    /** Recall-only durable cursors and attempt counters; never part of confirmed memory. */
    recallState<T>(id: string, schema: z.ZodType<T>): T | undefined;
    setRecallState(id: string, input: unknown): void;
    setMemoryMeta(input: ReturnType<WhaleStore['memoryMeta']>): void;
    /** Writes are durable before callers observe the new pause value. */
    pauseVersion(): number;
    setPaused(paused: boolean): void;
    close(): void;
    private writer;
    private open;
    private checkHistory;
    private backup;
    private rows;
    private one;
    private decode;
}
export type { GoalRepo, ScopeRepo, TaskRepo, TransitionRepo, RunRepo, CheckpointRepo, EvidenceRepo, } from './repos.js';
