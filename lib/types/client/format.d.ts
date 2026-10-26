import { type Locale } from '#whalemaid/core';
import type { PanelStatus } from '../panel-api/contract.js';
export declare function serviceRows(status: PanelStatus, locale: Locale): {
    name: string;
    available: boolean;
    text: string;
}[];
export declare function formatStartedAt(timestamp: number, locale: Locale): string;
