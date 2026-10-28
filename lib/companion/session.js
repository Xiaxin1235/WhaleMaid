import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { COMPANION_PRESET } from './service.js';
import { companionSessionIds } from '#whalemaid/core';
/** Create once, reuse across restarts, recreate when the user deleted it. Never sends a prompt. */
export class CompanionSessionManager {
    store;
    host;
    options;
    current = { state: 'starting' };
    pending;
    constructor(store, host, options) {
        this.store = store;
        this.host = host;
        this.options = options;
    }
    status() {
        return this.options.enabled() ? this.current : { state: 'disabled' };
    }
    sessionId() {
        return this.current.state === 'ready' ? this.current.sessionId : this.store.companionSession()?.sessionId;
    }
    /** Every session WhaleMaid ever used as the companion, so the gate keeps owning old ones after a rebuild. */
    allSessionIds() {
        const record = this.store.companionSession();
        return companionSessionIds(record, this.store.autopilotEvents.list());
    }
    ensure() {
        if (!this.options.enabled())
            return Promise.resolve({ state: 'disabled' });
        this.pending ??= this.run(false).finally(() => (this.pending = undefined));
        return this.pending;
    }
    /** Start a fresh companion session; the old one stays in Harness and in the gate's ownership. */
    rebuild() {
        if (!this.options.enabled())
            return Promise.resolve({ state: 'disabled' });
        const after = this.pending ?? Promise.resolve(this.current);
        this.pending = after.then(() => this.run(true)).finally(() => (this.pending = undefined));
        return this.pending;
    }
    /** Harness has no archive event; callers poll this and get a fresh session once hers is archived. */
    replaceIfArchived() {
        if (this.pending || this.current.state !== 'ready' || !this.options.enabled())
            return undefined;
        if (!this.host.archived?.(this.current.sessionId))
            return undefined;
        this.options.log('companion session archived; starting a new one');
        return this.rebuild();
    }
    async run(fresh) {
        try {
            this.current = { state: 'starting' };
            const record = this.store.companionSession();
            if (record &&
                !fresh &&
                !this.host.archived?.(record.sessionId) &&
                (await this.host.exists(record.sessionId))) {
                return await this.ready(record.sessionId, record.sessionId, fresh);
            }
            const cwd = join(this.options.dataDir, 'companion');
            await mkdir(cwd, { recursive: true });
            const id = randomUUID();
            // Own the identity before it exists, so its first tool call is already gated.
            this.store.setCompanionSession({
                sessionId: id,
                createdAt: Date.now(),
                previous: record ? [record.sessionId, ...record.previous].slice(0, 20) : [],
                // A new session starts on the user's default preset; nothing to move off read-only.
                writable: true,
            });
            const created = await this.host.create(id, cwd, this.options.title());
            if (created !== id)
                throw new Error('companion-identity-mismatch');
            return await this.ready(id, record?.sessionId, fresh);
        }
        catch (error) {
            this.options.log('companion session unavailable', error);
            return (this.current = {
                state: 'error',
                message: error instanceof Error ? error.message.slice(0, 200) : 'companion-unavailable',
            });
        }
    }
    async ready(id, previousId, fresh) {
        this.current = { state: 'ready', sessionId: id };
        try {
            await this.options.afterReady?.(previousId, fresh);
        }
        catch (error) {
            this.options.log('companion list cleanup unavailable', error);
        }
        return this.current;
    }
}
/** Production adapter over DSH's public session controller, agent registry and permission presets. */
export function dshCompanionHost(ctx) {
    const controller = () => {
        const c = ctx.get('sessionController');
        if (!c)
            throw new Error('session-controller-unavailable');
        return c;
    };
    return {
        async exists(id) {
            try {
                const inspected = await controller().inspect(id);
                return inspected.meta.agentPreset === COMPANION_PRESET;
            }
            catch (error) {
                if (error instanceof Error &&
                    ['ApiSessionNotFound', 'SessionPersistenceNotFoundError'].includes(error.name))
                    return false;
                throw error;
            }
        },
        async create(id, cwd, title) {
            // The Web UI only lets the user type into a blank session that belongs to a workspace, so the
            // companion's own directory becomes a workspace named after her (create returns an existing one).
            const registry = ctx.get('workspaceRegistry');
            const workspace = registry ? await registry.create(cwd, title) : undefined;
            const created = await controller().create({
                sessionId: id,
                ...(workspace ? { workspaceId: workspace.id } : { cwd }),
                agentPreset: COMPANION_PRESET,
            });
            if (created.agentPreset !== undefined && created.agentPreset !== COMPANION_PRESET)
                throw new Error('companion-preset-not-applied');
            await controller().rename({ sessionId: created.sessionId, title });
            return created.sessionId;
        },
        archived(id) {
            const registry = ctx.get('workspaceRegistry');
            return registry?.archivedSessionIds?.includes(id) ?? false;
        },
    };
}
//# sourceMappingURL=session.js.map