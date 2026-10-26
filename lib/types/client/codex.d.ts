import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client';
import type { Locale } from '#whalemaid/core';
export declare function CodexView({ connection, locale }: {
    connection: ConnectionHandle;
    locale: Locale;
}): import("react").DetailedReactHTMLElement<{
    'aria-label': string;
}, HTMLElement>;
