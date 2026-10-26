import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { isOwnedCompanion, normalizeScopePath, COMPANION_ARCHIVE_ACTION, COMPANION_RESTORE_ACTION, } from '#whalemaid/core';
export class CompanionArchives {
    store;
    host;
    deps;
    tail = Promise.resolve();
    stopped = false;
    available = true;
    verified = new Map();
    constructor(store, host, deps) {
        this.store = store;
        this.host = host;
        this.deps = deps;
    }
    queue(run) {
        const work = this.tail.then(run);
        this.tail = work.catch(() => { });
        return work;
    }
    async identity(id) {
        const meta = await this.host.inspect(id);
        const ok = isOwnedCompanion(id, this.deps.owned(), meta, this.host.workspace(), join(this.deps.dataDir, 'companion'));
        if (ok)
            this.verified.set(id, meta);
        else
            this.verified.delete(id);
        return ok;
    }
    audit(id, action) {
        this.store.autopilotEvents.insert({
            id: this.deps.id?.() ?? randomUUID(),
            actor: 'companion',
            sessionId: id,
            action,
            reason: 'succeeded',
            at: this.deps.now?.() ?? Date.now(),
        });
    }
    diagnose() {
        this.available = false;
        this.deps.log('companion archive unavailable; conversation remains usable');
    }
    async archive(id) {
        if (this.stopped || !this.deps.enabled() || id === this.deps.current())
            return;
        if (!(await this.identity(id)) || this.host.archived().includes(id))
            return;
        await this.deps.summarize(id);
        if (this.stopped || !this.deps.enabled() || id === this.deps.current() || !(await this.identity(id)))
            return;
        // Never stop an active turn to tidy a list. The host rejects active-session archival.
        await this.host.archive(id);
        this.audit(id, COMPANION_ARCHIVE_ACTION);
    }
    /** One startup pass, including recovery of an accidentally archived current companion. */
    startup() {
        return this.queue(async () => {
            for (const id of this.deps.owned()) {
                if (this.stopped)
                    return;
                try {
                    if (!(await this.identity(id)))
                        continue;
                    if (id === this.deps.current()) {
                        if (this.host.archived().includes(id)) {
                            await this.host.restore(id);
                            this.audit(id, COMPANION_RESTORE_ACTION);
                        }
                    }
                    else
                        await this.archive(id);
                }
                catch {
                    this.diagnose();
                }
            }
        });
    }
    /** Rotation creates the new conversation first, then waits for P15 before archiving its predecessor. */
    rotated(oldId) {
        return this.queue(async () => {
            if (!oldId)
                return;
            try {
                await this.archive(oldId);
            }
            catch {
                this.diagnose();
            }
        });
    }
    view() {
        try {
            const archived = new Set(this.host.archived()), workspace = this.host.workspace();
            const items = [...this.verified]
                .filter(([id, meta]) => id !== this.deps.current() &&
                archived.has(id) &&
                isOwnedCompanion(id, this.deps.owned(), meta, workspace, join(this.deps.dataDir, 'companion')))
                .map(([id, meta]) => ({ id, createdAt: meta.createdAt ?? 0 }));
            return { enabled: this.deps.enabled(), available: this.available, items };
        }
        catch {
            return { enabled: this.deps.enabled(), available: false, items: [] };
        }
    }
    /** The authenticated owner restores only proven earlier companions, never arbitrary caller ids. */
    restore(id) {
        return this.queue(async () => {
            let restored = 0, failed = 0;
            const ids = id ? [id] : this.view().items.map((item) => item.id);
            for (const target of ids) {
                if (this.stopped)
                    break;
                try {
                    if (target === this.deps.current() ||
                        !this.deps.owned().includes(target) ||
                        !(await this.identity(target)) ||
                        !this.host.archived().includes(target))
                        continue;
                    await this.host.restore(target);
                    this.audit(target, COMPANION_RESTORE_ACTION);
                    restored++;
                }
                catch {
                    failed++;
                    this.diagnose();
                }
            }
            return { restored, failed };
        });
    }
    async dispose() {
        this.stopped = true;
        await this.tail;
    }
}
/** Production adapter over the exact public registry and session inspection interfaces. */
export function dshCompanionArchiveHost(ctx, dataDir) {
    const registry = () => {
        const value = ctx.get('workspaceRegistry');
        if (!value)
            throw Error('workspace-registry-unavailable');
        return value;
    };
    return {
        workspace: () => registry()
            .list()
            .find((w) => normalizeScopePath(w.path) === normalizeScopePath(join(dataDir, 'companion'))),
        archived: () => registry().archivedSessionIds,
        async inspect(id) {
            const controller = ctx.get('sessionController');
            if (!controller)
                throw Error('session-controller-unavailable');
            return (await controller.inspect(id, AbortSignal.timeout(15000))).meta;
        },
        archive: (id) => registry().archiveSession(id),
        restore: (id) => registry().unarchiveSession(id),
    };
}
//# sourceMappingURL=archive.js.map