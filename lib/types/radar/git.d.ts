import type { AuthorizationScope, RadarGit, Run } from '#whalemaid/core';
export declare function gitPreview(root: string, signal: AbortSignal): Promise<{
    localGit: boolean;
    repo: string | undefined;
} | {
    localGit: boolean;
    repo?: never;
}>;
export declare function observeGit(input: {
    root: string;
    scope: AuthorizationScope;
    previous?: RadarGit | undefined;
    known: Set<string>;
    runs: Run[];
    worktreeRoot: string;
    couldHaveWritten(run: Run, path: string): boolean;
    runStillLive(run: Run): boolean;
}, signal: AbortSignal): Promise<RadarGit>;
