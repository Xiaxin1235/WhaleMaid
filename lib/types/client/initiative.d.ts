import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client';
import type { GoalId, Locale } from '#whalemaid/core';
export declare function InitiativeView({ connection, locale, onOpenGoal, }: {
    connection: ConnectionHandle;
    locale: Locale;
    onOpenGoal: (id: GoalId) => void;
}): import("react").DetailedReactHTMLElement<{
    'aria-label': string;
    'data-initiative': string;
}, HTMLElement>;
