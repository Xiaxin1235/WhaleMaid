import type { Agent } from '@deepseek-ai/dsh-agent';
import type { UserMessage } from '@deepseek-ai/dsh-session';
import type { DailyBriefFacts, Locale } from '#whalemaid/core';
import type { WhaleStore } from '../store/index.js';
import type { ScopeService } from '../scope-service.js';
import type { MemoryExecution } from './memory.js';
/** Local fixed-format snapshots: no model, notifications, scheduler writes or project actions. */
export declare class CompanionDailyBrief {
    private readonly store;
    private readonly scopes;
    readonly deps: {
        enabled(): boolean;
        locale(): Locale;
        owns(id: string): boolean;
        now?(): number;
    };
    private readonly turns;
    constructor(store: WhaleStore, scopes: Pick<ScopeService, 'activeScopeFor'>, deps: {
        enabled(): boolean;
        locale(): Locale;
        owns(id: string): boolean;
        now?(): number;
    });
    private now;
    private state;
    private save;
    facts(from: number, to: number): DailyBriefFacts;
    /** The first nonempty snapshot of a day is frozen; panel and conversation share these exact bytes. */
    private ensure;
    panel(): {
        enabled: boolean;
        today: {
            date: string;
            generatedAt: number;
            from: number;
            to: number;
            text: string;
            decisions: {
                id: string;
                goalId: string;
                title: string;
            }[];
            deliveredAt?: number | undefined;
        } | undefined;
        records: {
            date: string;
            generatedAt: number;
            from: number;
            to: number;
            text: string;
            decisions: {
                id: string;
                goalId: string;
                title: string;
            }[];
            deliveredAt?: number | undefined;
        }[];
    };
    /** Public claimed-input event precedes system-prompt assembly; synthetic input cannot consume a day. */
    enter(agent: Agent, turn: number, messages: readonly UserMessage[]): void;
    block(agent?: Agent): string;
    /** Querying an existing snapshot never generates one or changes the delivery marker. */
    query(raw: unknown, exec: MemoryExecution): {
        disabled: boolean;
        message: string;
        brief?: never;
    } | {
        brief: {
            date: string;
            generatedAt: number;
            from: number;
            to: number;
            text: string;
            decisions: {
                id: string;
                goalId: string;
                title: string;
            }[];
            deliveredAt?: number | undefined;
        } | null;
        disabled?: never;
        message?: never;
    };
}
