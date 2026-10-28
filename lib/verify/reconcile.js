/** Inspect cold durable sessions without activating an Agent, resuming it, or submitting input. */
export function observeSession(ctx) {
    return async (id) => {
        const agents = ctx.get('agents');
        const live = agents?.get(id);
        const controller = ctx.get('sessionController');
        if (!controller || !agents)
            throw new Error('session-inspection-unavailable');
        try {
            const inspected = await controller.inspect(id);
            const firstEnd = inspected.events.find((event) => event.type === 'turn/end');
            const events = firstEnd
                ? inspected.events.filter((event) => event.seq <= firstEnd.seq)
                : inspected.events;
            const lastAssistant = events.filter((event) => event.type === 'assistant/message').at(-1);
            const lastEnd = events.filter((event) => event.type === 'turn/end').at(-1);
            const reply = lastAssistant?.type === 'assistant/message' &&
                !lastAssistant.data.interrupted &&
                !lastAssistant.data.message.content.some((part) => part.type === 'tool-call') &&
                lastAssistant.data.message.content.some((part) => part.type === 'text' && part.text.trim().length > 0);
            return {
                exists: true,
                running: live?.status === 'running',
                finalReplyNonempty: !!reply,
                ...(lastEnd?.type === 'turn/end' ? { endReason: lastEnd.data.reason.kind } : {}),
            };
        }
        catch (error) {
            // Only a documented missing session is absence; IO/format errors remain UNKNOWN.
            if (error instanceof Error &&
                ['ApiSessionNotFound', 'SessionPersistenceNotFoundError'].includes(error.name))
                return { exists: false, running: false, finalReplyNonempty: false };
            throw error;
        }
    };
}
//# sourceMappingURL=reconcile.js.map