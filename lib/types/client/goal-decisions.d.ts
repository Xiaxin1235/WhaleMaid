import type { Locale, Notification } from '#whalemaid/core';
/** Only owner-facing cards render these controls. Snapshot the version at the first click. */
export declare function GoalDecisionButtons({ notification, goal, locale, disabled, submit, }: {
    notification: Notification;
    goal: {
        title: string;
        version: number;
        status: string;
    };
    locale: Locale;
    disabled: boolean;
    submit(input: {
        notificationId: string;
        choice: 'abandon' | 'change-direction';
        goalVersion: number;
        confirm?: true;
        direction?: string;
    }): Promise<void>;
}): import("react").ReactElement<{
    'data-goal-decision': string & import("zod").$brand<"NotificationId">;
}, string | import("react").JSXElementConstructor<any>>;
