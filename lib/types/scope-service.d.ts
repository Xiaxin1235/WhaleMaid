import { z } from 'zod';
import type { Context } from '@deepseek-ai/cordis';
import type { PeerScope } from '@deepseek-ai/dsh-client-connection';
import type { AuthorizationScope, Clock, GoalId, IdGen, ScopeHasher, ScopeId } from '#whalemaid/core';
import { WhaleStore } from './store/index.js';
declare module '@deepseek-ai/cordis' {
    interface Events {
        'whaledot/scope-revoked'(scopeId: ScopeId): void;
    }
}
export declare const ScopeDraftSchema: z.ZodObject<{
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
}, z.core.$strict>;
export type ScopeDraft = z.input<typeof ScopeDraftSchema>;
/** No grant endpoint is published until P07 presents the owner confirmation interface. */
export declare class ScopeService {
    private readonly store;
    private readonly deps;
    constructor(store: WhaleStore, deps: {
        clock: Clock;
        idGen: IdGen;
        hasher: ScopeHasher;
        revoked(scopeId: ScopeId): void;
        log(message: string, error?: unknown): void;
    });
    grant(input: ScopeDraft, peer: PeerScope): AuthorizationScope;
    /** Commit first so every revocation observer reads the revoked state immediately. */
    revoke(scopeId: ScopeId, peer: PeerScope): AuthorizationScope;
    /** Re-read and verify on each authorization lookup; never cache an active grant. */
    activeScopeFor(goalId: GoalId): AuthorizationScope | undefined;
    private digest;
}
/** Cordis emit/on is documented in cordis/lib/types/events.d.ts; event vocabulary is ours. */
export declare function createScopeService(ctx: Context, store: WhaleStore, log: (message: string, error?: unknown) => void): ScopeService;
