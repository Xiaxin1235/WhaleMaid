import { z } from 'zod';
import type { NotificationPreferences } from './notify/model.js';
export declare const WorldPreferencesSchema: z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    petWalksIn: z.ZodDefault<z.ZodBoolean>;
    archived: z.ZodDefault<z.ZodArray<z.core.$ZodBranded<z.ZodString, "GoalId", "out">>>;
    camera: z.ZodOptional<z.ZodObject<{
        x: z.ZodNumber;
        y: z.ZodNumber;
        zoom: z.ZodNumber;
        room: z.ZodOptional<z.ZodUnion<readonly [z.core.$ZodBranded<z.ZodString, "GoalId", "out">, z.ZodEnum<{
            hall: "hall";
            kitchen: "kitchen";
            gallery: "gallery";
            bedroom: "bedroom";
        }>]>>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type WorldPreferences = z.infer<typeof WorldPreferencesSchema>;
export declare const WorldPreferencePatchSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"enabled">;
    value: z.ZodBoolean;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"petWalksIn">;
    value: z.ZodBoolean;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"camera">;
    value: z.ZodObject<{
        x: z.ZodNumber;
        y: z.ZodNumber;
        zoom: z.ZodNumber;
        room: z.ZodOptional<z.ZodUnion<readonly [z.core.$ZodBranded<z.ZodString, "GoalId", "out">, z.ZodEnum<{
            hall: "hall";
            kitchen: "kitchen";
            gallery: "gallery";
            bedroom: "bedroom";
        }>]>>;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"archive">;
    id: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
    value: z.ZodBoolean;
}, z.core.$strict>], "kind">;
export type WorldPreferencePatch = z.infer<typeof WorldPreferencePatchSchema>;
declare const progress: z.ZodObject<{
    done: z.ZodInt;
    total: z.ZodInt;
}, z.core.$strict>;
declare const task: z.ZodObject<{
    id: z.core.$ZodBranded<z.ZodString, "TaskId", "out">;
    title: z.ZodString;
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
}, z.core.$strict>;
declare const prop: z.ZodObject<{
    id: z.core.$ZodBranded<z.ZodString, "TaskId", "out">;
    title: z.ZodString;
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
    kind: z.ZodEnum<{
        files: "files";
        plant: "plant";
        toolbox: "toolbox";
        tray: "tray";
        basket: "basket";
        lamp: "lamp";
        books: "books";
        tank: "tank";
        keepsake: "keepsake";
    }>;
    ratio: z.ZodOptional<z.ZodNumber>;
    count: z.ZodOptional<z.ZodObject<{
        done: z.ZodInt;
        total: z.ZodInt;
    }, z.core.$strict>>;
    running: z.ZodBoolean;
    failed: z.ZodBoolean;
    wilted: z.ZodBoolean;
}, z.core.$strict>;
declare const goal: z.ZodObject<{
    id: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
    title: z.ZodString;
}, z.core.$strict>;
declare const room: z.ZodObject<{
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
    slots: z.ZodUnion<readonly [z.ZodLiteral<4>, z.ZodLiteral<6>, z.ZodLiteral<8>]>;
    taskCount: z.ZodInt;
    passed: z.ZodInt;
    items: z.ZodArray<z.ZodObject<{
        id: z.core.$ZodBranded<z.ZodString, "TaskId", "out">;
        title: z.ZodString;
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
        kind: z.ZodEnum<{
            files: "files";
            plant: "plant";
            toolbox: "toolbox";
            tray: "tray";
            basket: "basket";
            lamp: "lamp";
            books: "books";
            tank: "tank";
            keepsake: "keepsake";
        }>;
        ratio: z.ZodOptional<z.ZodNumber>;
        count: z.ZodOptional<z.ZodObject<{
            done: z.ZodInt;
            total: z.ZodInt;
        }, z.core.$strict>>;
        running: z.ZodBoolean;
        failed: z.ZodBoolean;
        wilted: z.ZodBoolean;
    }, z.core.$strict>>;
    cabinet: z.ZodArray<z.ZodObject<{
        id: z.core.$ZodBranded<z.ZodString, "TaskId", "out">;
        title: z.ZodString;
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
    }, z.core.$strict>>;
    mess: z.ZodNumber;
    decision: z.ZodOptional<z.ZodString>;
    card: z.ZodOptional<z.ZodString>;
    parcel: z.ZodBoolean;
    flicker: z.ZodBoolean;
    hold: z.ZodBoolean;
    paused: z.ZodBoolean;
    locked: z.ZodBoolean;
    working: z.ZodBoolean;
}, z.core.$strict>;
export declare const WorldSnapshotSchema: z.ZodObject<{
    time: z.ZodEnum<{
        day: "day";
        dawn: "dawn";
        evening: "evening";
        night: "night";
    }>;
    quiet: z.ZodBoolean;
    gateClosed: z.ZodBoolean;
    rooms: z.ZodArray<z.ZodObject<{
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
        slots: z.ZodUnion<readonly [z.ZodLiteral<4>, z.ZodLiteral<6>, z.ZodLiteral<8>]>;
        taskCount: z.ZodInt;
        passed: z.ZodInt;
        items: z.ZodArray<z.ZodObject<{
            id: z.core.$ZodBranded<z.ZodString, "TaskId", "out">;
            title: z.ZodString;
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
            kind: z.ZodEnum<{
                files: "files";
                plant: "plant";
                toolbox: "toolbox";
                tray: "tray";
                basket: "basket";
                lamp: "lamp";
                books: "books";
                tank: "tank";
                keepsake: "keepsake";
            }>;
            ratio: z.ZodOptional<z.ZodNumber>;
            count: z.ZodOptional<z.ZodObject<{
                done: z.ZodInt;
                total: z.ZodInt;
            }, z.core.$strict>>;
            running: z.ZodBoolean;
            failed: z.ZodBoolean;
            wilted: z.ZodBoolean;
        }, z.core.$strict>>;
        cabinet: z.ZodArray<z.ZodObject<{
            id: z.core.$ZodBranded<z.ZodString, "TaskId", "out">;
            title: z.ZodString;
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
        }, z.core.$strict>>;
        mess: z.ZodNumber;
        decision: z.ZodOptional<z.ZodString>;
        card: z.ZodOptional<z.ZodString>;
        parcel: z.ZodBoolean;
        flicker: z.ZodBoolean;
        hold: z.ZodBoolean;
        paused: z.ZodBoolean;
        locked: z.ZodBoolean;
        working: z.ZodBoolean;
    }, z.core.$strict>>;
    storage: z.ZodArray<z.ZodObject<{
        id: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
        title: z.ZodString;
    }, z.core.$strict>>;
    gallery: z.ZodArray<z.ZodObject<{
        id: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
        title: z.ZodString;
        summary: z.ZodString;
        experiences: z.ZodArray<z.ZodString>;
        passed: z.ZodInt;
        taskCount: z.ZodInt;
    }, z.core.$strict>>;
    actor: z.ZodObject<{
        room: z.ZodString;
        motion: z.ZodEnum<{
            idle: "idle";
            "sit-work": "sit-work";
            walk: "walk";
            sleep: "sleep";
        }>;
        from: z.ZodOptional<z.ZodString>;
        door: z.ZodOptional<z.ZodBoolean>;
        durationMs: z.ZodOptional<z.ZodInt>;
    }, z.core.$strict>;
}, z.core.$strict>;
export type WorldSnapshot = z.infer<typeof WorldSnapshotSchema>;
export type WorldRoom = z.infer<typeof room>;
export type WorldProp = z.infer<typeof prop>;
export type WorldTaskFact = z.infer<typeof task> & {
    tests?: {
        passed: number;
        failed: number;
    };
    steps?: z.infer<typeof progress>;
    running: boolean;
    failed: boolean;
    stalled: boolean;
};
export interface WorldGoalFact extends z.infer<typeof goal> {
    status: WorldRoom['status'];
    summary: string;
    experiences: string[];
    tasks: readonly WorldTaskFact[];
    stalled: number;
    repeatedFailure: boolean;
    decision?: string;
    card?: string;
    parcel: boolean;
    flicker: boolean;
    hold: boolean;
    locked: boolean;
}
export interface WorldFacts {
    goals: readonly WorldGoalFact[];
    paused: boolean;
    quietHours?: NotificationPreferences['quietHours'];
}
export declare function worldLayout(ids: readonly string[]): {
    id: string;
    floor: number;
    x: number;
    y: number;
}[];
export declare function buildWorld(facts: WorldFacts, now: number, prefs: {
    archived: readonly string[];
    timeZone: string;
}): WorldSnapshot;
export {};
