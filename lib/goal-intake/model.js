/** One direct LLM request on the live default selection, with no tool definitions or retry loop. */
export function dshDraftModel(ctx) {
    return {
        async generate(prompt, signal) {
            const defaults = ctx.get('agentDefaultModel');
            const llm = ctx.get('llm');
            const selection = defaults?.currentSelection();
            if (!llm || !selection?.provider || !selection.model)
                throw new Error('model-not-configured');
            let text = '', completed = false;
            for await (const chunk of llm.stream({
                provider: selection.provider,
                model: selection.model,
                messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
                tools: [],
                maxTokens: 6000,
                signal,
            })) {
                signal.throwIfAborted();
                if (chunk.type === 'text-delta') {
                    text += chunk.text;
                    if (text.length > 64000)
                        throw new Error('draft-response-too-large');
                }
                if (chunk.type === 'tool-call-delta')
                    throw new Error('draft-tools-forbidden');
                if (chunk.type === 'finish') {
                    if (chunk.reason.kind !== 'stop')
                        throw new Error('model-call-failed');
                    completed = true;
                }
            }
            if (!completed)
                throw new Error('model-call-incomplete');
            return text;
        },
    };
}
//# sourceMappingURL=model.js.map