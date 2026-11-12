import type { GoalId, RadarSettings, RadarPreview, RadarFacts, RadarDetector, RadarSubscribeSchema, Run, ProjectGoal } from '#whalemaid/core';
import type { z } from 'zod';
import type { ScopeService } from '../scope-service.js';
import { type WhaleStore } from '../store/index.js';
import { RadarClient } from './client.js';
type SubscriptionInput = z.infer<typeof RadarSubscribeSchema>;
export interface RadarCredentials {
    status(): Promise<boolean>;
    token(): Promise<string | undefined>;
    set(value: string | null): Promise<void>;
}
export declare class RadarService {
    private readonly store;
    private readonly scopes;
    private readonly ports;
    private readonly client;
    private readonly jobs;
    private readonly observed;
    private readonly excerpts;
    private readonly lifetime;
    private readonly unwatch;
    constructor(store: WhaleStore, scopes: Pick<ScopeService, 'activeScopeFor'>, ports: {
        settings(): RadarSettings;
        conflictEnabled(): boolean;
        credentials: RadarCredentials;
        worktreeRoot: string;
        couldHaveWritten(run: Run, path: string): boolean;
        runStillLive(run: Run): boolean;
        onFacts(id: GoalId): void;
        log(): void;
        client?: RadarClient;
        now?(): number;
    });
    settings(): {
        enabled: boolean;
        sources: {
            dependencies: boolean;
            localGit: boolean;
            github: boolean;
        };
        checkHours: number;
    };
    private now;
    private target;
    private sameScope;
    private active;
    preview(id: GoalId): Promise<RadarPreview>;
    subscribe(input: SubscriptionInput): Promise<{
        eligible: boolean;
        hold: {
            at: number;
            hash: string;
            paths: string[];
            previous: string;
            head: string;
        } | undefined;
        observations: {
            id: string;
            goalId: string & z.core.$brand<"GoalId">;
            revision: string;
            at: number;
            source: "dependencies" | "github" | "localGit";
            requests: number;
            cacheHits: number;
            etags: {
                endpoint: string;
                tag: string;
            }[];
            purpose?: "excerpt" | undefined;
            failure?: string | undefined;
            retryAt?: number | undefined;
            versions?: {
                ecosystem: "npm" | "pypi";
                name: string;
                latest: string;
                incompatible: boolean;
                breaking: boolean;
                deprecated: boolean;
                hash: string;
                current?: string | undefined;
            }[] | undefined;
            git?: {
                head: string;
                changes: string[];
                dirty: {
                    path: string;
                    hash: string;
                }[];
                external: string[];
                ref?: string | undefined;
                conflict?: {
                    hash: string;
                    paths: string[];
                    previous: string;
                    head: string;
                } | undefined;
            } | undefined;
            github?: {
                branch: string;
                runs: {
                    id: number;
                    failure: boolean;
                }[];
                related: {
                    number: number;
                    kind: "pr" | "issue";
                    hash: string;
                }[];
            } | undefined;
        }[];
        credentialConfigured: boolean;
        subscription?: {
            id: string & z.core.$brand<"GoalId">;
            scopeId: string & z.core.$brand<"ScopeId">;
            scopeHash: string;
            enabled: boolean;
            sources: {
                dependencies: boolean;
                localGit: boolean;
                github: boolean;
            };
            dependencies: {
                ecosystem: "npm" | "pypi";
                name: string;
                exact: boolean;
                range: string;
                current?: string | undefined;
            }[];
            confirmedAt: number;
            revision: string;
            repo?: string | undefined;
            lastAutomaticAt?: number | undefined;
            lastNetworkAt?: number | undefined;
            hold?: {
                at: number;
                hash: string;
                paths: string[];
                previous: string;
                head: string;
            } | undefined;
            acknowledged?: string | undefined;
            settled?: {
                hash: string;
                at: number;
                choice: "pause" | "continue";
            } | undefined;
            daily?: {
                day: string;
                checks: number;
                passed: number;
                requests: number;
            }[] | undefined;
        };
        settings: {
            enabled: boolean;
            sources: {
                dependencies: boolean;
                localGit: boolean;
                github: boolean;
            };
            checkHours: number;
        };
        subscribed: boolean;
    }>;
    detail(id: GoalId): Promise<{
        eligible: boolean;
        hold: {
            at: number;
            hash: string;
            paths: string[];
            previous: string;
            head: string;
        } | undefined;
        observations: {
            id: string;
            goalId: string & z.core.$brand<"GoalId">;
            revision: string;
            at: number;
            source: "dependencies" | "github" | "localGit";
            requests: number;
            cacheHits: number;
            etags: {
                endpoint: string;
                tag: string;
            }[];
            purpose?: "excerpt" | undefined;
            failure?: string | undefined;
            retryAt?: number | undefined;
            versions?: {
                ecosystem: "npm" | "pypi";
                name: string;
                latest: string;
                incompatible: boolean;
                breaking: boolean;
                deprecated: boolean;
                hash: string;
                current?: string | undefined;
            }[] | undefined;
            git?: {
                head: string;
                changes: string[];
                dirty: {
                    path: string;
                    hash: string;
                }[];
                external: string[];
                ref?: string | undefined;
                conflict?: {
                    hash: string;
                    paths: string[];
                    previous: string;
                    head: string;
                } | undefined;
            } | undefined;
            github?: {
                branch: string;
                runs: {
                    id: number;
                    failure: boolean;
                }[];
                related: {
                    number: number;
                    kind: "pr" | "issue";
                    hash: string;
                }[];
            } | undefined;
        }[];
        credentialConfigured: boolean;
        subscription?: {
            id: string & z.core.$brand<"GoalId">;
            scopeId: string & z.core.$brand<"ScopeId">;
            scopeHash: string;
            enabled: boolean;
            sources: {
                dependencies: boolean;
                localGit: boolean;
                github: boolean;
            };
            dependencies: {
                ecosystem: "npm" | "pypi";
                name: string;
                exact: boolean;
                range: string;
                current?: string | undefined;
            }[];
            confirmedAt: number;
            revision: string;
            repo?: string | undefined;
            lastAutomaticAt?: number | undefined;
            lastNetworkAt?: number | undefined;
            hold?: {
                at: number;
                hash: string;
                paths: string[];
                previous: string;
                head: string;
            } | undefined;
            acknowledged?: string | undefined;
            settled?: {
                hash: string;
                at: number;
                choice: "pause" | "continue";
            } | undefined;
            daily?: {
                day: string;
                checks: number;
                passed: number;
                requests: number;
            }[] | undefined;
        };
        settings: {
            enabled: boolean;
            sources: {
                dependencies: boolean;
                localGit: boolean;
                github: boolean;
            };
            checkHours: number;
        };
        subscribed: boolean;
    }>;
    metrics(): {
        checks: number;
        passed: number;
        requests: number;
    };
    setCredential(value: string | null): Promise<{
        configured: boolean;
    }>;
    hold(id: GoalId): {
        at: number;
        hash: string;
        paths: string[];
        previous: string;
        head: string;
    } | undefined;
    /** Called in the shared notification effect transaction. */
    settle(id: GoalId, hash: string, choice: 'continue' | 'pause', at: number): void;
    findingLive(id: GoalId, detector: RadarDetector, observationId: string): boolean;
    facts(goal: ProjectGoal): RadarFacts;
    controlsChanged(): void;
    observe(id: GoalId): void;
    check(id: GoalId, manual?: boolean): Promise<void>;
    private launch;
    private collect;
    private observation;
    private record;
    /** Only an owner request for a stored evidence reference can read a remote excerpt. */
    excerpt(id: string, ownerSignal: AbortSignal): Promise<{
        excerpt: string;
    }>;
    dispose(): Promise<void>;
}
export {};
