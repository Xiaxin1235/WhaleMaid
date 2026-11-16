import { z } from 'zod';
export declare const RunSchema: z.ZodObject<{
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
}, z.core.$strict>;
export declare const AttemptSchema: z.ZodObject<{
    attempt_id: z.core.$ZodBranded<z.ZodString, "AttemptId", "out">;
    runId: z.core.$ZodBranded<z.ZodString, "RunId", "out">;
    n: z.ZodInt;
    startedAt: z.ZodNumber;
    endedAt: z.ZodOptional<z.ZodNumber>;
    outcome: z.ZodDefault<z.ZodEnum<{
        UNKNOWN: "UNKNOWN";
        PASS: "PASS";
        FAIL: "FAIL";
        INSUFFICIENT_EVIDENCE: "INSUFFICIENT_EVIDENCE";
        NOT_SCORABLE: "NOT_SCORABLE";
    }>>;
}, z.core.$strict>;
export declare const CheckpointSchema: z.ZodObject<{
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
}, z.core.$strict>;
export type Run = z.infer<typeof RunSchema>;
export type Attempt = z.infer<typeof AttemptSchema>;
export type Checkpoint = z.infer<typeof CheckpointSchema>;
