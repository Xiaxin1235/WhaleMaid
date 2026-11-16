import type { Locale } from '#whalemaid/core';
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client';
/** The same persisted proposal is visible in memory management and P04's notification center. */
export declare function MemoryProposals({ connection, locale, goalId, }: {
    connection: ConnectionHandle;
    locale: Locale;
    goalId?: string | undefined;
}): import("react").ReactElement<{
    'data-memory-proposals': boolean;
}, string | import("react").JSXElementConstructor<any>> | null;
