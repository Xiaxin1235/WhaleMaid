import type { Locale } from '#whalemaid/core';
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client';
/** Settings and history share the same persisted switch and authenticated Host endpoint. */
export declare function EverydayApprovalsView({ connection, locale, history, }: {
    connection: ConnectionHandle;
    locale: Locale;
    history?: boolean;
}): import("react").DetailedReactHTMLElement<{
    'aria-label': string;
}, HTMLElement>;
