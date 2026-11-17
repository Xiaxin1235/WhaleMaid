import { z } from 'zod';
export declare const ActionKindSchema: z.ZodEnum<{
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
}>;
export declare const ScopePatchSchema: z.ZodObject<{
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
export declare const ActionIntentSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
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
}, z.core.$strict>], "type">;
export type ActionKind = z.infer<typeof ActionKindSchema>;
export type ActionIntent = z.infer<typeof ActionIntentSchema>;
export type ScopePatch = z.infer<typeof ScopePatchSchema>;
