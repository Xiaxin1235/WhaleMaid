import { COMPANION_PRESET } from './service.js';
/**
 * Earlier versions pinned her session to `read-only`. She now works like an ordinary conversation, so
 * move her current session to `workspace-write` once. After that the user owns the preset (`/permission`).
 * A cold session has no agent yet, so this waits for her agent to be created or to take a step.
 */
export function installCompanionPermission(ctx, store, log) {
    ctx.inject(['permissionPresets'], (child) => {
        const release = (agent) => {
            if (agent.session.header.agentPreset !== COMPANION_PRESET)
                return;
            const record = store.companionSession();
            if (!record || record.writable || record.sessionId !== agent.session.id)
                return;
            try {
                if (child.permissionPresets.current(agent.session) === 'read-only')
                    child.permissionPresets.set(agent.session, 'workspace-write');
                store.setCompanionSession({ ...record, writable: true });
            }
            catch (error) {
                log('companion permission release unavailable', error);
            }
        };
        for (const agent of child.get('agents')?.list() ?? [])
            release(agent);
        child.on('agent/created', ({ agent }) => {
            release(agent);
            return undefined;
        });
        child.on('agent/pre-step', async (payload, next) => {
            release(payload.agent);
            return next();
        }, { prepend: true });
    });
}
//# sourceMappingURL=permission.js.map