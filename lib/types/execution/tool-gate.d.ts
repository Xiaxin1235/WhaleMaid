import type { SessionEvent } from '@deepseek-ai/dsh-session/types';
import type { Context } from '@deepseek-ai/cordis';
import type { PreToolDecision } from '@deepseek-ai/dsh-tools';
import type { Locale } from '#whalemaid/core';
import type { RunRegistry } from './registry.js';
/** Resolve a nonexistent target through its nearest existing ancestor, retaining the missing suffix. */
export declare function resolveRealTarget(path: string): Promise<string>;
export interface GateExecution {
    name: string;
    arguments: unknown;
    agent?: {
        session: {
            id: string;
            header?: {
                parentSession?: string;
            };
        };
    };
    rootCallId?: unknown;
    parent?: unknown;
    token?: unknown;
    callId?: unknown;
}
/** The registry is the only authority for ownership. No argument of unrelated sessions is observed. */
export declare class ToolGate {
    private readonly registry;
    private readonly locale;
    private readonly parentOf;
    private readonly roots;
    private readonly tokens;
    private readonly approvals;
    private readonly pendingExecutions;
    private readonly admitted;
    constructor(registry: RunRegistry, locale: () => Locale, parentOf?: (id: string) => string | undefined);
    /** Number of ephemeral tool lineage bindings, for runtime diagnostics. */
    trackedEntries(): number;
    private owner;
    /** Narrow owned calls before DSH policy; unrelated arguments remain untouched. */
    check(exec: GateExecution, next: () => Promise<PreToolDecision>): Promise<PreToolDecision>;
    /** Observe committed DSH audit events, regardless of which UI answerer claims the waterfall. */
    approvalEvent(sessionId: string, event: SessionEvent): void;
    /** A missing approval service or unobservable audit must remain fail-closed. */
    result(exec: GateExecution): void;
    /** Recheck after asynchronous approval, immediately before tool dispatch. */
    guard(exec: GateExecution): string | undefined;
    private recordApproval;
    private live;
    private safeTree;
    private deny;
}
/** Install the pre-execution narrowing policy while the tool runtime exists. */
export declare function installToolGate(ctx: Context, gate: ToolGate): void;
