import { z } from 'zod';
export declare const LanguageSchema: z.ZodEnum<{
    "zh-CN": "zh-CN";
    en: "en";
    auto: "auto";
}>;
export declare const EmptyRequestSchema: z.ZodObject<{}, z.core.$strict>;
export declare const DailyBriefPanelSchema: z.ZodObject<{
    enabled: z.ZodBoolean;
    today: z.ZodOptional<z.ZodObject<{
        date: z.ZodISODate;
        generatedAt: z.ZodNumber;
        from: z.ZodNumber;
        to: z.ZodNumber;
        text: z.ZodString;
        deliveredAt: z.ZodOptional<z.ZodNumber>;
        decisions: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            goalId: z.ZodString;
            title: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strict>>;
    records: z.ZodArray<z.ZodObject<{
        date: z.ZodISODate;
        generatedAt: z.ZodNumber;
        from: z.ZodNumber;
        to: z.ZodNumber;
        text: z.ZodString;
        deliveredAt: z.ZodOptional<z.ZodNumber>;
        decisions: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            goalId: z.ZodString;
            title: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const LanguageRequestSchema: z.ZodObject<{
    language: z.ZodEnum<{
        "zh-CN": "zh-CN";
        en: "en";
        auto: "auto";
    }>;
}, z.core.$strict>;
export declare const PausedSchema: z.ZodObject<{
    paused: z.ZodBoolean;
}, z.core.$strict>;
export declare const RevokeScopeSchema: z.ZodObject<{
    scopeId: z.core.$ZodBranded<z.ZodString, "ScopeId", "out">;
}, z.core.$strict>;
export declare const TakeoverSchema: z.ZodObject<{
    confirm: z.ZodLiteral<true>;
}, z.core.$strict>;
export declare const ExecuteNextSchema: z.ZodObject<{
    goalId: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
}, z.core.$strict>;
export declare const ExecuteResultSchema: z.ZodObject<{
    started: z.ZodBoolean;
    reason: z.ZodString;
    runId: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const VerifyTaskSchema: z.ZodObject<{
    taskId: z.core.$ZodBranded<z.ZodString, "TaskId", "out">;
}, z.core.$strict>;
export declare const ResolveDecisionSchema: z.ZodObject<{
    notificationId: z.ZodString;
    choice: z.ZodEnum<{
        "pause-goal": "pause-goal";
        "resume-goal": "resume-goal";
        abandon: "abandon";
        "change-direction": "change-direction";
        verify: "verify";
        rollback: "rollback";
        retry: "retry";
        accept: "accept";
        "view-diff": "view-diff";
    }>;
    confirm: z.ZodOptional<z.ZodLiteral<true>>;
    goalVersion: z.ZodOptional<z.ZodInt>;
    direction: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const VerificationLogSchema: z.ZodObject<{
    runId: z.ZodString;
    phase: z.ZodEnum<{
        baseline: "baseline";
        current: "current";
    }>;
    index: z.ZodInt;
}, z.core.$strict>;
export declare const SetAutopilotSchema: z.ZodObject<{
    goalId: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
    enabled: z.ZodBoolean;
    confirm: z.ZodOptional<z.ZodBoolean>;
    scopeHash: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const TraceRequestSchema: z.ZodObject<{
    goalId: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
}, z.core.$strict>;
export declare const TraceResponseSchema: z.ZodObject<{
    markdown: z.ZodString;
    filename: z.ZodString;
}, z.core.$strict>;
export declare const NotificationCenterRequestSchema: z.ZodObject<{
    goalId: z.ZodOptional<z.core.$ZodBranded<z.ZodString, "GoalId", "out">>;
}, z.core.$strict>;
export declare const NotificationCenterSchema: z.ZodObject<{
    preferences: z.ZodObject<{
        quietHours: z.ZodOptional<z.ZodObject<{
            start: z.ZodString;
            end: z.ZodString;
        }, z.core.$strict>>;
        maxPerHour: z.ZodDefault<z.ZodInt>;
        muted: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strict>;
    items: z.ZodArray<z.ZodObject<{
        notification: z.ZodObject<{
            id: z.core.$ZodBranded<z.ZodString, "NotificationId", "out">;
            kind: z.ZodEnum<{
                progress: "progress";
                decision: "decision";
                blocked: "blocked";
                info: "info";
            }>;
            priority: z.ZodEnum<{
                high: "high";
                low: "low";
                normal: "normal";
            }>;
            dedupeKey: z.ZodString;
            goalId: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
            taskId: z.ZodOptional<z.core.$ZodBranded<z.ZodString, "TaskId", "out">>;
            channel: z.ZodEnum<{
                "dsh-question": "dsh-question";
                panel: "panel";
                system: "system";
            }>;
            createdAt: z.ZodNumber;
            runId: z.ZodOptional<z.ZodString>;
            taskVersion: z.ZodOptional<z.ZodNumber>;
            reason: z.ZodOptional<z.ZodString>;
            deliveryAttemptedAt: z.ZodOptional<z.ZodNumber>;
            deliveryState: z.ZodOptional<z.ZodEnum<{
                cancelled: "cancelled";
                failed: "failed";
                delivered: "delivered";
                held: "held";
                muted: "muted";
                digest: "digest";
                dropped: "dropped";
            }>>;
            deliveryReason: z.ZodOptional<z.ZodString>;
            nextDeliveryAt: z.ZodOptional<z.ZodNumber>;
            remindAt: z.ZodOptional<z.ZodNumber>;
            suggestionIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
            routingSuggestionId: z.ZodOptional<z.ZodString>;
            lastSelectionId: z.ZodOptional<z.ZodString>;
            resolvedSource: z.ZodOptional<z.ZodEnum<{
                panel: "panel";
                inbox: "inbox";
            }>>;
            choices: z.ZodOptional<z.ZodArray<z.ZodEnum<{
                "pause-goal": "pause-goal";
                "resume-goal": "resume-goal";
                abandon: "abandon";
                "change-direction": "change-direction";
                verify: "verify";
                rollback: "rollback";
                retry: "retry";
                accept: "accept";
                "view-diff": "view-diff";
            }>>>;
            expiresAt: z.ZodOptional<z.ZodNumber>;
            resolvedReason: z.ZodOptional<z.ZodEnum<{
                superseded: "superseded";
                expired: "expired";
            }>>;
            resolvedChoice: z.ZodOptional<z.ZodEnum<{
                "pause-goal": "pause-goal";
                "resume-goal": "resume-goal";
                abandon: "abandon";
                "change-direction": "change-direction";
                verify: "verify";
                rollback: "rollback";
                retry: "retry";
                accept: "accept";
                "view-diff": "view-diff";
            }>>;
            resolvedAt: z.ZodOptional<z.ZodNumber>;
            deliveredAt: z.ZodOptional<z.ZodNumber>;
            snoozedUntil: z.ZodOptional<z.ZodNumber>;
            readAt: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strict>;
        copy: z.ZodObject<{
            header: z.ZodString;
            question: z.ZodString;
            detail: z.ZodString;
        }, z.core.$strict>;
        suggestions: z.ZodArray<z.ZodObject<{
            id: z.core.$ZodBranded<z.ZodString, "SuggestionId", "out">;
            notificationId: z.core.$ZodBranded<z.ZodString, "NotificationId", "out">;
            label: z.ZodString;
            description: z.ZodOptional<z.ZodString>;
            intent: z.ZodUnion<readonly [z.ZodDiscriminatedUnion<[z.ZodObject<{
                type: z.ZodLiteral<"read-file">;
                path: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                type: z.ZodLiteral<"write-file">;
                path: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                type: z.ZodLiteral<"run-command">;
                cmdline: z.ZodString;
                cwd: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                type: z.ZodLiteral<"git">;
                subcommand: z.ZodString;
                args: z.ZodArray<z.ZodString>;
            }, z.core.$strict>, z.ZodObject<{
                type: z.ZodLiteral<"spawn-subagent">;
            }, z.core.$strict>, z.ZodObject<{
                type: z.ZodLiteral<"network">;
                url: z.ZodURL;
                method: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                type: z.ZodLiteral<"continue-goal">;
                goalId: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
            }, z.core.$strict>, z.ZodObject<{
                type: z.ZodLiteral<"pause-goal">;
                goalId: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
            }, z.core.$strict>, z.ZodObject<{
                type: z.ZodLiteral<"resume-goal">;
                goalId: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
            }, z.core.$strict>, z.ZodObject<{
                type: z.ZodLiteral<"rollback-to-checkpoint">;
                checkpointId: z.core.$ZodBranded<z.ZodString, "CheckpointId", "out">;
            }, z.core.$strict>, z.ZodObject<{
                type: z.ZodLiteral<"reply-to-session">;
                sessionId: z.core.$ZodBranded<z.ZodString, "SessionId", "out">;
                text: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                type: z.ZodLiteral<"open-workbench">;
                sessionId: z.ZodOptional<z.core.$ZodBranded<z.ZodString, "SessionId", "out">>;
            }, z.core.$strict>, z.ZodObject<{
                type: z.ZodLiteral<"expand-scope">;
                goalId: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
                patch: z.ZodObject<{
                    allowedPaths: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    protectedPaths: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    allowedActions: z.ZodOptional<z.ZodArray<z.ZodEnum<{
                        "read-file": "read-file";
                        "write-file": "write-file";
                        "run-command": "run-command";
                        git: "git";
                        network: "network";
                        "spawn-subagent": "spawn-subagent";
                        "continue-goal": "continue-goal";
                        "pause-goal": "pause-goal";
                        "resume-goal": "resume-goal";
                        "rollback-to-checkpoint": "rollback-to-checkpoint";
                        "reply-to-session": "reply-to-session";
                        "open-workbench": "open-workbench";
                        "expand-scope": "expand-scope";
                    }>>>;
                    forbiddenActions: z.ZodOptional<z.ZodArray<z.ZodEnum<{
                        "read-file": "read-file";
                        "write-file": "write-file";
                        "run-command": "run-command";
                        git: "git";
                        network: "network";
                        "spawn-subagent": "spawn-subagent";
                        "continue-goal": "continue-goal";
                        "pause-goal": "pause-goal";
                        "resume-goal": "resume-goal";
                        "rollback-to-checkpoint": "rollback-to-checkpoint";
                        "reply-to-session": "reply-to-session";
                        "open-workbench": "open-workbench";
                        "expand-scope": "expand-scope";
                    }>>>;
                    verifyCommands: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    permissionPreset: z.ZodOptional<z.ZodEnum<{
                        "read-only": "read-only";
                        "workspace-write": "workspace-write";
                    }>>;
                    limits: z.ZodOptional<z.ZodObject<{
                        maxFixRounds: z.ZodOptional<z.ZodDefault<z.ZodInt>>;
                        maxStallRounds: z.ZodOptional<z.ZodDefault<z.ZodInt>>;
                        maxConcurrentWritePerProject: z.ZodOptional<z.ZodDefault<z.ZodInt>>;
                        maxChangedFilesPerTask: z.ZodOptional<z.ZodDefault<z.ZodInt>>;
                        maxRunMinutes: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
                        plannerCallsPerDay: z.ZodOptional<z.ZodDefault<z.ZodInt>>;
                        maxRunsPerDay: z.ZodOptional<z.ZodDefault<z.ZodInt>>;
                    }, z.core.$strict>>;
                }, z.core.$strict>;
            }, z.core.$strict>], "type">, z.ZodObject<{
                type: z.ZodLiteral<"notification-action">;
                action: z.ZodEnum<{
                    snooze: "snooze";
                    "open-panel": "open-panel";
                }>;
            }, z.core.$strict>, z.ZodObject<{
                type: z.ZodLiteral<"panel-decision">;
                choice: z.ZodEnum<{
                    "pause-goal": "pause-goal";
                    "resume-goal": "resume-goal";
                    abandon: "abandon";
                    "change-direction": "change-direction";
                    verify: "verify";
                    rollback: "rollback";
                    retry: "retry";
                    accept: "accept";
                    "view-diff": "view-diff";
                }>;
            }, z.core.$strict>]>;
            riskLevel: z.ZodEnum<{
                high: "high";
                low: "low";
                medium: "medium";
            }>;
            expiresAt: z.ZodNumber;
            bindTo: z.ZodUnion<readonly [z.ZodObject<{
                goalId: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
                notificationId: z.core.$ZodBranded<z.ZodString, "NotificationId", "out">;
                taskId: z.ZodOptional<z.core.$ZodBranded<z.ZodString, "TaskId", "out">>;
                taskVersion: z.ZodOptional<z.ZodNumber>;
                goalVersion: z.ZodOptional<z.ZodNumber>;
                scopeHash: z.ZodString;
                scopeId: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                goalId: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
            }, z.core.$strict>, z.ZodObject<{
                goalId: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
                taskId: z.core.$ZodBranded<z.ZodString, "TaskId", "out">;
                taskVersion: z.ZodNumber;
                sessionId: z.core.$ZodBranded<z.ZodString, "SessionId", "out">;
            }, z.core.$strict>]>;
            consumedAt: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strict>>;
        notes: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            goalId: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
            notificationId: z.ZodOptional<z.core.$ZodBranded<z.ZodString, "NotificationId", "out">>;
            source: z.ZodOptional<z.ZodEnum<{
                companion: "companion";
                decision: "decision";
            }>>;
            at: z.ZodNumber;
            text: z.ZodString;
        }, z.core.$strict>>;
        choices: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            goalId: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
            notificationId: z.core.$ZodBranded<z.ZodString, "NotificationId", "out">;
            suggestionId: z.ZodString;
            reason: z.ZodString;
            action: z.ZodString;
            source: z.ZodEnum<{
                panel: "panel";
                inbox: "inbox";
            }>;
            at: z.ZodNumber;
            result: z.ZodEnum<{
                succeeded: "succeeded";
                failed: "failed";
                pending: "pending";
            }>;
            detail: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>;
        goal: z.ZodOptional<z.ZodObject<{
            id: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
            title: z.ZodString;
            status: z.ZodEnum<{
                draft: "draft";
                active: "active";
                paused: "paused";
                succeeded: "succeeded";
                completed: "completed";
                cancelled: "cancelled";
            }>;
            version: z.ZodNumber;
        }, z.core.$strict>>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const RouteSuggestionSchema: z.ZodObject<{
    suggestionId: z.ZodString;
    confirm: z.ZodOptional<z.ZodLiteral<true>>;
    goalVersion: z.ZodOptional<z.ZodInt>;
    direction: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const RouteResultSchema: z.ZodObject<{
    ok: z.ZodBoolean;
    reason: z.ZodOptional<z.ZodString>;
    goalId: z.ZodOptional<z.core.$ZodBranded<z.ZodString, "GoalId", "out">>;
    openPanel: z.ZodOptional<z.ZodBoolean>;
    state: z.ZodOptional<z.ZodString>;
    files: z.ZodOptional<z.ZodArray<z.ZodString>>;
    stat: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const ReminderSchema: z.ZodObject<{
    notificationId: z.ZodString;
}, z.core.$strict>;
export declare const PANEL_METHODS: readonly ["codex", "codex-settings", "everyday-approvals", "everyday-approval-settings", "daily-brief", "daily-brief-settings", "companion-archives", "companion-restore", "companion-archive-settings", "recall-list", "recall-delete", "recall-clear", "recall-settings", "companion-drafts", "companion-action-events", "memory-proposals", "memory-proposal-resolve", "memories-consolidate", "memory-draft-settings", "memories-list", "memory-update", "memory-archive", "memory-restore", "memory-delete", "memories-export", "notification-center", "notification-preferences", "route-suggestion", "remind-notification", "notification-navigation", "set-autopilot", "export-trace", "verify-task", "reconcile-task", "resolve-decision", "verification-log", "execute-next", "status", "goals", "language", "set-paused", "revoke-scope", "takeover-store", "draft-goal", "draft-status", "cancel-draft", "project-facts", "confirm-goal", "reauthorize-goal", "goal-detail", "set-goal-paused", "companion-rebuild"];
export type PanelMethod = (typeof PANEL_METHODS)[number];
export declare const CompanionDraftsSchema: z.ZodArray<z.ZodObject<{
    draftId: z.ZodString;
    proposalId: z.ZodString;
    sessionId: z.ZodString;
    confirmedAt: z.ZodNumber;
    text: z.ZodString;
    projectRoot: z.ZodString;
    state: z.ZodEnum<{
        running: "running";
        failed: "failed";
        ready: "ready";
    }>;
}, z.core.$strict>>;
export declare const ProjectFactsSchema: z.ZodObject<{
    projectRoot: z.ZodString;
    isGit: z.ZodBoolean;
    clean: z.ZodBoolean;
    branch: z.ZodNullable<z.ZodString>;
    candidateCommands: z.ZodArray<z.ZodObject<{
        command: z.ZodString;
        class: z.ZodEnum<{
            safe: "safe";
            "needs-approval": "needs-approval";
            forbidden: "forbidden";
        }>;
        reasons: z.ZodArray<z.ZodString>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const DraftStatusSchema: z.ZodObject<{
    state: z.ZodEnum<{
        running: "running";
        failed: "failed";
        ready: "ready";
    }>;
    draft: z.ZodOptional<z.ZodObject<{
        proposedVerifyCommands: z.ZodArray<z.ZodString>;
        proposedProtectedPaths: z.ZodArray<z.ZodString>;
        title: z.ZodString;
        objective: z.ZodString;
        expectedOutcome: z.ZodString;
        acceptance: z.ZodArray<z.ZodString>;
        stopConditions: z.ZodArray<z.ZodString>;
        mode: z.ZodEnum<{
            suggest: "suggest";
            autonomous: "autonomous";
            high: "high";
        }>;
        initialTasks: z.ZodArray<z.ZodObject<{
            title: z.ZodString;
            kind: z.ZodEnum<{
                analyze: "analyze";
                edit: "edit";
                test: "test";
                doc: "doc";
                research: "research";
            }>;
            dependsOnIndex: z.ZodArray<z.ZodInt>;
        }, z.core.$strict>>;
    }, z.core.$strict>>;
    projectFacts: z.ZodOptional<z.ZodObject<{
        projectRoot: z.ZodString;
        isGit: z.ZodBoolean;
        clean: z.ZodBoolean;
        branch: z.ZodNullable<z.ZodString>;
        candidateCommands: z.ZodArray<z.ZodObject<{
            command: z.ZodString;
            class: z.ZodEnum<{
                safe: "safe";
                "needs-approval": "needs-approval";
                forbidden: "forbidden";
            }>;
            reasons: z.ZodArray<z.ZodString>;
        }, z.core.$strict>>;
    }, z.core.$strict>>;
    error: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const DraftStartedSchema: z.ZodObject<{
    draftId: z.ZodString;
}, z.core.$strict>;
export declare const GoalDetailSchema: z.ZodObject<{
    goal: z.ZodObject<{
        id: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
        title: z.ZodString;
        objective: z.ZodString;
        expectedOutcome: z.ZodString;
        projectRoot: z.ZodString;
        acceptance: z.ZodArray<z.ZodString>;
        stopConditions: z.ZodArray<z.ZodString>;
        mode: z.ZodEnum<{
            suggest: "suggest";
            autonomous: "autonomous";
            high: "high";
        }>;
        status: z.ZodEnum<{
            draft: "draft";
            active: "active";
            paused: "paused";
            succeeded: "succeeded";
            completed: "completed";
            cancelled: "cancelled";
        }>;
        autopilot: z.ZodDefault<z.ZodObject<{
            enabled: z.ZodBoolean;
            enabledAt: z.ZodOptional<z.ZodNumber>;
            disabledReason: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>;
        inboxSessionId: z.ZodOptional<z.ZodString>;
        scopeId: z.ZodOptional<z.core.$ZodBranded<z.ZodString, "ScopeId", "out">>;
        createdAt: z.ZodNumber;
        confirmedAt: z.ZodOptional<z.ZodNumber>;
        stalled: z.ZodOptional<z.ZodInt>;
        version: z.ZodNumber;
    }, z.core.$strict>;
    globalPaused: z.ZodDefault<z.ZodBoolean>;
    scope: z.ZodNullable<z.ZodObject<{
        id: z.core.$ZodBranded<z.ZodString, "ScopeId", "out">;
        goalId: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
        allowedPaths: z.ZodArray<z.ZodString>;
        protectedPaths: z.ZodArray<z.ZodString>;
        protectedNames: z.ZodDefault<z.ZodArray<z.ZodString>>;
        legacyAuthorization: z.ZodOptional<z.ZodLiteral<true>>;
        allowedActions: z.ZodArray<z.ZodEnum<{
            "read-file": "read-file";
            "write-file": "write-file";
            "run-command": "run-command";
            git: "git";
            network: "network";
            "spawn-subagent": "spawn-subagent";
            "continue-goal": "continue-goal";
            "pause-goal": "pause-goal";
            "resume-goal": "resume-goal";
            "rollback-to-checkpoint": "rollback-to-checkpoint";
            "reply-to-session": "reply-to-session";
            "open-workbench": "open-workbench";
            "expand-scope": "expand-scope";
        }>>;
        forbiddenActions: z.ZodArray<z.ZodEnum<{
            "read-file": "read-file";
            "write-file": "write-file";
            "run-command": "run-command";
            git: "git";
            network: "network";
            "spawn-subagent": "spawn-subagent";
            "continue-goal": "continue-goal";
            "pause-goal": "pause-goal";
            "resume-goal": "resume-goal";
            "rollback-to-checkpoint": "rollback-to-checkpoint";
            "reply-to-session": "reply-to-session";
            "open-workbench": "open-workbench";
            "expand-scope": "expand-scope";
        }>>;
        verifyCommands: z.ZodArray<z.ZodString>;
        limits: z.ZodDefault<z.ZodObject<{
            maxFixRounds: z.ZodDefault<z.ZodInt>;
            maxStallRounds: z.ZodDefault<z.ZodInt>;
            maxConcurrentWritePerProject: z.ZodDefault<z.ZodInt>;
            maxChangedFilesPerTask: z.ZodDefault<z.ZodInt>;
            maxRunMinutes: z.ZodDefault<z.ZodNumber>;
            plannerCallsPerDay: z.ZodDefault<z.ZodInt>;
            maxRunsPerDay: z.ZodDefault<z.ZodInt>;
        }, z.core.$strict>>;
        permissionPreset: z.ZodEnum<{
            "read-only": "read-only";
            "workspace-write": "workspace-write";
        }>;
        commandMode: z.ZodDefault<z.ZodEnum<{
            confirmed: "confirmed";
            trusted: "trusted";
        }>>;
        supersedes: z.ZodOptional<z.core.$ZodBranded<z.ZodString, "ScopeId", "out">>;
        status: z.ZodEnum<{
            active: "active";
            revoked: "revoked";
            superseded: "superseded";
        }>;
        grantedAt: z.ZodNumber;
        revokedAt: z.ZodOptional<z.ZodNumber>;
        hash: z.ZodString;
    }, z.core.$strict>>;
    activeScope: z.ZodNullable<z.ZodObject<{
        id: z.core.$ZodBranded<z.ZodString, "ScopeId", "out">;
        goalId: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
        allowedPaths: z.ZodArray<z.ZodString>;
        protectedPaths: z.ZodArray<z.ZodString>;
        protectedNames: z.ZodDefault<z.ZodArray<z.ZodString>>;
        legacyAuthorization: z.ZodOptional<z.ZodLiteral<true>>;
        allowedActions: z.ZodArray<z.ZodEnum<{
            "read-file": "read-file";
            "write-file": "write-file";
            "run-command": "run-command";
            git: "git";
            network: "network";
            "spawn-subagent": "spawn-subagent";
            "continue-goal": "continue-goal";
            "pause-goal": "pause-goal";
            "resume-goal": "resume-goal";
            "rollback-to-checkpoint": "rollback-to-checkpoint";
            "reply-to-session": "reply-to-session";
            "open-workbench": "open-workbench";
            "expand-scope": "expand-scope";
        }>>;
        forbiddenActions: z.ZodArray<z.ZodEnum<{
            "read-file": "read-file";
            "write-file": "write-file";
            "run-command": "run-command";
            git: "git";
            network: "network";
            "spawn-subagent": "spawn-subagent";
            "continue-goal": "continue-goal";
            "pause-goal": "pause-goal";
            "resume-goal": "resume-goal";
            "rollback-to-checkpoint": "rollback-to-checkpoint";
            "reply-to-session": "reply-to-session";
            "open-workbench": "open-workbench";
            "expand-scope": "expand-scope";
        }>>;
        verifyCommands: z.ZodArray<z.ZodString>;
        limits: z.ZodDefault<z.ZodObject<{
            maxFixRounds: z.ZodDefault<z.ZodInt>;
            maxStallRounds: z.ZodDefault<z.ZodInt>;
            maxConcurrentWritePerProject: z.ZodDefault<z.ZodInt>;
            maxChangedFilesPerTask: z.ZodDefault<z.ZodInt>;
            maxRunMinutes: z.ZodDefault<z.ZodNumber>;
            plannerCallsPerDay: z.ZodDefault<z.ZodInt>;
            maxRunsPerDay: z.ZodDefault<z.ZodInt>;
        }, z.core.$strict>>;
        permissionPreset: z.ZodEnum<{
            "read-only": "read-only";
            "workspace-write": "workspace-write";
        }>;
        commandMode: z.ZodDefault<z.ZodEnum<{
            confirmed: "confirmed";
            trusted: "trusted";
        }>>;
        supersedes: z.ZodOptional<z.core.$ZodBranded<z.ZodString, "ScopeId", "out">>;
        status: z.ZodEnum<{
            active: "active";
            revoked: "revoked";
            superseded: "superseded";
        }>;
        grantedAt: z.ZodNumber;
        revokedAt: z.ZodOptional<z.ZodNumber>;
        hash: z.ZodString;
    }, z.core.$strict>>;
    tasks: z.ZodArray<z.ZodObject<{
        id: z.core.$ZodBranded<z.ZodString, "TaskId", "out">;
        goalId: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
        key: z.ZodString;
        title: z.ZodString;
        kind: z.ZodEnum<{
            analyze: "analyze";
            edit: "edit";
            test: "test";
            doc: "doc";
            research: "research";
        }>;
        dependsOn: z.ZodArray<z.core.$ZodBranded<z.ZodString, "TaskId", "out">>;
        state: z.ZodEnum<{
            PENDING: "PENDING";
            READY: "READY";
            RUNNING: "RUNNING";
            VERIFYING: "VERIFYING";
            SUCCEEDED: "SUCCEEDED";
            WAITING_APPROVAL: "WAITING_APPROVAL";
            BLOCKED: "BLOCKED";
            FAILED: "FAILED";
            UNKNOWN: "UNKNOWN";
            PAUSED: "PAUSED";
            CANCELLED: "CANCELLED";
        }>;
        acceptance: z.ZodArray<z.ZodString>;
        failureSummary: z.ZodOptional<z.ZodString>;
        unknownVerifications: z.ZodOptional<z.ZodInt>;
        attempts: z.ZodInt;
        createdBy: z.ZodEnum<{
            user: "user";
            planner: "planner";
        }>;
        createdAt: z.ZodNumber;
        version: z.ZodNumber;
    }, z.core.$strict>>;
    transitions: z.ZodArray<z.ZodObject<{
        id: z.core.$ZodBranded<z.ZodString, "TransitionId", "out">;
        entity: z.ZodLiteral<"task">;
        entityId: z.core.$ZodBranded<z.ZodString, "TaskId", "out">;
        from: z.ZodEnum<{
            PENDING: "PENDING";
            READY: "READY";
            RUNNING: "RUNNING";
            VERIFYING: "VERIFYING";
            SUCCEEDED: "SUCCEEDED";
            WAITING_APPROVAL: "WAITING_APPROVAL";
            BLOCKED: "BLOCKED";
            FAILED: "FAILED";
            UNKNOWN: "UNKNOWN";
            PAUSED: "PAUSED";
            CANCELLED: "CANCELLED";
        }>;
        to: z.ZodEnum<{
            PENDING: "PENDING";
            READY: "READY";
            RUNNING: "RUNNING";
            VERIFYING: "VERIFYING";
            SUCCEEDED: "SUCCEEDED";
            WAITING_APPROVAL: "WAITING_APPROVAL";
            BLOCKED: "BLOCKED";
            FAILED: "FAILED";
            UNKNOWN: "UNKNOWN";
            PAUSED: "PAUSED";
            CANCELLED: "CANCELLED";
        }>;
        at: z.ZodNumber;
        source: z.ZodString;
        reason: z.ZodString;
        runId: z.ZodOptional<z.core.$ZodBranded<z.ZodString, "RunId", "out">>;
    }, z.core.$strict>>;
    runs: z.ZodDefault<z.ZodArray<z.ZodObject<{
        run_id: z.core.$ZodBranded<z.ZodString, "RunId", "out">;
        taskId: z.core.$ZodBranded<z.ZodString, "TaskId", "out">;
        sessionId: z.core.$ZodBranded<z.ZodString, "SessionId", "out">;
        worktreePath: z.ZodString;
        baseCommit: z.ZodString;
        startedAt: z.ZodNumber;
        endedAt: z.ZodOptional<z.ZodNumber>;
        status: z.ZodDefault<z.ZodEnum<{
            running: "running";
            ended: "ended";
        }>>;
        runScope: z.ZodOptional<z.ZodObject<{
            id: z.core.$ZodBranded<z.ZodString, "ScopeId", "out">;
            goalId: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
            allowedPaths: z.ZodArray<z.ZodString>;
            protectedPaths: z.ZodArray<z.ZodString>;
            protectedNames: z.ZodDefault<z.ZodArray<z.ZodString>>;
            legacyAuthorization: z.ZodOptional<z.ZodLiteral<true>>;
            allowedActions: z.ZodArray<z.ZodEnum<{
                "read-file": "read-file";
                "write-file": "write-file";
                "run-command": "run-command";
                git: "git";
                network: "network";
                "spawn-subagent": "spawn-subagent";
                "continue-goal": "continue-goal";
                "pause-goal": "pause-goal";
                "resume-goal": "resume-goal";
                "rollback-to-checkpoint": "rollback-to-checkpoint";
                "reply-to-session": "reply-to-session";
                "open-workbench": "open-workbench";
                "expand-scope": "expand-scope";
            }>>;
            forbiddenActions: z.ZodArray<z.ZodEnum<{
                "read-file": "read-file";
                "write-file": "write-file";
                "run-command": "run-command";
                git: "git";
                network: "network";
                "spawn-subagent": "spawn-subagent";
                "continue-goal": "continue-goal";
                "pause-goal": "pause-goal";
                "resume-goal": "resume-goal";
                "rollback-to-checkpoint": "rollback-to-checkpoint";
                "reply-to-session": "reply-to-session";
                "open-workbench": "open-workbench";
                "expand-scope": "expand-scope";
            }>>;
            verifyCommands: z.ZodArray<z.ZodString>;
            limits: z.ZodDefault<z.ZodObject<{
                maxFixRounds: z.ZodDefault<z.ZodInt>;
                maxStallRounds: z.ZodDefault<z.ZodInt>;
                maxConcurrentWritePerProject: z.ZodDefault<z.ZodInt>;
                maxChangedFilesPerTask: z.ZodDefault<z.ZodInt>;
                maxRunMinutes: z.ZodDefault<z.ZodNumber>;
                plannerCallsPerDay: z.ZodDefault<z.ZodInt>;
                maxRunsPerDay: z.ZodDefault<z.ZodInt>;
            }, z.core.$strict>>;
            permissionPreset: z.ZodEnum<{
                "read-only": "read-only";
                "workspace-write": "workspace-write";
            }>;
            commandMode: z.ZodDefault<z.ZodEnum<{
                confirmed: "confirmed";
                trusted: "trusted";
            }>>;
            supersedes: z.ZodOptional<z.core.$ZodBranded<z.ZodString, "ScopeId", "out">>;
            status: z.ZodEnum<{
                active: "active";
                revoked: "revoked";
                superseded: "superseded";
            }>;
            grantedAt: z.ZodNumber;
            revokedAt: z.ZodOptional<z.ZodNumber>;
            hash: z.ZodString;
            originScopeId: z.core.$ZodBranded<z.ZodString, "ScopeId", "out">;
            originScopeHash: z.ZodString;
        }, z.core.$strict>>;
        reason: z.ZodOptional<z.ZodString>;
        finalReplyNonempty: z.ZodOptional<z.ZodBoolean>;
        toolCalls: z.ZodDefault<z.ZodNumber>;
        deniedCalls: z.ZodDefault<z.ZodNumber>;
        outcome: z.ZodDefault<z.ZodEnum<{
            UNKNOWN: "UNKNOWN";
            PASS: "PASS";
            FAIL: "FAIL";
            INSUFFICIENT_EVIDENCE: "INSUFFICIENT_EVIDENCE";
            NOT_SCORABLE: "NOT_SCORABLE";
        }>>;
    }, z.core.$strict>>>;
    checkpoints: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.core.$ZodBranded<z.ZodString, "CheckpointId", "out">;
        goalId: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
        taskId: z.core.$ZodBranded<z.ZodString, "TaskId", "out">;
        commit: z.ZodString;
        files: z.ZodDefault<z.ZodArray<z.ZodString>>;
        diffStat: z.ZodDefault<z.ZodString>;
        kind: z.ZodEnum<{
            baseline: "baseline";
            progress: "progress";
            verified: "verified";
            rollback: "rollback";
            reconciled: "reconciled";
        }>;
        createdAt: z.ZodNumber;
    }, z.core.$strict>>>;
    evidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.core.$ZodBranded<z.ZodString, "EvidenceId", "out">;
        runId: z.core.$ZodBranded<z.ZodString, "RunId", "out">;
        kind: z.ZodEnum<{
            file: "file";
            "test-report": "test-report";
            diff: "diff";
            metric: "metric";
            log: "log";
        }>;
        path: z.ZodOptional<z.ZodString>;
        hash: z.ZodOptional<z.ZodString>;
        summary: z.ZodString;
        verdict: z.ZodEnum<{
            UNKNOWN: "UNKNOWN";
            PASS: "PASS";
            FAIL: "FAIL";
            INSUFFICIENT_EVIDENCE: "INSUFFICIENT_EVIDENCE";
            NOT_SCORABLE: "NOT_SCORABLE";
        }>;
    }, z.core.$strict>>>;
    verifications: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.core.$ZodBranded<z.ZodString, "RunId", "out">;
        taskId: z.core.$ZodBranded<z.ZodString, "TaskId", "out">;
        checkpoint: z.ZodString;
        createdAt: z.ZodNumber;
        baseline: z.ZodArray<z.ZodObject<{
            command: z.ZodString;
            status: z.ZodEnum<{
                error: "error";
                passed: "passed";
                failed: "failed";
                timeout: "timeout";
            }>;
            exitCode: z.ZodNullable<z.ZodNumber>;
            counts: z.ZodOptional<z.ZodObject<{
                passed: z.ZodInt;
                failed: z.ZodInt;
                skipped: z.ZodInt;
            }, z.core.$strict>>;
            durationMs: z.ZodOptional<z.ZodNumber>;
            logPath: z.ZodOptional<z.ZodString>;
            hash: z.ZodOptional<z.ZodString>;
            tail: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>;
        current: z.ZodArray<z.ZodObject<{
            command: z.ZodString;
            status: z.ZodEnum<{
                error: "error";
                passed: "passed";
                failed: "failed";
                timeout: "timeout";
            }>;
            exitCode: z.ZodNullable<z.ZodNumber>;
            counts: z.ZodOptional<z.ZodObject<{
                passed: z.ZodInt;
                failed: z.ZodInt;
                skipped: z.ZodInt;
            }, z.core.$strict>>;
            durationMs: z.ZodOptional<z.ZodNumber>;
            logPath: z.ZodOptional<z.ZodString>;
            hash: z.ZodOptional<z.ZodString>;
            tail: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>;
        judgment: z.ZodObject<{
            verdict: z.ZodEnum<{
                UNKNOWN: "UNKNOWN";
                PASS: "PASS";
                FAIL: "FAIL";
                INSUFFICIENT_EVIDENCE: "INSUFFICIENT_EVIDENCE";
                NOT_SCORABLE: "NOT_SCORABLE";
            }>;
            reasons: z.ZodArray<z.ZodString>;
            progress: z.ZodEnum<{
                unknown: "unknown";
                neutral: "neutral";
                improved: "improved";
                unchanged: "unchanged";
                regressed: "regressed";
            }>;
        }, z.core.$strict>;
        decision: z.ZodUnion<readonly [z.ZodObject<{
            taskOutcome: z.ZodEnum<{
                reconcile: "reconcile";
                succeed: "succeed";
                retry: "retry";
                "rollback-and-retry": "rollback-and-retry";
                "ask-user": "ask-user";
            }>;
            goalAction: z.ZodEnum<{
                continue: "continue";
                pause: "pause";
            }>;
            unknownVerifications: z.ZodInt;
            reason: z.ZodString;
            goalProgress: z.ZodInt;
            attempts: z.ZodInt;
            failureSummary: z.ZodString;
        }, z.core.$strict>, z.ZodPipe<z.ZodObject<{
            type: z.ZodEnum<{
                "pause-goal": "pause-goal";
                reconcile: "reconcile";
                succeed: "succeed";
                retry: "retry";
                "rollback-and-retry": "rollback-and-retry";
                "ask-user": "ask-user";
            }>;
            reason: z.ZodString;
            goalProgress: z.ZodInt;
            attempts: z.ZodInt;
            failureSummary: z.ZodString;
        }, z.core.$strict>, z.ZodTransform<{
            taskOutcome: "reconcile" | "succeed" | "retry" | "rollback-and-retry" | "ask-user";
            goalAction: "continue" | "pause";
            unknownVerifications: number;
            reason: string;
            goalProgress: number;
            attempts: number;
            failureSummary: string;
        }, {
            type: "pause-goal" | "reconcile" | "succeed" | "retry" | "rollback-and-retry" | "ask-user";
            reason: string;
            goalProgress: number;
            attempts: number;
            failureSummary: string;
        }>>]>;
    }, z.core.$strict>>>;
    notifications: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.core.$ZodBranded<z.ZodString, "NotificationId", "out">;
        kind: z.ZodEnum<{
            progress: "progress";
            decision: "decision";
            blocked: "blocked";
            info: "info";
        }>;
        priority: z.ZodEnum<{
            high: "high";
            low: "low";
            normal: "normal";
        }>;
        dedupeKey: z.ZodString;
        goalId: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
        taskId: z.ZodOptional<z.core.$ZodBranded<z.ZodString, "TaskId", "out">>;
        channel: z.ZodEnum<{
            "dsh-question": "dsh-question";
            panel: "panel";
            system: "system";
        }>;
        createdAt: z.ZodNumber;
        runId: z.ZodOptional<z.ZodString>;
        taskVersion: z.ZodOptional<z.ZodNumber>;
        reason: z.ZodOptional<z.ZodString>;
        deliveryAttemptedAt: z.ZodOptional<z.ZodNumber>;
        deliveryState: z.ZodOptional<z.ZodEnum<{
            cancelled: "cancelled";
            failed: "failed";
            delivered: "delivered";
            held: "held";
            muted: "muted";
            digest: "digest";
            dropped: "dropped";
        }>>;
        deliveryReason: z.ZodOptional<z.ZodString>;
        nextDeliveryAt: z.ZodOptional<z.ZodNumber>;
        remindAt: z.ZodOptional<z.ZodNumber>;
        suggestionIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
        routingSuggestionId: z.ZodOptional<z.ZodString>;
        lastSelectionId: z.ZodOptional<z.ZodString>;
        resolvedSource: z.ZodOptional<z.ZodEnum<{
            panel: "panel";
            inbox: "inbox";
        }>>;
        choices: z.ZodOptional<z.ZodArray<z.ZodEnum<{
            "pause-goal": "pause-goal";
            "resume-goal": "resume-goal";
            abandon: "abandon";
            "change-direction": "change-direction";
            verify: "verify";
            rollback: "rollback";
            retry: "retry";
            accept: "accept";
            "view-diff": "view-diff";
        }>>>;
        expiresAt: z.ZodOptional<z.ZodNumber>;
        resolvedReason: z.ZodOptional<z.ZodEnum<{
            superseded: "superseded";
            expired: "expired";
        }>>;
        resolvedChoice: z.ZodOptional<z.ZodEnum<{
            "pause-goal": "pause-goal";
            "resume-goal": "resume-goal";
            abandon: "abandon";
            "change-direction": "change-direction";
            verify: "verify";
            rollback: "rollback";
            retry: "retry";
            accept: "accept";
            "view-diff": "view-diff";
        }>>;
        resolvedAt: z.ZodOptional<z.ZodNumber>;
        deliveredAt: z.ZodOptional<z.ZodNumber>;
        snoozedUntil: z.ZodOptional<z.ZodNumber>;
        readAt: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strict>>>;
    autopilotEvents: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        goalId: z.ZodOptional<z.core.$ZodBranded<z.ZodString, "GoalId", "out">>;
        actor: z.ZodOptional<z.ZodEnum<{
            user: "user";
            companion: "companion";
            "companion-proposal": "companion-proposal";
        }>>;
        decisionId: z.ZodOptional<z.ZodString>;
        proposalId: z.ZodOptional<z.ZodString>;
        sessionId: z.ZodOptional<z.ZodString>;
        confirmedAt: z.ZodOptional<z.ZodNumber>;
        at: z.ZodNumber;
        action: z.ZodString;
        companionOperation: z.ZodOptional<z.ZodEnum<{
            pause: "pause";
            resume: "resume";
            "enable-autopilot": "enable-autopilot";
            "disable-autopilot": "disable-autopilot";
            "pause-all": "pause-all";
            "resume-all": "resume-all";
        }>>;
        reason: z.ZodString;
        taskId: z.ZodOptional<z.core.$ZodBranded<z.ZodString, "TaskId", "out">>;
        runId: z.ZodOptional<z.core.$ZodBranded<z.ZodString, "RunId", "out">>;
    }, z.core.$strict>>>;
    plannerState: z.ZodDefault<z.ZodNullable<z.ZodObject<{
        id: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
        day: z.ZodString;
        calls: z.ZodInt;
        status: z.ZodEnum<{
            continue: "continue";
            none: "none";
            complete: "complete";
            "need-user": "need-user";
        }>;
        frontier: z.ZodDefault<z.ZodString>;
        reason: z.ZodDefault<z.ZodString>;
        notBefore: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strict>>>;
}, z.core.$strict>;
export declare const ConfirmResultSchema: z.ZodObject<{
    goal: z.ZodObject<{
        id: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
        title: z.ZodString;
        objective: z.ZodString;
        expectedOutcome: z.ZodString;
        projectRoot: z.ZodString;
        acceptance: z.ZodArray<z.ZodString>;
        stopConditions: z.ZodArray<z.ZodString>;
        mode: z.ZodEnum<{
            suggest: "suggest";
            autonomous: "autonomous";
            high: "high";
        }>;
        status: z.ZodEnum<{
            draft: "draft";
            active: "active";
            paused: "paused";
            succeeded: "succeeded";
            completed: "completed";
            cancelled: "cancelled";
        }>;
        autopilot: z.ZodDefault<z.ZodObject<{
            enabled: z.ZodBoolean;
            enabledAt: z.ZodOptional<z.ZodNumber>;
            disabledReason: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>;
        inboxSessionId: z.ZodOptional<z.ZodString>;
        scopeId: z.ZodOptional<z.core.$ZodBranded<z.ZodString, "ScopeId", "out">>;
        createdAt: z.ZodNumber;
        confirmedAt: z.ZodOptional<z.ZodNumber>;
        stalled: z.ZodOptional<z.ZodInt>;
        version: z.ZodNumber;
    }, z.core.$strict>;
    scope: z.ZodObject<{
        id: z.core.$ZodBranded<z.ZodString, "ScopeId", "out">;
        goalId: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
        allowedPaths: z.ZodArray<z.ZodString>;
        protectedPaths: z.ZodArray<z.ZodString>;
        protectedNames: z.ZodDefault<z.ZodArray<z.ZodString>>;
        legacyAuthorization: z.ZodOptional<z.ZodLiteral<true>>;
        allowedActions: z.ZodArray<z.ZodEnum<{
            "read-file": "read-file";
            "write-file": "write-file";
            "run-command": "run-command";
            git: "git";
            network: "network";
            "spawn-subagent": "spawn-subagent";
            "continue-goal": "continue-goal";
            "pause-goal": "pause-goal";
            "resume-goal": "resume-goal";
            "rollback-to-checkpoint": "rollback-to-checkpoint";
            "reply-to-session": "reply-to-session";
            "open-workbench": "open-workbench";
            "expand-scope": "expand-scope";
        }>>;
        forbiddenActions: z.ZodArray<z.ZodEnum<{
            "read-file": "read-file";
            "write-file": "write-file";
            "run-command": "run-command";
            git: "git";
            network: "network";
            "spawn-subagent": "spawn-subagent";
            "continue-goal": "continue-goal";
            "pause-goal": "pause-goal";
            "resume-goal": "resume-goal";
            "rollback-to-checkpoint": "rollback-to-checkpoint";
            "reply-to-session": "reply-to-session";
            "open-workbench": "open-workbench";
            "expand-scope": "expand-scope";
        }>>;
        verifyCommands: z.ZodArray<z.ZodString>;
        limits: z.ZodDefault<z.ZodObject<{
            maxFixRounds: z.ZodDefault<z.ZodInt>;
            maxStallRounds: z.ZodDefault<z.ZodInt>;
            maxConcurrentWritePerProject: z.ZodDefault<z.ZodInt>;
            maxChangedFilesPerTask: z.ZodDefault<z.ZodInt>;
            maxRunMinutes: z.ZodDefault<z.ZodNumber>;
            plannerCallsPerDay: z.ZodDefault<z.ZodInt>;
            maxRunsPerDay: z.ZodDefault<z.ZodInt>;
        }, z.core.$strict>>;
        permissionPreset: z.ZodEnum<{
            "read-only": "read-only";
            "workspace-write": "workspace-write";
        }>;
        commandMode: z.ZodDefault<z.ZodEnum<{
            confirmed: "confirmed";
            trusted: "trusted";
        }>>;
        supersedes: z.ZodOptional<z.core.$ZodBranded<z.ZodString, "ScopeId", "out">>;
        status: z.ZodEnum<{
            active: "active";
            revoked: "revoked";
            superseded: "superseded";
        }>;
        grantedAt: z.ZodNumber;
        revokedAt: z.ZodOptional<z.ZodNumber>;
        hash: z.ZodString;
    }, z.core.$strict>;
    rejected: z.ZodArray<z.ZodObject<{
        task: z.ZodObject<{
            id: z.core.$ZodBranded<z.ZodString, "TaskId", "out">;
            goalId: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
            key: z.ZodString;
            title: z.ZodString;
            kind: z.ZodEnum<{
                analyze: "analyze";
                edit: "edit";
                test: "test";
                doc: "doc";
                research: "research";
            }>;
            dependsOn: z.ZodArray<z.core.$ZodBranded<z.ZodString, "TaskId", "out">>;
            state: z.ZodEnum<{
                PENDING: "PENDING";
                READY: "READY";
                RUNNING: "RUNNING";
                VERIFYING: "VERIFYING";
                SUCCEEDED: "SUCCEEDED";
                WAITING_APPROVAL: "WAITING_APPROVAL";
                BLOCKED: "BLOCKED";
                FAILED: "FAILED";
                UNKNOWN: "UNKNOWN";
                PAUSED: "PAUSED";
                CANCELLED: "CANCELLED";
            }>;
            acceptance: z.ZodArray<z.ZodString>;
            failureSummary: z.ZodOptional<z.ZodString>;
            unknownVerifications: z.ZodOptional<z.ZodInt>;
            attempts: z.ZodInt;
            createdBy: z.ZodEnum<{
                user: "user";
                planner: "planner";
            }>;
            createdAt: z.ZodNumber;
            version: z.ZodNumber;
        }, z.core.$strict>;
        reason: z.ZodEnum<{
            "foreign-goal": "foreign-goal";
            duplicate: "duplicate";
            "dangling-dependency": "dangling-dependency";
            cycle: "cycle";
        }>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const ServicesSchema: z.ZodObject<{
    gateway: z.ZodBoolean;
    commands: z.ZodBoolean;
    userQuestions: z.ZodBoolean;
    approval: z.ZodBoolean;
    permissionPresets: z.ZodBoolean;
    tools: z.ZodBoolean;
}, z.core.$strict>;
export declare const CompanionStatusSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    state: z.ZodLiteral<"disabled">;
}, z.core.$strict>, z.ZodObject<{
    state: z.ZodLiteral<"starting">;
}, z.core.$strict>, z.ZodObject<{
    state: z.ZodLiteral<"ready">;
    sessionId: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    state: z.ZodLiteral<"error">;
    message: z.ZodString;
}, z.core.$strict>], "state">;
export declare const CompanionRebuildSchema: z.ZodObject<{
    confirm: z.ZodLiteral<true>;
}, z.core.$strict>;
export declare const StatusSchema: z.ZodObject<{
    version: z.ZodString;
    startedAt: z.ZodNumber;
    dataDir: z.ZodString;
    services: z.ZodObject<{
        gateway: z.ZodBoolean;
        commands: z.ZodBoolean;
        userQuestions: z.ZodBoolean;
        approval: z.ZodBoolean;
        permissionPresets: z.ZodBoolean;
        tools: z.ZodBoolean;
    }, z.core.$strict>;
    coopanion: z.ZodBoolean;
    language: z.ZodEnum<{
        "zh-CN": "zh-CN";
        en: "en";
        auto: "auto";
    }>;
    store: z.ZodObject<{
        state: z.ZodEnum<{
            error: "error";
            "read-only": "read-only";
            ok: "ok";
        }>;
        corruptRows: z.ZodInt;
        message: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    paused: z.ZodBoolean;
    companion: z.ZodOptional<z.ZodDiscriminatedUnion<[z.ZodObject<{
        state: z.ZodLiteral<"disabled">;
    }, z.core.$strict>, z.ZodObject<{
        state: z.ZodLiteral<"starting">;
    }, z.core.$strict>, z.ZodObject<{
        state: z.ZodLiteral<"ready">;
        sessionId: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        state: z.ZodLiteral<"error">;
        message: z.ZodString;
    }, z.core.$strict>], "state">>;
}, z.core.$strict>;
export declare const GoalsSchema: z.ZodArray<z.ZodObject<{
    id: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
    title: z.ZodString;
    objective: z.ZodString;
    expectedOutcome: z.ZodString;
    projectRoot: z.ZodString;
    acceptance: z.ZodArray<z.ZodString>;
    stopConditions: z.ZodArray<z.ZodString>;
    mode: z.ZodEnum<{
        suggest: "suggest";
        autonomous: "autonomous";
        high: "high";
    }>;
    status: z.ZodEnum<{
        draft: "draft";
        active: "active";
        paused: "paused";
        succeeded: "succeeded";
        completed: "completed";
        cancelled: "cancelled";
    }>;
    autopilot: z.ZodDefault<z.ZodObject<{
        enabled: z.ZodBoolean;
        enabledAt: z.ZodOptional<z.ZodNumber>;
        disabledReason: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    inboxSessionId: z.ZodOptional<z.ZodString>;
    scopeId: z.ZodOptional<z.core.$ZodBranded<z.ZodString, "ScopeId", "out">>;
    createdAt: z.ZodNumber;
    confirmedAt: z.ZodOptional<z.ZodNumber>;
    stalled: z.ZodOptional<z.ZodInt>;
    version: z.ZodNumber;
}, z.core.$strict>>;
export declare const LanguageResponseSchema: z.ZodObject<{
    language: z.ZodEnum<{
        "zh-CN": "zh-CN";
        en: "en";
        auto: "auto";
    }>;
}, z.core.$strict>;
export declare const ErrorSchema: z.ZodObject<{
    error: z.ZodObject<{
        code: z.ZodString;
        message: z.ZodString;
    }, z.core.$strict>;
}, z.core.$strict>;
export type PanelStatus = z.infer<typeof StatusSchema>;
export declare const PANEL_CHANNEL = "/api";
export declare const PANEL_PREFIX = "whaledot";
