import type { AuthorizationScope } from './model/authorization.js';
import type { TaskKind } from './model/common.js';
export declare const RunScopeSchema: import("zod").ZodObject<{
    id: import("zod/v4/core").$ZodBranded<import("zod").ZodString, "ScopeId", "out">;
    goalId: import("zod/v4/core").$ZodBranded<import("zod").ZodString, "GoalId", "out">;
    allowedPaths: import("zod").ZodArray<import("zod").ZodString>;
    protectedPaths: import("zod").ZodArray<import("zod").ZodString>;
    protectedNames: import("zod").ZodDefault<import("zod").ZodArray<import("zod").ZodString>>;
    legacyAuthorization: import("zod").ZodOptional<import("zod").ZodLiteral<true>>;
    allowedActions: import("zod").ZodArray<import("zod").ZodEnum<{
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
    forbiddenActions: import("zod").ZodArray<import("zod").ZodEnum<{
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
    verifyCommands: import("zod").ZodArray<import("zod").ZodString>;
    limits: import("zod").ZodDefault<import("zod").ZodObject<{
        maxFixRounds: import("zod").ZodDefault<import("zod").ZodInt>;
        maxStallRounds: import("zod").ZodDefault<import("zod").ZodInt>;
        maxConcurrentWritePerProject: import("zod").ZodDefault<import("zod").ZodInt>;
        maxChangedFilesPerTask: import("zod").ZodDefault<import("zod").ZodInt>;
        maxRunMinutes: import("zod").ZodDefault<import("zod").ZodNumber>;
        plannerCallsPerDay: import("zod").ZodDefault<import("zod").ZodInt>;
        maxRunsPerDay: import("zod").ZodDefault<import("zod").ZodInt>;
    }, import("zod/v4/core").$strict>>;
    permissionPreset: import("zod").ZodEnum<{
        "read-only": "read-only";
        "workspace-write": "workspace-write";
    }>;
    commandMode: import("zod").ZodDefault<import("zod").ZodEnum<{
        confirmed: "confirmed";
        trusted: "trusted";
    }>>;
    supersedes: import("zod").ZodOptional<import("zod/v4/core").$ZodBranded<import("zod").ZodString, "ScopeId", "out">>;
    status: import("zod").ZodEnum<{
        active: "active";
        revoked: "revoked";
        superseded: "superseded";
    }>;
    grantedAt: import("zod").ZodNumber;
    revokedAt: import("zod").ZodOptional<import("zod").ZodNumber>;
    hash: import("zod").ZodString;
    originScopeId: import("zod/v4/core").$ZodBranded<import("zod").ZodString, "ScopeId", "out">;
    originScopeHash: import("zod").ZodString;
}, import("zod/v4/core").$strict>;
export type RunScope = AuthorizationScope & {
    originScopeId: AuthorizationScope['id'];
    originScopeHash: string;
};
/** Project-relative remapping never carries authorization to an external directory. Hash remains the origin digest, not a signature for derived fields. */
export declare function deriveRunScope(scope: AuthorizationScope, projectRoot: string, worktreeRoot: string, kind?: TaskKind): RunScope;
/** Remove audit-only fields before feeding a derived scope to strict authorization validation. */
export declare function authorizationOfRun(scope: RunScope): AuthorizationScope;
