import type { WorldPreferencePatch, WorldPreferences } from '#whalemaid/core';
import type { WhaleStore } from './store/index.js';
import type { RadarService } from './radar/service.js';
export declare class Mansion {
    private readonly store;
    private readonly radar;
    private readonly defaults;
    constructor(store: WhaleStore, radar: Pick<RadarService, 'facts' | 'hold'>, defaults: {
        enabled?: boolean;
        petWalksIn?: boolean;
    } | undefined);
    preferences(): WorldPreferences;
    update(patch: WorldPreferencePatch): WorldPreferences;
    snapshot(now?: number): {
        preferences: {
            enabled: boolean;
            petWalksIn: boolean;
            archived: (string & import("zod").$brand<"GoalId">)[];
            camera?: {
                x: number;
                y: number;
                zoom: number;
                room?: (string & import("zod").$brand<"GoalId">) | "hall" | "kitchen" | "gallery" | "bedroom" | undefined;
            } | undefined;
        };
        snapshot: {
            time: "day" | "dawn" | "evening" | "night";
            quiet: boolean;
            gateClosed: boolean;
            rooms: {
                id: string & import("zod").$brand<"GoalId">;
                title: string;
                status: "completed" | "cancelled" | "draft" | "active" | "paused" | "succeeded";
                slots: 4 | 6 | 8;
                taskCount: number;
                passed: number;
                items: {
                    id: string & import("zod").$brand<"TaskId">;
                    title: string;
                    state: "PENDING" | "READY" | "RUNNING" | "VERIFYING" | "SUCCEEDED" | "WAITING_APPROVAL" | "BLOCKED" | "FAILED" | "UNKNOWN" | "PAUSED" | "CANCELLED";
                    kind: "files" | "plant" | "toolbox" | "tray" | "basket" | "lamp" | "books" | "tank" | "keepsake";
                    running: boolean;
                    failed: boolean;
                    wilted: boolean;
                    ratio?: number | undefined;
                    count?: {
                        done: number;
                        total: number;
                    } | undefined;
                }[];
                cabinet: {
                    id: string & import("zod").$brand<"TaskId">;
                    title: string;
                    state: "PENDING" | "READY" | "RUNNING" | "VERIFYING" | "SUCCEEDED" | "WAITING_APPROVAL" | "BLOCKED" | "FAILED" | "UNKNOWN" | "PAUSED" | "CANCELLED";
                }[];
                mess: number;
                parcel: boolean;
                flicker: boolean;
                hold: boolean;
                paused: boolean;
                locked: boolean;
                working: boolean;
                decision?: string | undefined;
                card?: string | undefined;
            }[];
            storage: {
                id: string & import("zod").$brand<"GoalId">;
                title: string;
            }[];
            gallery: {
                id: string & import("zod").$brand<"GoalId">;
                title: string;
                summary: string;
                experiences: string[];
                passed: number;
                taskCount: number;
            }[];
            actor: {
                room: string;
                motion: "idle" | "sit-work" | "walk" | "sleep";
                from?: string | undefined;
                door?: boolean | undefined;
                durationMs?: number | undefined;
            };
        };
    };
}
