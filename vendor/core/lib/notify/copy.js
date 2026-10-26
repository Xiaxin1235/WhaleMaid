import { notificationMessages } from '../i18n/notifications.js';
export { notificationMessages } from '../i18n/notifications.js';
/** Keep external titles on one plain-text line and out of Markdown/control structure. */
export function shortTitle(value) {
    return Array.from(value
        .replace(/[\p{Cc}]+/gu, ' ')
        .replace(/[[\]()*_#`~>\\]/g, '')
        .replace(/\s+/g, ' ')
        .trim())
        .slice(0, 40)
        .join('');
}
/** Normalize known ledger reason prefixes; arbitrary diagnostics only select the generic template. */
export function notificationReason(n) {
    const key = (n.reason ?? '').split(':')[0].trim();
    if (Object.hasOwn(notificationMessages.en, key))
        return key;
    return n.kind === 'blocked' ? 'autopilot-disabled' : 'decision';
}
/** Render deterministic copy from bounded titles and structured counts, never model completion text. */
export function notificationCopy(n, facts, locale) {
    const key = notificationReason(n);
    const [header, template] = notificationMessages[locale][key];
    const count = (value) => value === undefined ? (locale === 'zh-CN' ? '未知' : 'unknown') : String(value);
    const params = {
        goal: shortTitle(facts.goalTitle),
        steps: count(facts.completedTasks),
        before: count(facts.beforeFailed),
        after: count(facts.afterFailed),
    };
    const question = template.replace(/\{(\w+)\}/g, (_, name) => params[name] ?? '');
    return {
        header,
        question: locale === 'zh-CN' ? Array.from(question).slice(0, 80).join('') : question,
        detail: [shortTitle(facts.goalTitle), facts.taskTitle ? shortTitle(facts.taskTitle) : '']
            .filter(Boolean)
            .join(' · '),
    };
}
//# sourceMappingURL=copy.js.map