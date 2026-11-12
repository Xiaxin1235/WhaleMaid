/** DSH 0.2.1-rc.2: dsh-session/lib/types/types.d.ts:166-211,256-389. */
export function mapSessionEvent(sessionId, event) {
    const base = { sessionId, at: event.time };
    switch (event.type) {
        case 'turn/start':
            return { ...base, kind: 'turn-start' };
        case 'tool/call':
            return { ...base, kind: 'tool-call', toolName: event.data.name };
        case 'tool/result':
            return { ...base, kind: 'tool-result' };
        case 'turn/end': {
            const reason = event.data.reason?.kind;
            const endReason = reason === 'completed' ||
                reason === 'error' ||
                reason === 'max-tokens' ||
                reason === 'interrupted' ||
                reason === 'blocked' ||
                reason === 'aborted'
                ? reason
                : 'unknown';
            return { ...base, kind: 'turn-end', endReason };
        }
        default:
            return undefined;
    }
}
/** DSH-specific subscriptions stay here. No message, arguments or result content is retained. */
export function createSessionEventSource(ctx, now) {
    return {
        subscribe(cb) {
            const disposers = [];
            try {
                disposers.push(ctx.on('session/event', (session, event) => {
                    const signal = mapSessionEvent(session.id, event);
                    if (signal)
                        cb(signal);
                }));
                disposers.push(ctx.on('session/disposed', (session) => {
                    cb({ sessionId: session.id, kind: 'session-disposed', at: now() });
                }));
            }
            catch (error) {
                for (const dispose of disposers.reverse())
                    dispose();
                throw error;
            }
            return () => {
                for (const dispose of disposers.splice(0).reverse())
                    dispose();
            };
        },
    };
}
//# sourceMappingURL=session-events.js.map