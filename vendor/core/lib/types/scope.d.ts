import type { Result, ScopeHasher } from './infra.js';
import type { ActionIntent } from './model/action.js';
import type { AuthorizationScope, ScopeContent } from './model/authorization.js';
export type ScopeHashError = {
    code: 'invalid-scope-content' | 'invalid-scope-path';
};
/** Canonicalize scope fields, path aliases and set ordering, excluding the stored hash itself. */
export declare function canonicalScopeContent(scope: ScopeContent): Result<string, ScopeHashError>;
/** Hash canonical scope content through a host-provided SHA-256 implementation. */
export declare function hashScope(scope: ScopeContent, deps: ScopeHasher): Result<string, ScopeHashError>;
/** The host must realpath roots and targets before checking either path dialect. */
export declare function isPathAllowed(scope: AuthorizationScope, absPath: string): boolean;
export interface CommandClass {
    class: 'safe' | 'needs-approval' | 'forbidden';
    reasons: string[];
}
/** Confirmed uses the original literal allowlist; trusted uses best-effort textual hazard checks. */
export declare function classifyCommand(cmdline: string, cwd?: string, scope?: AuthorizationScope): CommandClass;
export interface GateDecision {
    decision: 'allow' | 'ask' | 'deny';
    reason: string;
    ruleId: string;
}
/** Apply immutable authorization constraints; an approval request never changes or enlarges the scope. */
export declare function checkAction(scope: AuthorizationScope, action: ActionIntent): GateDecision;
