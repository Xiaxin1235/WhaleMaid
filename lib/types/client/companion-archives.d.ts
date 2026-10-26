import type { Locale } from '#whalemaid/core';
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client';
/** Owner-only reversible archive controls, independent of companion tools and ordinary conversations. */
export declare function CompanionArchivesView({ connection, locale, }: {
    connection: ConnectionHandle;
    locale: Locale;
}): import("react").ReactElement<{
    'data-companion-archives': boolean;
}, string | import("react").JSXElementConstructor<any>>;
