import type { Locale } from '#whalemaid/core';
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client';
/** Show confirmed proposals, with a separate entry into the existing P07 grant editor. */
export declare function CompanionActionsView({ connection, locale, onDraft, }: {
    connection: ConnectionHandle;
    locale: Locale;
    onDraft(id: string): void;
}): import("react").ReactElement<{
    'data-companion-actions': boolean;
}, string | import("react").JSXElementConstructor<any>>;
