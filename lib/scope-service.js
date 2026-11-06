import { z } from 'zod';
import { ScopeContentSchema, ScopeIdSchema, hashScope, checkCommandMode } from '#whalemaid/core';
import { WhaleStore, productionClock, productionIdGen, sha256 } from './store/index.js';
export const ScopeDraftSchema = z
    .strictObject(ScopeContentSchema.shape)
    .omit({
    id: true,
    status: true,
    grantedAt: true,
    revokedAt: true,
})
    .superRefine(checkCommandMode);
/** Identity comes from admitted Connection peers, never from draft fields. */
function requireOwner(peer) {
    if (!peer || peer.principal.kind !== 'owner' || peer.signal.aborted) {
        throw new Error('Authenticated owner required');
    }
}
/** No grant endpoint is published until P07 presents the owner confirmation interface. */
export class ScopeService {
    store;
    deps;
    constructor(store, deps) {
        this.store = store;
        this.deps = deps;
    }
    grant(input, peer) {
        requireOwner(peer);
        const draft = ScopeDraftSchema.parse(input);
        const previous = this.activeScopeFor(draft.goalId);
        if (previous ? draft.supersedes !== previous.id : draft.supersedes !== undefined) {
            throw new Error('scope-version-conflict');
        }
        const scope = this.digest({
            ...draft,
            id: ScopeIdSchema.parse(this.deps.idGen.next('scope')),
            status: 'active',
            grantedAt: this.deps.clock.now(),
        });
        const superseded = previous && this.digest({ ...previous, status: 'superseded' });
        this.store.replaceScope(scope, superseded);
        return scope;
    }
    /** Commit first so every revocation observer reads the revoked state immediately. */
    revoke(scopeId, peer) {
        requireOwner(peer);
        const previous = this.store.scopes.get(ScopeIdSchema.parse(scopeId));
        if (!previous)
            throw new Error('scope-not-found');
        if (previous.status !== 'active')
            return previous;
        const next = this.digest({ ...previous, status: 'revoked', revokedAt: this.deps.clock.now() });
        this.store.writeScopeLifecycle(next);
        try {
            this.deps.revoked(next.id);
        }
        catch (error) {
            this.deps.log('scope revocation listener failed after commit', error);
        }
        return next;
    }
    /** Re-read and verify on each authorization lookup; never cache an active grant. */
    activeScopeFor(goalId) {
        const scope = this.store.scopes.list(goalId).find((scope) => scope.status === 'active');
        if (!scope)
            return undefined;
        const hash = hashScope(scope, this.deps.hasher);
        if (!hash.ok || hash.value !== scope.hash) {
            this.deps.log(`scope integrity mismatch ${scope.id}`);
            return undefined;
        }
        return scope;
    }
    digest(scope) {
        const content = ScopeContentSchema.parse(Object.fromEntries(Object.entries(scope).filter(([key]) => key !== 'hash')));
        const hash = hashScope(content, this.deps.hasher);
        if (!hash.ok)
            throw new Error(hash.error.code);
        return { ...content, hash: hash.value };
    }
}
/** Cordis emit/on is documented in cordis/lib/types/events.d.ts; event vocabulary is ours. */
export function createScopeService(ctx, store, log) {
    return new ScopeService(store, {
        clock: productionClock,
        idGen: productionIdGen,
        hasher: sha256,
        revoked: (scopeId) => ctx.emit('whaledot/scope-revoked', scopeId),
        log,
    });
}
//# sourceMappingURL=scope-service.js.map