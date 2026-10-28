import type { Context } from '@deepseek-ai/cordis';
import type { CompanionArchiveIdentity } from '#whalemaid/core';
import type { WhaleStore } from '../store/index.js';
/** Verified narrow surface of dsh-workspace 0.2.1-rc.2; no workspace removal or stopActivity capability. */
export interface CompanionArchiveHost {
    workspace(): {
        path: string;
        sessionIds: readonly string[];
    } | undefined;
    archived(): readonly string[];
    inspect(id: string): Promise<CompanionArchiveIdentity>;
    archive(id: string): Promise<void>;
    restore(id: string): Promise<void>;
}
export declare class CompanionArchives {
    readonly store: WhaleStore;
    private readonly host;
    private readonly deps;
    private tail;
    private stopped;
    private available;
    private readonly verified;
    constructor(store: WhaleStore, host: CompanionArchiveHost, deps: {
        enabled(): boolean;
        current(): string | undefined;
        owned(): string[];
        dataDir: string;
        summarize(id: string): Promise<void>;
        log(message: string): void;
        now?(): number;
        id?(): string;
    });
    private queue;
    private identity;
    private audit;
    private diagnose;
    private archive;
    /** One startup pass, including recovery of an accidentally archived current companion. */
    startup(): Promise<void>;
    /** Rotation creates the new conversation first, then waits for P15 before archiving its predecessor. */
    rotated(oldId: string | undefined): Promise<void>;
    view(): {
        enabled: boolean;
        available: boolean;
        items: {
            id: string;
            createdAt: number;
        }[];
    };
    /** The authenticated owner restores only proven earlier companions, never arbitrary caller ids. */
    restore(id?: string): Promise<{
        restored: number;
        failed: number;
    }>;
    dispose(): Promise<void>;
}
/** Production adapter over the exact public registry and session inspection interfaces. */
export declare function dshCompanionArchiveHost(ctx: Context, dataDir: string): CompanionArchiveHost;
