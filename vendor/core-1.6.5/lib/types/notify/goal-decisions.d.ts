import { z } from 'zod';
import type { DecisionChoice } from '../verify/model.js';
import type { Notification } from '../model/notification.js';
import type { Locale } from '../i18n/index.js';
export declare const DirectionSchema: z.ZodString;
/** Only owner decisions about a stopped goal gain these choices; progress/digest notices do not. */
export declare function goalDecisionChoices(choices: readonly DecisionChoice[], reason: string, kind: Notification['kind']): DecisionChoice[];
export declare const goalDecisionCopy: (locale: Locale) => {
    abandon: string;
    change: string;
    confirm: string;
    cancel: string;
    abandonment: (title: string) => string;
    direction: string;
    submitDirection: string;
    directionHint: string;
    inboxHint: string;
    directionRequired: string;
    cancelled: string;
};
