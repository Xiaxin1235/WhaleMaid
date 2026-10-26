import type { Locale } from '#whalemaid/core';
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client';
export declare function DailyBriefView({ connection, locale, onDecision, }: {
    connection: ConnectionHandle;
    locale: Locale;
    onDecision: (id: string) => void;
}): import("react").DetailedReactHTMLElement<{
    'aria-label': string;
    'data-daily-brief': boolean;
}, HTMLElement>;
