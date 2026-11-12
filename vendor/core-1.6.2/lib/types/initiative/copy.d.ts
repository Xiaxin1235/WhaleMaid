import type { Locale } from '../i18n/index.js';
import type { DetectorId, InitiativeChoice } from './model.js';
export declare function initiativeFindingCopy(locale: Locale, detector: DetectorId): {
    name: string;
    summary: string;
};
export declare function initiativeChoiceCopy(locale: Locale, choice: InitiativeChoice, detector?: DetectorId): {
    label: string;
    description: string | undefined;
};
