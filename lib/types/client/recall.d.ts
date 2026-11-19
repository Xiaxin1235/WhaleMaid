import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client';
import type { Locale } from '#whalemaid/core';
/** Owner-only journal controls, separate from the confirmation workflow for durable memories. */
export declare function Recall({ connection, locale }: {
    connection: ConnectionHandle;
    locale: Locale;
}): import("react").ReactElement<{
    'data-whaledot-recall': boolean;
}, string | import("react").JSXElementConstructor<any>>;
