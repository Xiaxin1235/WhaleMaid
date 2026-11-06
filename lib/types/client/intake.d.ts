import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client';
import type { Locale } from '#whalemaid/core';
import { GoalDetailSchema } from '../panel-api/contract.js';
import type { z } from 'zod';
type Detail = z.infer<typeof GoalDetailSchema>;
/** Use the existing owner-authenticated Connection channel; callers validate each response. */
export declare function intakeCall(connection: ConnectionHandle, method: string, payload: unknown, signal?: AbortSignal): Promise<unknown>;
/** Editable proposal and a separate second confirmation; only that final action writes records. */
export declare function IntakeView({ connection, locale, onCancel, onCreated, initialDraftId, existing, }: {
    connection: ConnectionHandle;
    locale: Locale;
    onCancel(): void;
    onCreated(id: string): void;
    initialDraftId?: string | undefined;
    existing?: Detail | undefined;
}): import("react").DetailedReactHTMLElement<{
    className: string;
}, HTMLElement>;
/** Display persisted values, including revoked grants; all controls reuse the owner-authenticated API. */
export declare function GoalDetailView({ connection, locale, goalId, onBack, onOpenSession, }: {
    connection: ConnectionHandle;
    locale: Locale;
    goalId: string;
    onBack(): void;
    onOpenSession(id: string): void;
}): import("react").FunctionComponentElement<{
    connection: ConnectionHandle;
    locale: Locale;
    onCancel(): void;
    onCreated(id: string): void;
    initialDraftId?: string | undefined;
    existing?: Detail | undefined;
}> | import("react").DetailedReactHTMLElement<{
    className: string;
}, HTMLElement>;
export {};
