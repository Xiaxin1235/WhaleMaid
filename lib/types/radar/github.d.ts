import type { RadarGitHub } from '#whalemaid/core';
import type { RadarClient } from './client.js';
export declare function githubRepo(value: string | undefined): string | undefined;
export declare function githubMatcher(titles: string[], paths: string[]): {
    title: (title: string) => boolean;
    path: (path: string) => boolean;
};
export declare function observeGitHub(client: RadarClient, repo: string, github: {
    token?: string | undefined;
    partition: string;
}, after: number, match: ReturnType<typeof githubMatcher>, signal: AbortSignal, stats: Parameters<RadarClient['get']>[2]): Promise<RadarGitHub>;
