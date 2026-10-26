import { z } from 'zod';
export declare const NotificationSchema: z.ZodObject<{
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
export declare const SuggestionSchema: z.ZodObject<{
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
}, z.core.$strict>;
export type Notification = z.infer<typeof NotificationSchema>;
export type Suggestion = z.infer<typeof SuggestionSchema>;
