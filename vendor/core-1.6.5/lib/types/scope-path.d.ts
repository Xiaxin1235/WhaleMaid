/** DOS rules remain unchanged. POSIX roots retain case and never accept shell expansion or Windows aliases. */
export declare function normalizeScopePath(path: string): string | null;
export declare const scopePathSeparator: (normalized: string) => "/" | "\\";
/** Compare normalized roots at directory boundaries, preserving POSIX case sensitivity. */
export declare function isWithinScopePath(path: string, root: string): boolean;
/** Resolve one literal tool path in the cwd's own path dialect; reject mixed or expanding forms. */
export declare function resolveScopePath(cwd: string, path: string): string | null;
