import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client';
import type { Locale } from '#whalemaid/core';
/** All editing actions come from the authenticated owner connection; no model confirmation flag exists. */
export declare function Memories({ connection, locale }: {
    connection: ConnectionHandle;
    locale: Locale;
}): import("react").ReactElement<{
    'data-whaledot-memories': boolean;
}, string | import("react").JSXElementConstructor<any>>;
