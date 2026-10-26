import type { Locale } from '../i18n/index.js';
import type { Notification } from '../model/notification.js';
export { notificationMessages } from '../i18n/notifications.js';
export interface NotificationFacts {
    goalTitle: string;
    taskTitle?: string;
    completedTasks?: number;
    beforeFailed?: number | undefined;
    afterFailed?: number | undefined;
}
/** Keep external titles on one plain-text line and out of Markdown/control structure. */
export declare function shortTitle(value: string): string;
/** Normalize known ledger reason prefixes; arbitrary diagnostics only select the generic template. */
export declare function notificationReason(n: Pick<Notification, 'reason' | 'kind'>): string;
/** Render deterministic copy from bounded titles and structured counts, never model completion text. */
export declare function notificationCopy(n: Notification, facts: NotificationFacts, locale: Locale): {
    header: string;
    question: string;
    detail: string;
};
