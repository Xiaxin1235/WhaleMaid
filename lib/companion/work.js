import { randomUUID } from 'node:crypto';
import { inspectProject } from '../goal-intake/project.js';
/** Title of a conversation she started. No `[WhaleMaid]` prefix: it is ordinary work, not an autopilot task. */
export function workTitle(task, locale) {
    const first = task.split(/\r?\n/)[0].trim();
    const short = Array.from(first).length > 40 ? Array.from(first).slice(0, 40).join('') + '…' : first;
    return locale === 'zh-CN' ? `大肥鱼派的活：${short}` : `Work from Da Fei Yu: ${short}`;
}
/**
 * Open an ordinary conversation in the project and send it the task. It gets the user's default
 * permission preset and approvals like any conversation the user opens; nothing is granted here.
 */
export async function startWork(ctx, input, locale) {
    const facts = await inspectProject(input.projectRoot);
    const controller = ctx.get('sessionController');
    if (!controller)
        throw Error('session-controller-unavailable');
    // A workspace makes the conversation show up under the project in Harness's sidebar.
    const registry = ctx.get('workspaceRegistry');
    const workspace = registry ? await registry.create(facts.projectRoot) : undefined;
    const created = await controller.create({
        sessionId: randomUUID(),
        ...(workspace ? { workspaceId: workspace.id } : { cwd: facts.projectRoot }),
    });
    await controller.rename({ sessionId: created.sessionId, title: workTitle(input.task, locale) });
    await controller.prompt({
        sessionId: created.sessionId,
        requestId: randomUUID(),
        mode: 'queue',
        content: [{ type: 'text', text: input.task }],
    }, new AbortController().signal);
    return { sessionId: created.sessionId };
}
//# sourceMappingURL=work.js.map