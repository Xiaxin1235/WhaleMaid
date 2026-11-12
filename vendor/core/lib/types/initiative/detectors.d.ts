import type { Limits } from '../model/limits.js';
import type { ProjectGoal } from '../model/goal.js';
import type { Task } from '../model/task.js';
import type { Run } from '../model/execution.js';
import type { Verification } from '../verify/model.js';
import type { CommandResult } from '../verify/parse.js';
import type { Notification } from '../model/notification.js';
import type { OpportunityCandidate } from './model.js';
export interface InitiativeFacts {
    goal: ProjectGoal;
    tasks?: readonly Task[];
    verifications?: readonly Verification[];
    todayRuns?: readonly Run[];
    limits?: Limits;
    decisions?: readonly Notification[];
    waitingOnDecision?: boolean;
    idleSince?: number;
}
/** Remove locations and volatile values while retaining the actual error words. */
export declare function normalizeFailureText(text: string): string;
export declare function failureSignature(result: CommandResult, hash: (value: string) => string): string | undefined;
export declare function repeatedFailure(f: InitiativeFacts, now: number, hash: (value: string) => string): OpportunityCandidate[];
export declare function stallWarning(f: InitiativeFacts, now: number): OpportunityCandidate[];
export declare function noAcceptance(f: InitiativeFacts, now: number): OpportunityCandidate[];
export declare function budgetBurn(f: InitiativeFacts, now: number): OpportunityCandidate[];
export declare function pendingBacklog(f: InitiativeFacts, now: number): OpportunityCandidate[];
export declare function idleGoal(f: InitiativeFacts, now: number): OpportunityCandidate[];
export declare function leftovers(f: InitiativeFacts, now: number): OpportunityCandidate[];
