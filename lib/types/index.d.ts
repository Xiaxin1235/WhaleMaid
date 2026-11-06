import type { Context, Volatile } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import type { LanguageSetting } from '#whalemaid/core';
export declare const name = "whaledot";
export declare const inject: string[];
export interface CompanionConfig {
    dailyBrief?: {
        enabled?: Volatile<boolean>;
    };
    archiveEarlier?: Volatile<boolean>;
    recall?: {
        enabled?: Volatile<boolean>;
        summarize?: Volatile<boolean>;
    };
    actions?: {
        enabled?: boolean;
    };
    memory?: {
        enabled?: boolean;
        suggest?: boolean;
        maxChars?: number;
        draftProjectLessons?: Volatile<boolean>;
    };
    enabled?: boolean;
    personaPath?: string;
    shareSessionTitles?: boolean;
    readSessionContent?: boolean;
    excludedSessions?: string[];
}
export interface Config {
    maxConcurrentRuns?: number;
    dataDir?: string;
    debugLogSignals?: boolean;
    language?: Volatile<LanguageSetting>;
    companion?: CompanionConfig;
}
type ConfigInput = Omit<Config, 'language' | 'companion'> & {
    language?: LanguageSetting;
    companion?: Omit<CompanionConfig, 'memory' | 'recall' | 'archiveEarlier' | 'dailyBrief'> & {
        dailyBrief?: {
            enabled?: boolean;
        };
        archiveEarlier?: boolean;
        recall?: {
            enabled?: boolean;
            summarize?: boolean;
        };
        memory?: {
            enabled?: boolean;
            suggest?: boolean;
            maxChars?: number;
            draftProjectLessons?: boolean;
        };
    };
};
export declare const Config: Schema<ConfigInput, Config>;
/** All initialization paths, including optional-service callbacks and async IO, degrade locally. */
export declare function apply(ctx: Context, config?: Config): Promise<void>;
export {};
