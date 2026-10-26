import type { Locale } from '#whalemaid/core';
import type { z } from 'zod';
import type { GoalDetailSchema } from '../panel-api/contract.js';
/** Opt-in controls bind confirmation to the exact active scope displayed to the owner. */
export declare function AutopilotView({ detail, locale, saving, write, call, }: {
    detail: z.infer<typeof GoalDetailSchema>;
    locale: Locale;
    saving: boolean;
    write: (method: string, input: unknown) => Promise<void>;
    call: (method: string, input: unknown) => Promise<unknown>;
}): import("react").DetailedReactHTMLElement<{
    className: string;
}, HTMLElement>;
