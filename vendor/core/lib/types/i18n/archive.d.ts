import type { Locale } from './index.js';
/** Owner-facing archive controls; no companion tool or model authority is added. */
export declare const archiveCopy: (locale: Locale) => {
    enabled: string;
    count: (n: number) => string;
    restoreAll: string;
    restore: string;
    confirm: string;
    hint: string;
    unavailable: string;
};
