import { randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';
import { shortTitle } from '#whalemaid/core';
/** A read-only runtime root carries questions only; this adapter has no prompt/model call. */
export function dshInbox(ctx, store) {
    const preparing = new Map();
    const prepare = async (goalId) => {
        const goal = store.goals.get(goalId);
        const controller = ctx.get('sessionController');
        if (!controller)
            throw Error('inbox-service-unavailable');
        let id = goal.inboxSessionId;
        if (id) {
            if (store.inboxSessions.get(id)?.goalId !== goalId)
                throw Error('inbox-ownership-missing');
            try {
                await controller.inspect(id);
            }
            catch (error) {
                if (error instanceof Error &&
                    ['ApiSessionNotFound', 'SessionPersistenceNotFoundError'].includes(error.name))
                    id = undefined;
                else
                    throw error;
            }
        }
        if (!id) {
            id = randomUUID();
            // Register the requested identity before it is visible to any UI or tools.
            store.inboxSessions.insert({ id, goalId, at: Date.now() });
            let cwd = store.tasks
                .list(goalId)
                .flatMap((t) => store.runs.list(t.id))
                .at(-1)?.worktreePath ?? goal.projectRoot;
            try {
                await access(cwd);
            }
            catch {
                cwd = goal.projectRoot;
            }
            const created = await controller.create({ sessionId: id, cwd });
            if (created.sessionId !== id)
                throw Error('inbox-identity-mismatch');
            const fresh = store.goals.get(goalId);
            store.goals.update({ ...fresh, inboxSessionId: id, version: fresh.version + 1 }, fresh.version);
        }
        await controller.rename({ sessionId: id, title: `[WhaleMaid] ${shortTitle(goal.title)}` });
        const agents = ctx.get('agents');
        const presets = ctx.get('permissionPresets');
        const agent = agents?.get(id);
        if (!agent || !presets)
            throw Error('inbox-agent-unavailable');
        presets.set(agent.session, 'read-only');
        if (presets.current(agent.session) !== 'read-only')
            throw Error('inbox-preset-mismatch');
        return id;
    };
    const ready = (goalId) => {
        let pending = preparing.get(goalId);
        if (!pending) {
            pending = prepare(goalId).finally(() => preparing.delete(goalId));
            preparing.set(goalId, pending);
        }
        return pending;
    };
    return {
        async prepare(goalId) {
            await ready(goalId);
        },
        async ask(goalId, question, signal) {
            const id = await ready(goalId);
            signal.throwIfAborted();
            const agents = ctx.get('agents');
            const questions = ctx.get('userQuestions');
            const agent = agents?.get(id);
            if (!agent || !questions)
                throw Error('inbox-service-unavailable');
            return questions.ask({ agent, questions: [question], signal });
        },
    };
}
//# sourceMappingURL=inbox-session.js.map