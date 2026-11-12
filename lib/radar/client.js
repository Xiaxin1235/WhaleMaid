import { sha256 } from '../store/index.js';
export class RadarRequestError extends Error {
    reason;
    retryAt;
    constructor(reason, retryAt) {
        super(reason);
        this.reason = reason;
        this.retryAt = retryAt;
    }
}
const hosts = new Set(['api.github.com', 'registry.npmjs.org', 'pypi.org']);
const validTag = /^(?:W\/)?"[a-f0-9]{8,128}"$/i;
const bodyLimit = 16 * 1024 * 1024;
async function readJson(response) {
    if (!response.headers.get('content-type')?.includes('json') || !response.body)
        throw new RadarRequestError('not-json');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    let text = '';
    try {
        for (;;) {
            const chunk = await reader.read();
            if (chunk.done)
                break;
            bytes += chunk.value.length;
            if (bytes > bodyLimit)
                throw new RadarRequestError('response-too-large');
            text += decoder.decode(chunk.value, { stream: true });
        }
    }
    finally {
        await reader.cancel().catch(() => { });
    }
    try {
        return JSON.parse(text + decoder.decode());
    }
    catch {
        throw new RadarRequestError('not-json');
    }
}
/** The cache holds normalized GitHub projections only. Its key includes the authorization context. */
export class RadarClient {
    request;
    timeoutMs;
    now;
    pages = new Map();
    reset = new Map();
    lifetime = new AbortController();
    githubQueue = Promise.resolve();
    constructor(request = fetch, timeoutMs = 10000, now = Date.now) {
        this.request = request;
        this.timeoutMs = timeoutMs;
        this.now = now;
    }
    get(url, signal, stats, project, github) {
        if (url.hostname !== 'api.github.com')
            return this.fetchPage(url, signal, stats, project);
        const response = this.githubQueue.then(() => this.fetchPage(url, signal, stats, project, github));
        this.githubQueue = response.catch(() => { });
        return response;
    }
    async fetchPage(url, signal, stats, project, github) {
        if (signal.aborted || this.lifetime.signal.aborted)
            throw new RadarRequestError('cancelled');
        if (url.protocol !== 'https:' || url.port || url.username || url.password || !hosts.has(url.hostname))
            throw new RadarRequestError('invalid-endpoint');
        const githubApi = url.hostname === 'api.github.com';
        const account = githubApi ? (github?.token ? sha256.hash(github.token) : 'anonymous') : '';
        const retryAt = this.reset.get(account);
        if (retryAt && retryAt > this.now())
            throw new RadarRequestError('github-rate-limited', retryAt);
        const key = JSON.stringify([github?.partition, account, url.href]);
        const cache = githubApi && github?.cache !== false;
        const page = cache ? this.pages.get(key) : undefined;
        const timeout = AbortSignal.timeout(this.timeoutMs);
        const requestSignal = AbortSignal.any([timeout, signal, this.lifetime.signal]);
        const headers = new Headers({
            'User-Agent': 'WhaleMaid',
            Accept: githubApi ? 'application/vnd.github+json' : 'application/json',
        });
        if (githubApi && github?.token)
            headers.set('Authorization', 'Bearer ' + github.token);
        if (page)
            headers.set('If-None-Match', page.tag);
        let response;
        try {
            requestSignal.throwIfAborted();
            stats.requests++;
            response = await this.request(url, { method: 'GET', headers, signal: requestSignal, redirect: 'error' });
            const remaining = response.headers.get('x-ratelimit-remaining');
            const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000;
            const retryAfter = response.headers.get('retry-after');
            let secondary = false;
            if (githubApi && response.status === 403 && remaining !== '0' && retryAfter === null) {
                const details = (await readJson(response).catch(() => undefined));
                secondary =
                    typeof details?.message === 'string' &&
                        /secondary rate limit|abuse detection/i.test(details.message);
            }
            const limited = response.status === 429 ||
                (response.status === 403 && (remaining === '0' || retryAfter !== null || secondary));
            if (githubApi && (limited || (remaining !== null && Number(remaining) <= 2))) {
                const delay = retryAfter ? Number(retryAfter) : 0;
                const until = Math.max(!secondary && reset > this.now() ? reset : this.now() + 60000, Number.isFinite(delay) ? this.now() + delay * 1000 : 0);
                if (this.reset.size >= 64)
                    this.reset.clear();
                this.reset.set(account, until);
                stats.retryAt = until;
                if (limited)
                    throw new RadarRequestError('github-rate-limited', until);
            }
            if (response.status === 304 && page) {
                stats.cacheHits++;
                stats.etags.push({ endpoint: sha256.hash(url.href), tag: page.tag });
                return page.value;
            }
            if (!response.ok)
                throw new RadarRequestError('http-' + response.status);
            const data = project(await readJson(response));
            const tag = response.headers.get('etag');
            if (cache && tag && validTag.test(tag)) {
                this.pages.delete(key);
                if (this.pages.size >= 256)
                    this.pages.delete(this.pages.keys().next().value);
                this.pages.set(key, { tag, value: data });
                stats.etags.push({ endpoint: sha256.hash(url.href), tag });
            }
            else if (page)
                this.pages.delete(key);
            return data;
        }
        catch (error) {
            if (signal.aborted || this.lifetime.signal.aborted)
                throw new RadarRequestError('cancelled');
            if (timeout.aborted)
                throw new RadarRequestError('timeout');
            if (error instanceof RadarRequestError)
                throw error;
            throw new RadarRequestError(response ? 'invalid-response' : 'network-failed');
        }
        finally {
            await response?.body?.cancel().catch(() => { });
        }
    }
    dispose() {
        this.lifetime.abort();
        this.pages.clear();
    }
}
//# sourceMappingURL=client.js.map