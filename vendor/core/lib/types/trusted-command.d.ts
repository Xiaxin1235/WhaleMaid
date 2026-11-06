import type { AuthorizationScope } from './model/authorization.js';
interface Inspection {
    reasons: string[];
    paths: string[];
    protectedPattern: boolean;
}
type LegacyReasons = (line: string) => readonly string[];
/** Textual best effort only. Unresolved execution and paths ask; script bodies stay opaque. */
export declare function inspectTrustedCommand(line: string, cwd: string, scope: AuthorizationScope, legacy?: LegacyReasons): Inspection;
export {};
