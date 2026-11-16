import { companionTools } from './tools.js';
/** Prompt variable the preset's persona row renders (`prefix: '{{whaledot_persona}}'`). */
export const PERSONA_VARIABLE = 'whaledot_persona';
/**
 * Child plugin of the `whaledot-companion` agent preset. It runs in that agent's scope only, so the
 * persona variable and the read-only tools exist for the companion session and for no other session.
 */
export const name = 'whaledot-companion-agent';
export const inject = ['tools', 'systemPrompt', 'whaledotCompanion'];
export function apply(ctx) {
    const api = ctx.whaledotCompanion;
    const prompt = ctx.get('systemPrompt');
    prompt.variable(PERSONA_VARIABLE, () => api.persona());
    prompt.variable('whaledot_memory', () => api.memory?.block() ?? '');
    prompt.variable('whaledot_recall', () => api.recall?.block() ?? '');
    prompt.variable('whaledot_brief', (env) => api.brief?.block(env.agent) ?? '');
    ctx.on('agent/inbox/claimed', ({ agent, turn, message }) => {
        api.brief?.enter(agent, turn, [message]);
    });
    prompt.variable('whaledot_memory_guidance', () => api.memory?.guidance() ?? '');
    for (const tool of companionTools(api))
        ctx.tools.register(tool);
}
//# sourceMappingURL=agent.js.map