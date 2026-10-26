import { z } from 'zod';
export { DEFAULT_LIMITS, LimitsSchema } from './limits.js';
export type { Limits } from './limits.js';
export declare const DEFAULT_PROTECTED_NAMES: readonly [".env", ".env.*", "*.pem", "*.key", "id_rsa*", "id_ed25519*", ".npmrc", ".pypirc"];
export declare const ProtectedNamesSchema: z.ZodDefault<z.ZodArray<z.ZodString>>;
export declare const ScopeHashSchema: z.ZodString;
export declare function checkCommandMode(scope: {
    commandMode: 'confirmed' | 'trusted';
    permissionPreset: string;
}, ctx: z.RefinementCtx): void;
export declare const ScopeContentSchema: z.ZodObject<{
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
}, z.core.$strict>;
export declare const AuthorizationScopeSchema: z.ZodObject<{
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
export declare const ScopeSchema: z.ZodObject<{
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
export type AuthorizationScope = z.infer<typeof AuthorizationScopeSchema>;
export type ScopeContent = z.infer<typeof ScopeContentSchema>;
