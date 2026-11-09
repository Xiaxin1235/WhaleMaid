import { z } from 'zod';
import { MemoryTextSchema } from '../memory/index.js';
import { redactSecrets } from './redact.js';
import { recallCopy } from '../i18n/recall.js';
export const JournalKindSchema = z.enum(['conversation', 'experience']);
export const JOURNAL_LIMIT = 300;
/** Oldest excess identities within one kind; host supplies only the persisted metadata. */
export function journalOverflow(rows) {
    return [...rows]
        .sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .slice(JOURNAL_LIMIT)
        .map((row) => row.id);
}
const common = {
    id: z.string().min(1).max(200),
    text: MemoryTextSchema,
    sessionId: z.string().min(1).max(200).optional(),
    createdAt: z.int().nonnegative(),
    status: z.enum(['active', 'deleted']),
};
/** Unconfirmed recollections are data, separate from memories and authorization. */
export const CompanionJournalSchema = z.discriminatedUnion('kind', [
    z
        .strictObject({
        ...common,
        kind: z.literal('conversation'),
        sessionId: z.string().min(1).max(200),
        fromSeq: z.int().nonnegative(),
        toSeq: z.int().nonnegative(),
    })
        .refine((v) => v.fromSeq <= v.toSeq),
    z.strictObject({
        ...common,
        kind: z.literal('experience'),
        refs: z.array(z.string().min(1).max(200)).min(1).max(10),
    }),
]);
export const RecallDraftSchema = z.discriminatedUnion('skip', [
    z.strictObject({ skip: z.literal(true) }),
    z.strictObject({ skip: z.undefined().optional(), text: MemoryTextSchema }),
]);
export const RecallQuerySchema = z.strictObject({
    kind: JournalKindSchema.optional(),
    query: z.string().max(300).optional(),
});
const order = (a, b) => b.createdAt - a.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const date = (at) => new Date(at).toISOString().slice(0, 10);
/** Stable date and literal text, escaping prompt-variable delimiters without interpreting content. */
export function journalLine(row) {
    return `[${date(row.createdAt)}] ${row.text.replaceAll('{{', '{ {')}`;
}
/** Five of each kind, under a shared code-unit budget including the data-only preamble. */
export function renderRecall(rows, locale) {
    const selected = JournalKindSchema.options.flatMap((kind) => rows
        .filter((r) => r.status === 'active' && r.kind === kind)
        .sort(order)
        .slice(0, 5));
    if (!selected.length)
        return '';
    const copy = recallCopy(locale), room = Math.floor((1500 - copy.preamble.length - selected.length) / selected.length);
    return [
        copy.preamble,
        ...selected.map((row) => {
            const line = `${copy[row.kind]} ${journalLine(row)}`;
            return line.length <= room
                ? line
                : Array.from(line.slice(0, room - 1))
                    .join('')
                    .replace(/[\uD800-\uDBFF]$/u, '') + '…';
        }),
    ].join('\n');
}
/** Literal retrieval, bounded by the complete JSON result, with dates and explicit truncation. */
export function searchRecall(rows, query) {
    const needle = query.query?.trim().toLowerCase();
    const matches = rows
        .filter((r) => r.status === 'active' &&
        (!query.kind || r.kind === query.kind) &&
        (!needle || r.text.toLowerCase().includes(needle)))
        .sort(order);
    const items = [];
    for (const row of matches.slice(0, 20)) {
        const item = { id: row.id, kind: row.kind, date: date(row.createdAt), text: row.text };
        if (JSON.stringify({ items: [...items, item], total: matches.length, truncated: false }).length > 4000)
            break;
        items.push(item);
    }
    return { items, total: matches.length, truncated: items.length < matches.length };
}
/** Only new human/assistant text from the supplied companion session; no tool or injected user sources. */
export function recallInput(events, afterSeq) {
    const messages = [];
    for (const event of events) {
        if (event.seq <= afterSeq)
            continue;
        const data = event.data;
        const role = event.type === 'user/message' && data?.source?.kind === 'user'
            ? 'user'
            : event.type === 'assistant/message'
                ? 'assistant'
                : undefined;
        if (!role)
            continue;
        const content = role === 'user' ? data?.content : data?.message?.content;
        if (!Array.isArray(content))
            continue;
        const text = redactSecrets(content
            .filter((p) => p?.type === 'text' && typeof p.text === 'string')
            .map((p) => p.text)
            .join('\n')).trim();
        if (text)
            messages.push({ seq: event.seq, role, text });
    }
    const picked = [];
    let room = 8000;
    for (const m of messages.toReversed()) {
        if (!room)
            break;
        const text = m.text.slice(-room);
        picked.unshift({ ...m, text });
        room -= text.length;
    }
    return picked;
}
/** Fixed-format structured experiences, never model-authored prose or action requests. */
export function experienceText(locale, action, outcome, title, at) {
    const c = recallCopy(locale), name = Array.from(title.replace(/\s+/g, ' ').trim()).slice(0, 80).join('');
    return c.experienceSentence(date(at), c.actions[action] ?? c.actions.manage, outcome, name);
}
//# sourceMappingURL=recall.js.map