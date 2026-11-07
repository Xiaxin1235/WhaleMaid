import type { Locale } from './i18n/index.js';
/**
 * The welcome dialog shows once per release listed here. When a release has
 * notable changes, bump this value and replace the notes alongside CHANGELOG.
 * Leave it unchanged for a release that needs no announcement.
 */
export declare const WELCOME_RELEASE = "1.3.0";
/** Short what's-new notes for WELCOME_RELEASE, three to five lines each. */
export declare const WELCOME_NOTES: Record<Locale, readonly string[]>;
