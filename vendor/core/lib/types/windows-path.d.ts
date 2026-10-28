/** Normalize an absolute DOS path without consulting the filesystem; reject ambiguous Windows aliases. */
export declare function normalizeWindowsPath(path: string): string | null;
/** Compare normalized paths at a directory boundary, including a volume root. */
export declare function isWithinPath(path: string, root: string): boolean;
