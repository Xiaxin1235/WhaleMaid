import type { Locale } from '#whalemaid/core';
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client';
/** Native inbox and panel use the same stored choices; free-text notes are displayed as text nodes. */
export declare function NotificationCenter({ connection, locale, onOpenGoal, goalId, notificationId, }: {
    connection: ConnectionHandle;
    locale: Locale;
    onOpenGoal: (id: string) => void;
    goalId?: string;
    notificationId?: string | undefined;
}): import("react").DetailedReactHTMLElement<{
    className: string;
}, HTMLElement>;
