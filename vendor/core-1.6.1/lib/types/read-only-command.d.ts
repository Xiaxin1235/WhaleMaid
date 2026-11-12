/** Parse the small, literal read-only shell grammar; ambiguity never confers read permission. */
export declare function readOnlyCommandPaths(cmdline: string, cwd: string): {
    paths: string[];
} | {
    unparsable: true;
};
