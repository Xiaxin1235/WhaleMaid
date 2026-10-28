import { z } from 'zod';
import type { PeerScope } from '@deepseek-ai/dsh-client-connection';
import type { Clock, IdGen, GoalDraft, Locale } from '#whalemaid/core';
import { WhaleStore } from '../store/index.js';
import type { ScopeService } from '../scope-service.js';
import type { DraftModel } from './model.js';
import { inspectProject } from './project.js';
import type { ProjectFacts } from './project.js';
import type { ManagementActor } from '../companion/consent.js';
export declare const DraftRequestSchema: z.ZodObject<{
    text: z.ZodString;
    projectRoot: z.ZodString;
    locale: z.ZodOptional<z.ZodEnum<{
        "zh-CN": "zh-CN";
        en: "en";
    }>>;
}, z.core.$strict>;
export declare const DraftIdRequestSchema: z.ZodObject<{
    draftId: z.ZodString;
}, z.core.$strict>;
export declare const GoalRequestSchema: z.ZodObject<{
    goalId: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
}, z.core.$strict>;
export declare const GoalPausedSchema: z.ZodObject<{
    goalId: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
    paused: z.ZodBoolean;
}, z.core.$strict>;
export interface DraftStatus {
    state: 'running' | 'ready' | 'failed';
    draft?: GoalDraft;
    projectFacts?: ProjectFacts;
    error?: string;
}
interface DraftJob {
    companion?: {
        proposalId: string;
        sessionId: string;
        confirmedAt: number;
        text: string;
        projectRoot: string;
    };
    at: number;
    status: DraftStatus;
    controller: AbortController;
    expiry?: ReturnType<typeof setTimeout>;
}
/** In-memory proposals never write domain records; only confirm() creates an authorized goal. */
export declare class GoalIntake {
    private readonly store;
    private readonly scopes;
    private readonly model;
    private readonly clock;
    private readonly idGen;
    private readonly inspect;
    private readonly jobs;
    private running;
    constructor(store: WhaleStore, scopes: ScopeService, model: DraftModel, clock?: Clock, idGen?: IdGen, inspect?: typeof inspectProject);
    /** Start one in-memory proposal and return its handle without waiting for the model. */
    start(input: unknown, peer: ManagementActor, locale?: Locale, companion?: DraftJob['companion']): {
        draftId: string;
    };
    /** Owner reviews companion drafts in the existing P07 authorization editor. */
    companionDrafts(peer: PeerScope): {
        state: "running" | "failed" | "ready";
        proposalId: string;
        sessionId: string;
        confirmedAt: number;
        text: string;
        projectRoot: string;
        draftId: string;
    }[];
    /** Read a detached proposal snapshot after owner authentication and expiry checks. */
    status(input: unknown, peer: PeerScope): DraftStatus;
    /** Abort a proposal and discard its stored result. */
    cancel(input: unknown, peer: PeerScope): {
        cancelled: boolean;
    };
    /** Supply facts for manual entry without a model request. */
    project(input: unknown, peer: PeerScope): Promise<ProjectFacts>;
    /** Recheck the exact form values and atomically create goal, grant and initial tasks. */
    confirm(input: unknown, peer: PeerScope): Promise<{
        goal: {
            id: string & z.core.$brand<"GoalId">;
            title: string;
            objective: string;
            expectedOutcome: string;
            projectRoot: string;
            acceptance: string[];
            stopConditions: string[];
            mode: "suggest" | "autonomous" | "high";
            status: "completed" | "cancelled" | "draft" | "active" | "paused" | "succeeded";
            autopilot: {
                enabled: boolean;
                enabledAt?: number | undefined;
                disabledReason?: string | undefined;
            };
            createdAt: number;
            version: number;
            inboxSessionId?: string | undefined;
            scopeId?: (string & z.core.$brand<"ScopeId">) | undefined;
            confirmedAt?: number | undefined;
            stalled?: number | undefined;
        };
        scope: {
            id: string & z.core.$brand<"ScopeId">;
            goalId: string & z.core.$brand<"GoalId">;
            allowedPaths: string[];
            protectedPaths: string[];
            protectedNames: string[];
            allowedActions: ("read-file" | "write-file" | "run-command" | "git" | "network" | "spawn-subagent" | "continue-goal" | "pause-goal" | "resume-goal" | "rollback-to-checkpoint" | "reply-to-session" | "open-workbench" | "expand-scope")[];
            forbiddenActions: ("read-file" | "write-file" | "run-command" | "git" | "network" | "spawn-subagent" | "continue-goal" | "pause-goal" | "resume-goal" | "rollback-to-checkpoint" | "reply-to-session" | "open-workbench" | "expand-scope")[];
            verifyCommands: string[];
            limits: {
                maxFixRounds: number;
                maxStallRounds: number;
                maxConcurrentWritePerProject: number;
                maxChangedFilesPerTask: number;
                maxRunMinutes: number;
                plannerCallsPerDay: number;
                maxRunsPerDay: number;
            };
            permissionPreset: "read-only" | "workspace-write";
            commandMode: "confirmed" | "trusted";
            status: "active" | "revoked" | "superseded";
            grantedAt: number;
            hash: string;
            legacyAuthorization?: true | undefined;
            supersedes?: (string & z.core.$brand<"ScopeId">) | undefined;
            revokedAt?: number | undefined;
        };
        rejected: {
            task: import("#whalemaid/core").Task;
            reason: "foreign-goal" | "duplicate" | "dangling-dependency" | "cycle";
        }[];
    }>;
    /** Reuse P07's exact owner-reviewed authorization form; no companion capability can grant. */
    reauthorize(input: unknown, peer: PeerScope): Promise<{
        goal: {
            id: string & z.core.$brand<"GoalId">;
            title: string;
            objective: string;
            expectedOutcome: string;
            projectRoot: string;
            acceptance: string[];
            stopConditions: string[];
            mode: "suggest" | "autonomous" | "high";
            status: "completed" | "cancelled" | "draft" | "active" | "paused" | "succeeded";
            autopilot: {
                enabled: boolean;
                enabledAt?: number | undefined;
                disabledReason?: string | undefined;
            };
            createdAt: number;
            version: number;
            inboxSessionId?: string | undefined;
            scopeId?: (string & z.core.$brand<"ScopeId">) | undefined;
            confirmedAt?: number | undefined;
            stalled?: number | undefined;
        };
        scope: {
            id: string & z.core.$brand<"ScopeId">;
            goalId: string & z.core.$brand<"GoalId">;
            allowedPaths: string[];
            protectedPaths: string[];
            protectedNames: string[];
            allowedActions: ("read-file" | "write-file" | "run-command" | "git" | "network" | "spawn-subagent" | "continue-goal" | "pause-goal" | "resume-goal" | "rollback-to-checkpoint" | "reply-to-session" | "open-workbench" | "expand-scope")[];
            forbiddenActions: ("read-file" | "write-file" | "run-command" | "git" | "network" | "spawn-subagent" | "continue-goal" | "pause-goal" | "resume-goal" | "rollback-to-checkpoint" | "reply-to-session" | "open-workbench" | "expand-scope")[];
            verifyCommands: string[];
            limits: {
                maxFixRounds: number;
                maxStallRounds: number;
                maxConcurrentWritePerProject: number;
                maxChangedFilesPerTask: number;
                maxRunMinutes: number;
                plannerCallsPerDay: number;
                maxRunsPerDay: number;
            };
            permissionPreset: "read-only" | "workspace-write";
            commandMode: "confirmed" | "trusted";
            status: "active" | "revoked" | "superseded";
            grantedAt: number;
            hash: string;
            legacyAuthorization?: true | undefined;
            supersedes?: (string & z.core.$brand<"ScopeId">) | undefined;
            revokedAt?: number | undefined;
        } | null;
        activeScope: {
            id: string & z.core.$brand<"ScopeId">;
            goalId: string & z.core.$brand<"GoalId">;
            allowedPaths: string[];
            protectedPaths: string[];
            protectedNames: string[];
            allowedActions: ("read-file" | "write-file" | "run-command" | "git" | "network" | "spawn-subagent" | "continue-goal" | "pause-goal" | "resume-goal" | "rollback-to-checkpoint" | "reply-to-session" | "open-workbench" | "expand-scope")[];
            forbiddenActions: ("read-file" | "write-file" | "run-command" | "git" | "network" | "spawn-subagent" | "continue-goal" | "pause-goal" | "resume-goal" | "rollback-to-checkpoint" | "reply-to-session" | "open-workbench" | "expand-scope")[];
            verifyCommands: string[];
            limits: {
                maxFixRounds: number;
                maxStallRounds: number;
                maxConcurrentWritePerProject: number;
                maxChangedFilesPerTask: number;
                maxRunMinutes: number;
                plannerCallsPerDay: number;
                maxRunsPerDay: number;
            };
            permissionPreset: "read-only" | "workspace-write";
            commandMode: "confirmed" | "trusted";
            status: "active" | "revoked" | "superseded";
            grantedAt: number;
            hash: string;
            legacyAuthorization?: true | undefined;
            supersedes?: (string & z.core.$brand<"ScopeId">) | undefined;
            revokedAt?: number | undefined;
        } | null;
        tasks: {
            id: string & z.core.$brand<"TaskId">;
            goalId: string & z.core.$brand<"GoalId">;
            key: string;
            title: string;
            kind: "analyze" | "edit" | "test" | "doc" | "research";
            dependsOn: (string & z.core.$brand<"TaskId">)[];
            state: "PENDING" | "READY" | "RUNNING" | "VERIFYING" | "SUCCEEDED" | "WAITING_APPROVAL" | "BLOCKED" | "FAILED" | "UNKNOWN" | "PAUSED" | "CANCELLED";
            acceptance: string[];
            attempts: number;
            createdBy: "user" | "planner";
            createdAt: number;
            version: number;
            failureSummary?: string | undefined;
            unknownVerifications?: number | undefined;
        }[];
        runs: {
            run_id: string & z.core.$brand<"RunId">;
            taskId: string & z.core.$brand<"TaskId">;
            sessionId: string & z.core.$brand<"SessionId">;
            worktreePath: string;
            baseCommit: string;
            startedAt: number;
            status: "running" | "ended";
            toolCalls: number;
            deniedCalls: number;
            outcome: "UNKNOWN" | "PASS" | "FAIL" | "INSUFFICIENT_EVIDENCE" | "NOT_SCORABLE";
            endedAt?: number | undefined;
            runScope?: {
                id: string & z.core.$brand<"ScopeId">;
                goalId: string & z.core.$brand<"GoalId">;
                allowedPaths: string[];
                protectedPaths: string[];
                protectedNames: string[];
                allowedActions: ("read-file" | "write-file" | "run-command" | "git" | "network" | "spawn-subagent" | "continue-goal" | "pause-goal" | "resume-goal" | "rollback-to-checkpoint" | "reply-to-session" | "open-workbench" | "expand-scope")[];
                forbiddenActions: ("read-file" | "write-file" | "run-command" | "git" | "network" | "spawn-subagent" | "continue-goal" | "pause-goal" | "resume-goal" | "rollback-to-checkpoint" | "reply-to-session" | "open-workbench" | "expand-scope")[];
                verifyCommands: string[];
                limits: {
                    maxFixRounds: number;
                    maxStallRounds: number;
                    maxConcurrentWritePerProject: number;
                    maxChangedFilesPerTask: number;
                    maxRunMinutes: number;
                    plannerCallsPerDay: number;
                    maxRunsPerDay: number;
                };
                permissionPreset: "read-only" | "workspace-write";
                commandMode: "confirmed" | "trusted";
                status: "active" | "revoked" | "superseded";
                grantedAt: number;
                hash: string;
                originScopeId: string & z.core.$brand<"ScopeId">;
                originScopeHash: string;
                legacyAuthorization?: true | undefined;
                supersedes?: (string & z.core.$brand<"ScopeId">) | undefined;
                revokedAt?: number | undefined;
            } | undefined;
            reason?: string | undefined;
            finalReplyNonempty?: boolean | undefined;
        }[];
        checkpoints: {
            id: string & z.core.$brand<"CheckpointId">;
            goalId: string & z.core.$brand<"GoalId">;
            taskId: string & z.core.$brand<"TaskId">;
            commit: string;
            files: string[];
            diffStat: string;
            kind: "baseline" | "progress" | "verified" | "rollback" | "reconciled";
            createdAt: number;
        }[];
        globalPaused: boolean;
        autopilotEvents: {
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
        plannerState: {
            id: string & z.core.$brand<"GoalId">;
            day: string;
            calls: number;
            status: "continue" | "none" | "complete" | "need-user";
            frontier: string;
            reason: string;
            notBefore: number;
        } | null;
        verifications: {
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
        notifications: {
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
        evidence: {
            id: string & z.core.$brand<"EvidenceId">;
            runId: string & z.core.$brand<"RunId">;
            kind: "file" | "test-report" | "diff" | "metric" | "log";
            summary: string;
            verdict: "UNKNOWN" | "PASS" | "FAIL" | "INSUFFICIENT_EVIDENCE" | "NOT_SCORABLE";
            path?: string | undefined;
            hash?: string | undefined;
        }[];
        transitions: {
            id: string & z.core.$brand<"TransitionId">;
            entity: "task";
            entityId: string & z.core.$brand<"TaskId">;
            from: "PENDING" | "READY" | "RUNNING" | "VERIFYING" | "SUCCEEDED" | "WAITING_APPROVAL" | "BLOCKED" | "FAILED" | "UNKNOWN" | "PAUSED" | "CANCELLED";
            to: "PENDING" | "READY" | "RUNNING" | "VERIFYING" | "SUCCEEDED" | "WAITING_APPROVAL" | "BLOCKED" | "FAILED" | "UNKNOWN" | "PAUSED" | "CANCELLED";
            at: number;
            source: string;
            reason: string;
            runId?: (string & z.core.$brand<"RunId">) | undefined;
        }[];
    }>;
    private validateForm;
    /** Read persisted goal details and the current grant, including its revoked status. */
    detail(input: unknown, peer: ManagementActor): {
        goal: {
            id: string & z.core.$brand<"GoalId">;
            title: string;
            objective: string;
            expectedOutcome: string;
            projectRoot: string;
            acceptance: string[];
            stopConditions: string[];
            mode: "suggest" | "autonomous" | "high";
            status: "completed" | "cancelled" | "draft" | "active" | "paused" | "succeeded";
            autopilot: {
                enabled: boolean;
                enabledAt?: number | undefined;
                disabledReason?: string | undefined;
            };
            createdAt: number;
            version: number;
            inboxSessionId?: string | undefined;
            scopeId?: (string & z.core.$brand<"ScopeId">) | undefined;
            confirmedAt?: number | undefined;
            stalled?: number | undefined;
        };
        scope: {
            id: string & z.core.$brand<"ScopeId">;
            goalId: string & z.core.$brand<"GoalId">;
            allowedPaths: string[];
            protectedPaths: string[];
            protectedNames: string[];
            allowedActions: ("read-file" | "write-file" | "run-command" | "git" | "network" | "spawn-subagent" | "continue-goal" | "pause-goal" | "resume-goal" | "rollback-to-checkpoint" | "reply-to-session" | "open-workbench" | "expand-scope")[];
            forbiddenActions: ("read-file" | "write-file" | "run-command" | "git" | "network" | "spawn-subagent" | "continue-goal" | "pause-goal" | "resume-goal" | "rollback-to-checkpoint" | "reply-to-session" | "open-workbench" | "expand-scope")[];
            verifyCommands: string[];
            limits: {
                maxFixRounds: number;
                maxStallRounds: number;
                maxConcurrentWritePerProject: number;
                maxChangedFilesPerTask: number;
                maxRunMinutes: number;
                plannerCallsPerDay: number;
                maxRunsPerDay: number;
            };
            permissionPreset: "read-only" | "workspace-write";
            commandMode: "confirmed" | "trusted";
            status: "active" | "revoked" | "superseded";
            grantedAt: number;
            hash: string;
            legacyAuthorization?: true | undefined;
            supersedes?: (string & z.core.$brand<"ScopeId">) | undefined;
            revokedAt?: number | undefined;
        } | null;
        activeScope: {
            id: string & z.core.$brand<"ScopeId">;
            goalId: string & z.core.$brand<"GoalId">;
            allowedPaths: string[];
            protectedPaths: string[];
            protectedNames: string[];
            allowedActions: ("read-file" | "write-file" | "run-command" | "git" | "network" | "spawn-subagent" | "continue-goal" | "pause-goal" | "resume-goal" | "rollback-to-checkpoint" | "reply-to-session" | "open-workbench" | "expand-scope")[];
            forbiddenActions: ("read-file" | "write-file" | "run-command" | "git" | "network" | "spawn-subagent" | "continue-goal" | "pause-goal" | "resume-goal" | "rollback-to-checkpoint" | "reply-to-session" | "open-workbench" | "expand-scope")[];
            verifyCommands: string[];
            limits: {
                maxFixRounds: number;
                maxStallRounds: number;
                maxConcurrentWritePerProject: number;
                maxChangedFilesPerTask: number;
                maxRunMinutes: number;
                plannerCallsPerDay: number;
                maxRunsPerDay: number;
            };
            permissionPreset: "read-only" | "workspace-write";
            commandMode: "confirmed" | "trusted";
            status: "active" | "revoked" | "superseded";
            grantedAt: number;
            hash: string;
            legacyAuthorization?: true | undefined;
            supersedes?: (string & z.core.$brand<"ScopeId">) | undefined;
            revokedAt?: number | undefined;
        } | null;
        tasks: {
            id: string & z.core.$brand<"TaskId">;
            goalId: string & z.core.$brand<"GoalId">;
            key: string;
            title: string;
            kind: "analyze" | "edit" | "test" | "doc" | "research";
            dependsOn: (string & z.core.$brand<"TaskId">)[];
            state: "PENDING" | "READY" | "RUNNING" | "VERIFYING" | "SUCCEEDED" | "WAITING_APPROVAL" | "BLOCKED" | "FAILED" | "UNKNOWN" | "PAUSED" | "CANCELLED";
            acceptance: string[];
            attempts: number;
            createdBy: "user" | "planner";
            createdAt: number;
            version: number;
            failureSummary?: string | undefined;
            unknownVerifications?: number | undefined;
        }[];
        runs: {
            run_id: string & z.core.$brand<"RunId">;
            taskId: string & z.core.$brand<"TaskId">;
            sessionId: string & z.core.$brand<"SessionId">;
            worktreePath: string;
            baseCommit: string;
            startedAt: number;
            status: "running" | "ended";
            toolCalls: number;
            deniedCalls: number;
            outcome: "UNKNOWN" | "PASS" | "FAIL" | "INSUFFICIENT_EVIDENCE" | "NOT_SCORABLE";
            endedAt?: number | undefined;
            runScope?: {
                id: string & z.core.$brand<"ScopeId">;
                goalId: string & z.core.$brand<"GoalId">;
                allowedPaths: string[];
                protectedPaths: string[];
                protectedNames: string[];
                allowedActions: ("read-file" | "write-file" | "run-command" | "git" | "network" | "spawn-subagent" | "continue-goal" | "pause-goal" | "resume-goal" | "rollback-to-checkpoint" | "reply-to-session" | "open-workbench" | "expand-scope")[];
                forbiddenActions: ("read-file" | "write-file" | "run-command" | "git" | "network" | "spawn-subagent" | "continue-goal" | "pause-goal" | "resume-goal" | "rollback-to-checkpoint" | "reply-to-session" | "open-workbench" | "expand-scope")[];
                verifyCommands: string[];
                limits: {
                    maxFixRounds: number;
                    maxStallRounds: number;
                    maxConcurrentWritePerProject: number;
                    maxChangedFilesPerTask: number;
                    maxRunMinutes: number;
                    plannerCallsPerDay: number;
                    maxRunsPerDay: number;
                };
                permissionPreset: "read-only" | "workspace-write";
                commandMode: "confirmed" | "trusted";
                status: "active" | "revoked" | "superseded";
                grantedAt: number;
                hash: string;
                originScopeId: string & z.core.$brand<"ScopeId">;
                originScopeHash: string;
                legacyAuthorization?: true | undefined;
                supersedes?: (string & z.core.$brand<"ScopeId">) | undefined;
                revokedAt?: number | undefined;
            } | undefined;
            reason?: string | undefined;
            finalReplyNonempty?: boolean | undefined;
        }[];
        checkpoints: {
            id: string & z.core.$brand<"CheckpointId">;
            goalId: string & z.core.$brand<"GoalId">;
            taskId: string & z.core.$brand<"TaskId">;
            commit: string;
            files: string[];
            diffStat: string;
            kind: "baseline" | "progress" | "verified" | "rollback" | "reconciled";
            createdAt: number;
        }[];
        globalPaused: boolean;
        autopilotEvents: {
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
        plannerState: {
            id: string & z.core.$brand<"GoalId">;
            day: string;
            calls: number;
            status: "continue" | "none" | "complete" | "need-user";
            frontier: string;
            reason: string;
            notBefore: number;
        } | null;
        verifications: {
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
        notifications: {
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
        evidence: {
            id: string & z.core.$brand<"EvidenceId">;
            runId: string & z.core.$brand<"RunId">;
            kind: "file" | "test-report" | "diff" | "metric" | "log";
            summary: string;
            verdict: "UNKNOWN" | "PASS" | "FAIL" | "INSUFFICIENT_EVIDENCE" | "NOT_SCORABLE";
            path?: string | undefined;
            hash?: string | undefined;
        }[];
        transitions: {
            id: string & z.core.$brand<"TransitionId">;
            entity: "task";
            entityId: string & z.core.$brand<"TaskId">;
            from: "PENDING" | "READY" | "RUNNING" | "VERIFYING" | "SUCCEEDED" | "WAITING_APPROVAL" | "BLOCKED" | "FAILED" | "UNKNOWN" | "PAUSED" | "CANCELLED";
            to: "PENDING" | "READY" | "RUNNING" | "VERIFYING" | "SUCCEEDED" | "WAITING_APPROVAL" | "BLOCKED" | "FAILED" | "UNKNOWN" | "PAUSED" | "CANCELLED";
            at: number;
            source: string;
            reason: string;
            runId?: (string & z.core.$brand<"RunId">) | undefined;
        }[];
    };
    /** Pause or resume only the selected goal, preserving its task states. */
    setPaused(input: unknown, peer: ManagementActor): {
        goal: {
            id: string & z.core.$brand<"GoalId">;
            title: string;
            objective: string;
            expectedOutcome: string;
            projectRoot: string;
            acceptance: string[];
            stopConditions: string[];
            mode: "suggest" | "autonomous" | "high";
            status: "completed" | "cancelled" | "draft" | "active" | "paused" | "succeeded";
            autopilot: {
                enabled: boolean;
                enabledAt?: number | undefined;
                disabledReason?: string | undefined;
            };
            createdAt: number;
            version: number;
            inboxSessionId?: string | undefined;
            scopeId?: (string & z.core.$brand<"ScopeId">) | undefined;
            confirmedAt?: number | undefined;
            stalled?: number | undefined;
        };
        scope: {
            id: string & z.core.$brand<"ScopeId">;
            goalId: string & z.core.$brand<"GoalId">;
            allowedPaths: string[];
            protectedPaths: string[];
            protectedNames: string[];
            allowedActions: ("read-file" | "write-file" | "run-command" | "git" | "network" | "spawn-subagent" | "continue-goal" | "pause-goal" | "resume-goal" | "rollback-to-checkpoint" | "reply-to-session" | "open-workbench" | "expand-scope")[];
            forbiddenActions: ("read-file" | "write-file" | "run-command" | "git" | "network" | "spawn-subagent" | "continue-goal" | "pause-goal" | "resume-goal" | "rollback-to-checkpoint" | "reply-to-session" | "open-workbench" | "expand-scope")[];
            verifyCommands: string[];
            limits: {
                maxFixRounds: number;
                maxStallRounds: number;
                maxConcurrentWritePerProject: number;
                maxChangedFilesPerTask: number;
                maxRunMinutes: number;
                plannerCallsPerDay: number;
                maxRunsPerDay: number;
            };
            permissionPreset: "read-only" | "workspace-write";
            commandMode: "confirmed" | "trusted";
            status: "active" | "revoked" | "superseded";
            grantedAt: number;
            hash: string;
            legacyAuthorization?: true | undefined;
            supersedes?: (string & z.core.$brand<"ScopeId">) | undefined;
            revokedAt?: number | undefined;
        } | null;
        activeScope: {
            id: string & z.core.$brand<"ScopeId">;
            goalId: string & z.core.$brand<"GoalId">;
            allowedPaths: string[];
            protectedPaths: string[];
            protectedNames: string[];
            allowedActions: ("read-file" | "write-file" | "run-command" | "git" | "network" | "spawn-subagent" | "continue-goal" | "pause-goal" | "resume-goal" | "rollback-to-checkpoint" | "reply-to-session" | "open-workbench" | "expand-scope")[];
            forbiddenActions: ("read-file" | "write-file" | "run-command" | "git" | "network" | "spawn-subagent" | "continue-goal" | "pause-goal" | "resume-goal" | "rollback-to-checkpoint" | "reply-to-session" | "open-workbench" | "expand-scope")[];
            verifyCommands: string[];
            limits: {
                maxFixRounds: number;
                maxStallRounds: number;
                maxConcurrentWritePerProject: number;
                maxChangedFilesPerTask: number;
                maxRunMinutes: number;
                plannerCallsPerDay: number;
                maxRunsPerDay: number;
            };
            permissionPreset: "read-only" | "workspace-write";
            commandMode: "confirmed" | "trusted";
            status: "active" | "revoked" | "superseded";
            grantedAt: number;
            hash: string;
            legacyAuthorization?: true | undefined;
            supersedes?: (string & z.core.$brand<"ScopeId">) | undefined;
            revokedAt?: number | undefined;
        } | null;
        tasks: {
            id: string & z.core.$brand<"TaskId">;
            goalId: string & z.core.$brand<"GoalId">;
            key: string;
            title: string;
            kind: "analyze" | "edit" | "test" | "doc" | "research";
            dependsOn: (string & z.core.$brand<"TaskId">)[];
            state: "PENDING" | "READY" | "RUNNING" | "VERIFYING" | "SUCCEEDED" | "WAITING_APPROVAL" | "BLOCKED" | "FAILED" | "UNKNOWN" | "PAUSED" | "CANCELLED";
            acceptance: string[];
            attempts: number;
            createdBy: "user" | "planner";
            createdAt: number;
            version: number;
            failureSummary?: string | undefined;
            unknownVerifications?: number | undefined;
        }[];
        runs: {
            run_id: string & z.core.$brand<"RunId">;
            taskId: string & z.core.$brand<"TaskId">;
            sessionId: string & z.core.$brand<"SessionId">;
            worktreePath: string;
            baseCommit: string;
            startedAt: number;
            status: "running" | "ended";
            toolCalls: number;
            deniedCalls: number;
            outcome: "UNKNOWN" | "PASS" | "FAIL" | "INSUFFICIENT_EVIDENCE" | "NOT_SCORABLE";
            endedAt?: number | undefined;
            runScope?: {
                id: string & z.core.$brand<"ScopeId">;
                goalId: string & z.core.$brand<"GoalId">;
                allowedPaths: string[];
                protectedPaths: string[];
                protectedNames: string[];
                allowedActions: ("read-file" | "write-file" | "run-command" | "git" | "network" | "spawn-subagent" | "continue-goal" | "pause-goal" | "resume-goal" | "rollback-to-checkpoint" | "reply-to-session" | "open-workbench" | "expand-scope")[];
                forbiddenActions: ("read-file" | "write-file" | "run-command" | "git" | "network" | "spawn-subagent" | "continue-goal" | "pause-goal" | "resume-goal" | "rollback-to-checkpoint" | "reply-to-session" | "open-workbench" | "expand-scope")[];
                verifyCommands: string[];
                limits: {
                    maxFixRounds: number;
                    maxStallRounds: number;
                    maxConcurrentWritePerProject: number;
                    maxChangedFilesPerTask: number;
                    maxRunMinutes: number;
                    plannerCallsPerDay: number;
                    maxRunsPerDay: number;
                };
                permissionPreset: "read-only" | "workspace-write";
                commandMode: "confirmed" | "trusted";
                status: "active" | "revoked" | "superseded";
                grantedAt: number;
                hash: string;
                originScopeId: string & z.core.$brand<"ScopeId">;
                originScopeHash: string;
                legacyAuthorization?: true | undefined;
                supersedes?: (string & z.core.$brand<"ScopeId">) | undefined;
                revokedAt?: number | undefined;
            } | undefined;
            reason?: string | undefined;
            finalReplyNonempty?: boolean | undefined;
        }[];
        checkpoints: {
            id: string & z.core.$brand<"CheckpointId">;
            goalId: string & z.core.$brand<"GoalId">;
            taskId: string & z.core.$brand<"TaskId">;
            commit: string;
            files: string[];
            diffStat: string;
            kind: "baseline" | "progress" | "verified" | "rollback" | "reconciled";
            createdAt: number;
        }[];
        globalPaused: boolean;
        autopilotEvents: {
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
        plannerState: {
            id: string & z.core.$brand<"GoalId">;
            day: string;
            calls: number;
            status: "continue" | "none" | "complete" | "need-user";
            frontier: string;
            reason: string;
            notBefore: number;
        } | null;
        verifications: {
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
        notifications: {
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
        evidence: {
            id: string & z.core.$brand<"EvidenceId">;
            runId: string & z.core.$brand<"RunId">;
            kind: "file" | "test-report" | "diff" | "metric" | "log";
            summary: string;
            verdict: "UNKNOWN" | "PASS" | "FAIL" | "INSUFFICIENT_EVIDENCE" | "NOT_SCORABLE";
            path?: string | undefined;
            hash?: string | undefined;
        }[];
        transitions: {
            id: string & z.core.$brand<"TransitionId">;
            entity: "task";
            entityId: string & z.core.$brand<"TaskId">;
            from: "PENDING" | "READY" | "RUNNING" | "VERIFYING" | "SUCCEEDED" | "WAITING_APPROVAL" | "BLOCKED" | "FAILED" | "UNKNOWN" | "PAUSED" | "CANCELLED";
            to: "PENDING" | "READY" | "RUNNING" | "VERIFYING" | "SUCCEEDED" | "WAITING_APPROVAL" | "BLOCKED" | "FAILED" | "UNKNOWN" | "PAUSED" | "CANCELLED";
            at: number;
            source: string;
            reason: string;
            runId?: (string & z.core.$brand<"RunId">) | undefined;
        }[];
    };
    /** Cancel all requests and clear the proposal cache when the plugin unloads. */
    dispose(): void;
    private expire;
}
export type GoalDetail = ReturnType<GoalIntake['detail']>;
export {};
