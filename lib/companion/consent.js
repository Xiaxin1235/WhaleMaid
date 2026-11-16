const confirmed = new WeakSet();
/** In-process capability, minted after a human answer. Never a JSON principal. */
export function managementConsent(signal) {
    const actor = { signal };
    confirmed.add(actor);
    return actor;
}
/** Only drafting and pause management accept this; grants remain owner-only. */
export function admitManagement(actor) {
    actor.signal.throwIfAborted();
    if (confirmed.has(actor))
        return;
    if (!('principal' in actor) || actor.principal.kind !== 'owner')
        throw Error('Authenticated owner required');
}
//# sourceMappingURL=consent.js.map