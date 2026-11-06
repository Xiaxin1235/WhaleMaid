import { z } from 'zod';
import { dailyBriefCopy } from '../i18n/daily-brief.js';
import { shortTitle } from '../notify/copy.js';
import { redactSecrets } from './redact.js';
export const DailyGoalChangesSchema = z.array(z.object({ goalId: z.string(), status: z.string(), at: z.number() }));
export const DailyBriefQuerySchema = z.strictObject({ date: z.iso.date().optional() });
export const DailyBriefRecordSchema = z.strictObject({
    date: z.iso.date(),
    generatedAt: z.number(),
    from: z.number(),
    to: z.number(),
    text: z.string().min(1).max(1200),
    deliveredAt: z.number().optional(),
    decisions: z.array(z.object({ id: z.string(), goalId: z.string(), title: z.string() })).max(5),
});
export function briefTitle(value) {
    return shortTitle(redactSecrets(value).replaceAll('{{', '{ {'));
}
const order = (rows) => [...rows].sort((a, b) => b.at - a.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
/** Stable bounded rendering. Each section has its own budget so decisions cannot be crowded out. */
export function buildDailyBrief(facts, locale) {
    if (!facts.completed.length &&
        !facts.problems.length &&
        !facts.decisions.length &&
        !facts.proposals.length &&
        !facts.experiences.length &&
        !facts.automation.runs &&
        !facts.automation.plans)
        return '';
    const c = dailyBriefCopy(locale);
    const status = (s) => c.statuses[s] ?? c.statuses.UNKNOWN;
    const item = (v) => `${c[v.kind]} ${briefTitle(v.title)} · ${status(v.status)}`;
    const sections = [
        [c.completed, order(facts.completed).map(item)],
        [c.problems, order(facts.problems).map(item)],
        [
            `${c.waiting} (${c.decisions(facts.decisions.length)})`,
            order(facts.decisions).map((v) => briefTitle(v.title)),
        ],
        [
            c.automation,
            facts.automation.runs || facts.automation.plans || facts.automation.quotas.length
                ? [
                    c.usage(facts.automation.runs, facts.automation.plans),
                    ...[...facts.automation.quotas]
                        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
                        .map((v) => `${briefTitle(v.title)} · ${c.remaining(v.runsRemaining, v.plansRemaining)}`),
                ]
                : [],
        ],
        [
            c.proposals,
            [
                ...order(facts.proposals).map((v) => `${briefTitle(v.title)} · ${c.actions[v.action] ?? c.proposed} · ${v.confirmed ? c.confirmed : c.proposed}`),
                ...order(facts.experiences).map(() => c.experience),
            ],
        ],
    ];
    return sections
        .filter(([, rows]) => rows.length)
        .map(([heading, rows]) => {
        const selected = [];
        // 238 code units per section including heading, bullets and overflow. Total <=1198.
        for (const row of rows.slice(0, 5)) {
            const next = '• ' + row;
            const omitted = rows.length - selected.length - 1;
            const tail = omitted ? '\n' + c.more(omitted) : '';
            if ([heading, ...selected, next].join('\n').length + tail.length > 238)
                break;
            selected.push(next);
        }
        // A long title must still show something; titles use the shared shortTitle rule first.
        if (!selected.length)
            selected.push('• ' + rows[0].slice(0, 145) + '…');
        if (rows.length > selected.length)
            selected.push(c.more(rows.length - selected.length));
        return [heading, ...selected].join('\n');
    })
        .join('\n\n');
}
//# sourceMappingURL=daily-brief.js.map