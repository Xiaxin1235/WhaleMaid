import type { Context } from '@deepseek-ai/cordis';
import type { WhaleStore } from '../store/index.js';
export type CompanionState = {
    state: 'disabled';
} | {
    state: 'starting';
} | {
    state: 'ready';
    sessionId: string;
} | {
    state: 'error';
    message: string;
};
/** The DSH calls the companion lifecycle needs; production wraps `sessionController` and friends. */
export interface CompanionHost {
    exists(id: string): Promise<boolean>;
    create(id: string, cwd: string, title: string): Promise<string>;
    /** Archived in Harness: the pet locks its input, so it can no longer be her current session. */
    archived?(id: string): boolean;
}
/** Create once, reuse across restarts, recreate when the user deleted it. Never sends a prompt. */
export declare class CompanionSessionManager {
    private readonly store;
    private readonly host;
    private readonly options;
    private current;
    private pending;
    constructor(store: WhaleStore, host: CompanionHost, options: {
        dataDir: string;
        enabled: () => boolean;
        title: () => string;
        log: (message: string, error?: unknown) => void;
        afterReady?: (previousId: string | undefined, fresh: boolean) => Promise<void>;
    });
    status(): CompanionState;
    sessionId(): string | undefined;
    /** Every session WhaleMaid ever used as the companion, so the gate keeps owning old ones after a rebuild. */
    allSessionIds(): string[];
    ensure(): Promise<CompanionState>;
    /** Start a fresh companion session; the old one stays in Harness and in the gate's ownership. */
    rebuild(): Promise<CompanionState>;
    /** Harness has no archive event; callers poll this and get a fresh session once hers is archived. */
    replaceIfArchived(): Promise<CompanionState> | undefined;
    private run;
    private ready;
}
/** Production adapter over DSH's public session controller, agent registry and permission presets. */
export declare function dshCompanionHost(ctx: Context): CompanionHost;
