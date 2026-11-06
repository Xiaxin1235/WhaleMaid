import type { Task } from '../model/task.js';
import type { Notification, Suggestion } from '../model/notification.js';
import type { AuthorizationScope } from '../model/authorization.js';
import type { Clock, IdGen } from '../infra.js';
import type { Locale } from '../i18n/index.js';
import type { DecisionChoice } from '../verify/model.js';
import type { NotificationChoice } from './model.js';
export type NotificationAction = DecisionChoice | 'snooze' | 'open-panel';
/** Create an immutable stored option; labels are presentation, while intent and bindings own execution. */
export declare function suggestionForAction(n: Notification, task: Task | undefined, action: NotificationAction, deps: {
    clock: Clock;
    idGen: IdGen;
    locale: Locale;
    scope: AuthorizationScope;
    goalVersion?: number;
}): Suggestion;
/** Select a fixed set before personalization: at most two domain choices plus the two common options. */
export declare function buildSuggestions(n: Notification, task: Task | undefined, history: NotificationChoice[], deps: Parameters<typeof suggestionForAction>[3]): Suggestion[];
