import { randomUUID } from 'node:crypto';
/** Trusted host-local service calls require no cached browser identity. Owner admission is checked only for this launch. */
export function dshRunner(ctx) {
    return {
        async launch(request) {
            if (request.via.kind === 'panel' &&
                (request.via.peer.principal.kind !== 'owner' || request.via.peer.signal.aborted))
                throw new Error('owner-required');
            const controller = ctx.get('sessionController');
            const presets = ctx.get('permissionPresets');
            if (!controller || !presets || !ctx.get('tools'))
                throw new Error('execution-services-unavailable');
            request.check();
            const created = await controller.create({ cwd: request.cwd, sessionId: randomUUID() });
            const sessions = ctx.get('sessions');
            const session = sessions?.get(created.sessionId);
            if (!session)
                throw new Error('session-not-live');
            presets.set(session, request.preset);
            if (presets.current(session) !== request.preset)
                throw new Error('permission-preset-mismatch');
            await controller.rename({ sessionId: created.sessionId, title: request.title });
            request.check();
            request.register(created.sessionId);
            request.check();
            // Exactly one send. An ambiguous receipt is reconciled as UNKNOWN, never retried.
            await controller.prompt({
                sessionId: created.sessionId,
                requestId: randomUUID(),
                mode: 'queue',
                content: [{ type: 'text', text: request.prompt }],
            }, new AbortController().signal);
            return created.sessionId;
        },
        cancel(sessionId) {
            const controller = ctx.get('sessionController');
            controller?.cancel({ sessionId: sessionId });
        },
    };
}
//# sourceMappingURL=dsh-runner.js.map