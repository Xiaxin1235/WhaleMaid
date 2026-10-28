import type { AutopilotEvent } from '../autopilot/model.js';
export declare const COMPANION_ARCHIVE_ACTION = "archive-companion-session";
export declare const COMPANION_RESTORE_ACTION = "restore-companion-session";
/** Durable ownership survives the recent twenty-session projection through successful host audit records. */
export declare function companionSessionIds(record: {
    sessionId: string;
    previous: readonly string[];
} | undefined, events: readonly AutopilotEvent[]): string[];
export interface CompanionArchiveIdentity {
    agentPreset?: string | undefined;
    cwd?: string | undefined;
    origin?: string | undefined;
    createdAt?: number | undefined;
}
/** Three independent facts must agree: WhaleMaid ownership, companion preset, and the exact companion workspace. */
export declare function isOwnedCompanion(id: string, owned: readonly string[], identity: CompanionArchiveIdentity, workspace: {
    path: string;
    sessionIds: readonly string[];
} | undefined, expectedPath: string): boolean;
