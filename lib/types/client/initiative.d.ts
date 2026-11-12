import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client';
import type { GoalId, Locale } from '#whalemaid/core';
export declare function InitiativeView({ connection, locale, onOpenGoal, onCard, onDraft, evidenceId, }: {
    connection: ConnectionHandle;
    locale: Locale;
    onOpenGoal: (id: GoalId) => void;
    onCard: (id: string) => void;
    onDraft: (id: string) => void;
    evidenceId?: string | undefined;
}): import("react").DetailedReactHTMLElement<{
    'aria-label': string;
    'data-initiative': string;
}, HTMLElement>;
