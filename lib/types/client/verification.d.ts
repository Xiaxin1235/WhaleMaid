import type { Locale } from '#whalemaid/core';
import type { z } from 'zod';
import type { GoalDetailSchema } from '../panel-api/contract.js';
/** Evidence viewer uses persisted identities only; no arbitrary host path is sent by the browser. */
export declare function VerificationView({ detail, locale, saving, write, call, }: {
    detail: z.infer<typeof GoalDetailSchema>;
    locale: Locale;
    saving: boolean;
    write: (method: string, input: unknown) => Promise<void>;
    call: (method: string, input: unknown) => Promise<unknown>;
}): import("react").DetailedReactHTMLElement<{
    className: string;
}, HTMLElement>;
