import { redactSecrets } from './redact.js';
const record = (value) => value !== null && typeof value === 'object' ? value : undefined;
function textParts(content) {
    if (!Array.isArray(content))
        return '';
    return content
        .map((part) => {
        const p = record(part);
        return p?.type === 'text' && typeof p.text === 'string' ? p.text : '';
    })
        .filter(Boolean)
        .join('\n')
        .trim();
}
/** Map one event to a readable line; tool traffic is reduced to a name and outcome, never its payload. */
function toMessage(event, toolNames) {
    const data = record(event.data);
    if (!data)
        return undefined;
    if (event.type === 'user/message') {
        // Only what a person typed: runtime context, skill catalogs and other producers also append
        // user-role messages, with their own `source.kind`.
        const source = record(data.source);
        if (source && source.kind !== 'user')
            return undefined;
        const text = textParts(data.content);
        return text ? { seq: event.seq, role: 'user', text } : undefined;
    }
    if (event.type === 'assistant/message') {
        const message = record(data.message);
        const text = textParts(message?.content);
        return text ? { seq: event.seq, role: 'assistant', text } : undefined;
    }
    if (event.type === 'tool/call' && typeof data.name === 'string') {
        if (typeof data.callId === 'string')
            toolNames.set(data.callId, data.name);
        return undefined;
    }
    if (event.type === 'tool/result') {
        const message = record(data.message);
        const callId = typeof message?.toolCallId === 'string' ? message.toolCallId : undefined;
        const name = (callId && toolNames.get(callId)) || 'tool';
        return { seq: event.seq, role: 'tool', text: `${name}: ${data.error ? 'failed' : 'ok'}` };
    }
    return undefined;
}
/** Latest messages before `beforeSeq`, newest kept, secrets redacted, bounded by count and characters. */
export function readTranscript(events, options = {}) {
    const maxMessages = Math.max(1, Math.min(options.maxMessages ?? 20, 50));
    const maxChars = Math.max(200, Math.min(options.maxChars ?? 8000, 20000));
    const toolNames = new Map();
    const all = [];
    for (const event of events) {
        const message = toMessage(event, toolNames);
        if (message && (options.beforeSeq === undefined || message.seq < options.beforeSeq))
            all.push(message);
    }
    const picked = [];
    let used = 0;
    let truncated = false;
    for (let i = all.length - 1; i >= 0 && picked.length < maxMessages; i--) {
        const message = all[i];
        let text = redactSecrets(message.text);
        const room = maxChars - used;
        if (room <= 0)
            break;
        if (text.length > room) {
            text = text.slice(0, room) + '…';
            truncated = true;
        }
        used += text.length;
        picked.unshift({ ...message, text });
    }
    const first = picked[0];
    const hasEarlier = first !== undefined && all.some((m) => m.seq < first.seq);
    return { messages: picked, truncated, ...(hasEarlier ? { nextBeforeSeq: first.seq } : {}) };
}
/** The latest `session/title` value, if the session has one. */
export function transcriptTitle(events) {
    for (let i = events.length - 1; i >= 0; i--) {
        const event = events[i];
        const data = record(event.data);
        if (event.type === 'session/title' && typeof data?.title === 'string' && data.title.trim())
            return data.title.trim();
    }
    return undefined;
}
//# sourceMappingURL=transcript.js.map