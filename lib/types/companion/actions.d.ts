import type { Locale } from '#whalemaid/core';
import type { WhaleStore } from '../store/index.js';
import type { GoalIntake } from '../goal-intake/service.js';
import type { AutopilotScheduler } from '../autopilot/scheduler.js';
import type { CompanionMemory, MemoryExecution } from './memory.js';
/** Management proposals plus handing a task to a new ordinary conversation. No grant or decision routing here. */
export declare class CompanionActions {
    readonly store: WhaleStore;
    private readonly deps;
    private readonly pending;
    private readonly lifetime;
    constructor(store: WhaleStore, deps: {
        enabled(): boolean;
        locale(): Locale;
        owns(id: string): boolean;
        confirm: CompanionMemory['confirm'];
        intake: Pick<GoalIntake, 'start' | 'setPaused'>;
        autopilot: Pick<AutopilotScheduler, 'setAutopilot'>;
        setPaused(paused: boolean): void;
        /** Opens an ordinary conversation in the project and sends it the task. */
        startWork?(input: {
            projectRoot: string;
            task: string;
        }): Promise<{
            sessionId: string;
        }>;
        now?(): number;
    });
    dispose(): void;
    private facts;
    /** Trust only the exact tool runtime's companion agent; model arguments cannot carry consent. */
    propose(raw: unknown, execution: MemoryExecution): Promise<{
        status: string;
        message: string;
        proposalId?: never;
        confirmedAt?: never;
        result?: never;
    } | {
        status: string;
        message: string;
        proposalId: string;
        confirmedAt: number;
        result: unknown;
    }>;
    private event;
}
