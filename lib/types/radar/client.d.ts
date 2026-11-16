type Fetch = typeof fetch;
type GitHubAccess = {
    token?: string | undefined;
    partition: string;
    cache?: false;
};
type RequestStats = {
    requests: number;
    cacheHits: number;
    etags: {
        endpoint: string;
        tag: string;
    }[];
    retryAt?: number | undefined;
};
export declare class RadarRequestError extends Error {
    readonly reason: string;
    readonly retryAt?: number | undefined;
    constructor(reason: string, retryAt?: number | undefined);
}
/** The cache holds normalized GitHub projections only. Its key includes the authorization context. */
export declare class RadarClient {
    private readonly request;
    private readonly timeoutMs;
    private readonly now;
    private readonly pages;
    private readonly reset;
    private readonly lifetime;
    private githubQueue;
    constructor(request?: Fetch, timeoutMs?: number, now?: () => number);
    get<T>(url: URL, signal: AbortSignal, stats: RequestStats, project: (body: unknown) => T, github?: GitHubAccess): Promise<T>;
    private fetchPage;
    dispose(): void;
}
export {};
