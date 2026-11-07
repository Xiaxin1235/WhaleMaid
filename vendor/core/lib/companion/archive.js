import { normalizeScopePath } from '../scope-path.js';
export const COMPANION_ARCHIVE_ACTION = 'archive-companion-session';
export const COMPANION_RESTORE_ACTION = 'restore-companion-session';
/** Durable ownership survives the recent twenty-session projection through successful host audit records. */
export function companionSessionIds(record, events) {
    return [
        ...new Set([
            ...(record ? [record.sessionId, ...record.previous] : []),
            ...events
                .filter((e) => e.actor === 'companion' &&
                [COMPANION_ARCHIVE_ACTION, COMPANION_RESTORE_ACTION].includes(e.action) &&
                e.reason === 'succeeded')
                .flatMap((e) => (e.sessionId ? [e.sessionId] : [])),
        ]),
    ];
}
/** Three independent facts must agree: WhaleMaid ownership, companion preset, and the exact companion workspace. */
export function isOwnedCompanion(id, owned, identity, workspace, expectedPath) {
    const expected = normalizeScopePath(expectedPath);
    return (!!expected &&
        owned.includes(id) &&
        identity.agentPreset === 'whaledot-companion' &&
        !identity.origin &&
        !!identity.cwd &&
        normalizeScopePath(identity.cwd) === expected &&
        !!workspace &&
        normalizeScopePath(workspace.path) === expected &&
        workspace.sessionIds.includes(id));
}
//# sourceMappingURL=archive.js.map