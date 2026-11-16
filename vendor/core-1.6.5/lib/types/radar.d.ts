import { z } from 'zod';
import type { OpportunityCandidate } from './initiative/model.js';
import type { ProjectGoal } from './model/goal.js';
export declare const RADAR_SOURCES: readonly ["dependencies", "localGit", "github"];
export declare const RadarSourcesSchema: z.ZodObject<{
    dependencies: z.ZodBoolean;
    localGit: z.ZodBoolean;
    github: z.ZodBoolean;
}, z.core.$strict>;
export type RadarSource = (typeof RADAR_SOURCES)[number];
export declare const RadarSettingsSchema: z.ZodObject<{
    enabled: z.ZodBoolean;
    sources: z.ZodObject<{
        dependencies: z.ZodBoolean;
        localGit: z.ZodBoolean;
        github: z.ZodBoolean;
    }, z.core.$strict>;
    checkHours: z.ZodInt;
}, z.core.$strict>;
export type RadarSettings = z.infer<typeof RadarSettingsSchema>;
export declare const DEFAULT_RADAR: RadarSettings;
export declare const RadarRepoSchema: z.ZodString;
export declare const RadarDependencySchema: z.ZodObject<{
    ecosystem: z.ZodEnum<{
        npm: "npm";
        pypi: "pypi";
    }>;
    name: z.ZodString;
    current: z.ZodOptional<z.ZodString>;
    exact: z.ZodBoolean;
    range: z.ZodString;
}, z.core.$strict>;
export declare const RadarPreviewSchema: z.ZodObject<{
    goalId: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
    scopeHash: z.ZodString;
    token: z.ZodString;
    repo: z.ZodOptional<z.ZodString>;
    dependencies: z.ZodArray<z.ZodObject<{
        ecosystem: z.ZodEnum<{
            npm: "npm";
            pypi: "pypi";
        }>;
        name: z.ZodString;
        current: z.ZodOptional<z.ZodString>;
        exact: z.ZodBoolean;
        range: z.ZodString;
    }, z.core.$strict>>;
    localGit: z.ZodBoolean;
}, z.core.$strict>;
export type RadarPreview = z.infer<typeof RadarPreviewSchema>;
export type RadarDependency = z.infer<typeof RadarDependencySchema>;
export declare const RadarSubscribeSchema: z.ZodObject<{
    goalId: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
    token: z.ZodString;
    enabled: z.ZodBoolean;
    sources: z.ZodObject<{
        dependencies: z.ZodBoolean;
        localGit: z.ZodBoolean;
        github: z.ZodBoolean;
    }, z.core.$strict>;
    repo: z.ZodString;
}, z.core.$strict>;
declare const RadarConflictSchema: z.ZodObject<{
    hash: z.ZodString;
    paths: z.ZodArray<z.ZodString>;
    previous: z.ZodString;
    head: z.ZodString;
}, z.core.$strict>;
export type RadarConflict = z.infer<typeof RadarConflictSchema>;
export declare const RadarSubscriptionSchema: z.ZodObject<{
    id: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
    scopeId: z.core.$ZodBranded<z.ZodString, "ScopeId", "out">;
    scopeHash: z.ZodString;
    enabled: z.ZodBoolean;
    sources: z.ZodObject<{
        dependencies: z.ZodBoolean;
        localGit: z.ZodBoolean;
        github: z.ZodBoolean;
    }, z.core.$strict>;
    repo: z.ZodOptional<z.ZodString>;
    dependencies: z.ZodArray<z.ZodObject<{
        ecosystem: z.ZodEnum<{
            npm: "npm";
            pypi: "pypi";
        }>;
        name: z.ZodString;
        current: z.ZodOptional<z.ZodString>;
        exact: z.ZodBoolean;
        range: z.ZodString;
    }, z.core.$strict>>;
    confirmedAt: z.ZodNumber;
    revision: z.ZodString;
    lastAutomaticAt: z.ZodOptional<z.ZodNumber>;
    lastNetworkAt: z.ZodOptional<z.ZodNumber>;
    hold: z.ZodOptional<z.ZodObject<{
        at: z.ZodNumber;
        hash: z.ZodString;
        paths: z.ZodArray<z.ZodString>;
        previous: z.ZodString;
        head: z.ZodString;
    }, z.core.$strict>>;
    acknowledged: z.ZodOptional<z.ZodString>;
    settled: z.ZodOptional<z.ZodObject<{
        hash: z.ZodString;
        at: z.ZodNumber;
        choice: z.ZodEnum<{
            continue: "continue";
            pause: "pause";
        }>;
    }, z.core.$strict>>;
    daily: z.ZodOptional<z.ZodArray<z.ZodObject<{
        day: z.ZodString;
        checks: z.ZodInt;
        passed: z.ZodInt;
        requests: z.ZodInt;
    }, z.core.$strict>>>;
}, z.core.$strict>;
export type RadarSubscription = z.infer<typeof RadarSubscriptionSchema>;
declare const VersionSchema: z.ZodObject<{
    ecosystem: z.ZodEnum<{
        npm: "npm";
        pypi: "pypi";
    }>;
    name: z.ZodString;
    current: z.ZodOptional<z.ZodString>;
    latest: z.ZodString;
    incompatible: z.ZodBoolean;
    breaking: z.ZodBoolean;
    deprecated: z.ZodBoolean;
    hash: z.ZodString;
}, z.core.$strict>;
export declare const RadarGitSchema: z.ZodObject<{
    head: z.ZodString;
    ref: z.ZodOptional<z.ZodString>;
    changes: z.ZodArray<z.ZodString>;
    dirty: z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        hash: z.ZodString;
    }, z.core.$strict>>;
    external: z.ZodArray<z.ZodString>;
    conflict: z.ZodOptional<z.ZodObject<{
        hash: z.ZodString;
        paths: z.ZodArray<z.ZodString>;
        previous: z.ZodString;
        head: z.ZodString;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type RadarGit = z.infer<typeof RadarGitSchema>;
export declare const RadarGitHubSchema: z.ZodObject<{
    branch: z.ZodString;
    runs: z.ZodArray<z.ZodObject<{
        id: z.ZodInt;
        failure: z.ZodBoolean;
    }, z.core.$strict>>;
    related: z.ZodArray<z.ZodObject<{
        number: z.ZodInt;
        kind: z.ZodEnum<{
            issue: "issue";
            pr: "pr";
        }>;
        hash: z.ZodString;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const RadarObservationSchema: z.ZodObject<{
    id: z.ZodString;
    goalId: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
    revision: z.ZodString;
    at: z.ZodNumber;
    source: z.ZodEnum<{
        dependencies: "dependencies";
        localGit: "localGit";
        github: "github";
    }>;
    purpose: z.ZodOptional<z.ZodLiteral<"excerpt">>;
    requests: z.ZodInt;
    cacheHits: z.ZodInt;
    etags: z.ZodArray<z.ZodObject<{
        endpoint: z.ZodString;
        tag: z.ZodString;
    }, z.core.$strict>>;
    failure: z.ZodOptional<z.ZodString>;
    retryAt: z.ZodOptional<z.ZodNumber>;
    versions: z.ZodOptional<z.ZodArray<z.ZodObject<{
        ecosystem: z.ZodEnum<{
            npm: "npm";
            pypi: "pypi";
        }>;
        name: z.ZodString;
        current: z.ZodOptional<z.ZodString>;
        latest: z.ZodString;
        incompatible: z.ZodBoolean;
        breaking: z.ZodBoolean;
        deprecated: z.ZodBoolean;
        hash: z.ZodString;
    }, z.core.$strict>>>;
    git: z.ZodOptional<z.ZodObject<{
        head: z.ZodString;
        ref: z.ZodOptional<z.ZodString>;
        changes: z.ZodArray<z.ZodString>;
        dirty: z.ZodArray<z.ZodObject<{
            path: z.ZodString;
            hash: z.ZodString;
        }, z.core.$strict>>;
        external: z.ZodArray<z.ZodString>;
        conflict: z.ZodOptional<z.ZodObject<{
            hash: z.ZodString;
            paths: z.ZodArray<z.ZodString>;
            previous: z.ZodString;
            head: z.ZodString;
        }, z.core.$strict>>;
    }, z.core.$strict>>;
    github: z.ZodOptional<z.ZodObject<{
        branch: z.ZodString;
        runs: z.ZodArray<z.ZodObject<{
            id: z.ZodInt;
            failure: z.ZodBoolean;
        }, z.core.$strict>>;
        related: z.ZodArray<z.ZodObject<{
            number: z.ZodInt;
            kind: z.ZodEnum<{
                issue: "issue";
                pr: "pr";
            }>;
            hash: z.ZodString;
        }, z.core.$strict>>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type RadarObservation = z.infer<typeof RadarObservationSchema>;
export type RadarVersion = z.infer<typeof VersionSchema>;
export type RadarGitHub = z.infer<typeof RadarGitHubSchema>;
export declare const RADAR_DETECTORS: readonly ["radarDependency", "radarCI", "radarConflict", "radarRelated"];
export declare const RADAR_DETECTOR_SOURCE: {
    readonly radarDependency: "dependencies";
    readonly radarCI: "github";
    readonly radarConflict: "localGit";
    readonly radarRelated: "github";
};
export type RadarDetector = keyof typeof RADAR_DETECTOR_SOURCE;
export type RadarFacts = {
    goal: Pick<ProjectGoal, 'id' | 'status'>;
    dependencies?: RadarObservation;
    github?: RadarObservation;
    localGit?: RadarObservation;
};
/** The input contains only typed snapshots. Each source fails independently. */
export declare const radarDetectors: {
    radarDependency(facts: RadarFacts): OpportunityCandidate[];
    radarCI(facts: RadarFacts): OpportunityCandidate[];
    radarConflict(facts: RadarFacts): OpportunityCandidate[];
    radarRelated(facts: RadarFacts): OpportunityCandidate[];
};
export {};
