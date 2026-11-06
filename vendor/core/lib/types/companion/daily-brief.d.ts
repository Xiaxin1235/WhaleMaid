import { z } from 'zod';
import type { Locale } from '../i18n/index.js';
export declare const DailyGoalChangesSchema: z.ZodArray<z.ZodObject<{
    goalId: z.ZodString;
    status: z.ZodString;
    at: z.ZodNumber;
}, z.core.$strip>>;
export declare const DailyBriefQuerySchema: z.ZodObject<{
    date: z.ZodOptional<z.ZodISODate>;
}, z.core.$strict>;
export declare const DailyBriefRecordSchema: z.ZodObject<{
    date: z.ZodISODate;
    generatedAt: z.ZodNumber;
    from: z.ZodNumber;
    to: z.ZodNumber;
    text: z.ZodString;
    deliveredAt: z.ZodOptional<z.ZodNumber>;
    decisions: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        goalId: z.ZodString;
        title: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strict>;
export type DailyBriefRecord = z.infer<typeof DailyBriefRecordSchema>;
type Item = {
    id: string;
    at: number;
    title: string;
    kind: 'goal' | 'task' | 'verification';
    status: string;
};
/** Explicit projection: command text, transcripts, file contents and experience prose have no field here. */
export interface DailyBriefFacts {
    completed: readonly Item[];
    problems: readonly Item[];
    decisions: readonly {
        id: string;
        goalId: string;
        title: string;
        at: number;
    }[];
    automation: {
        runs: number;
        plans: number;
        quotas: readonly {
            id: string;
            title: string;
            runsRemaining: number;
            plansRemaining: number;
        }[];
    };
    proposals: readonly {
        id: string;
        at: number;
        title: string;
        action: string;
        confirmed: boolean;
    }[];
    experiences: readonly {
        id: string;
        at: number;
    }[];
}
export declare function briefTitle(value: string): string;
/** Stable bounded rendering. Each section has its own budget so decisions cannot be crowded out. */
export declare function buildDailyBrief(facts: DailyBriefFacts, locale: Locale): string;
export {};
