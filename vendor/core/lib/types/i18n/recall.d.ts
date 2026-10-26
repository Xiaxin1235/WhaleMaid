import type { Locale } from './index.js';
/** Copy for unconfirmed recollections, kept separate from confirmed-memory labels. */
export declare const recallCopy: (locale: Locale) => {
    preamble: string;
    conversation: string;
    experience: string;
    enabled: string;
    summarize: string;
    remove: string;
    clear: string;
    confirmClear: string;
    calls: string;
    characters: string;
    disabled: string;
    actions: {
        manage: string;
        'goal-pause': string;
        pause: string;
        resume: string;
        autopilot: string;
        'enable-autopilot': string;
        'disable-autopilot': string;
        'pause-all': string;
        'resume-all': string;
        'draft-goal': string;
        'global-pause': string;
        'goal-note': string;
        'start-work': string;
        memory: string;
        completed: string;
        paused: string;
        abandoned: string;
        cancelled: string;
        succeeded: string;
    };
    experienceSentence: (date: string, action: string, outcome: string, title: string) => string;
};
