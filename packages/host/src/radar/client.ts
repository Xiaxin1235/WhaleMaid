import { sha256 } from '../store/index.js'

type Fetch = typeof fetch
type Page<T> = { tag: string; value: T }
type GitHubAccess = { token?: string | undefined; partition: string; cache?: false }
type RequestStats = {
  requests: number
  cacheHits: number
  etags: { endpoint: string; tag: string }[]
  retryAt?: number | undefined
}
export class RadarRequestError extends Error {
  constructor(
    readonly reason: string,
    readonly retryAt?: number,
  ) {
    super(reason)
  }
}

const hosts = new Set(['api.github.com', 'registry.npmjs.org', 'pypi.org'])
const validTag = /^(?:W\/)?"[a-f0-9]{8,128}"$/i
const bodyLimit = 16 * 1024 * 1024

async function readJson(response: Response) {
  if (!response.headers.get('content-type')?.includes('json') || !response.body)
    throw new RadarRequestError('not-json')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let bytes = 0
  let text = ''
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.length
      if (bytes > bodyLimit) throw new RadarRequestError('response-too-large')
      text += decoder.decode(chunk.value, { stream: true })
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  try {
    return JSON.parse(text + decoder.decode()) as unknown
  } catch {
    throw new RadarRequestError('not-json')
  }
}

/** The cache holds normalized GitHub projections only. Its key includes the authorization context. */
export class RadarClient {
  private readonly pages = new Map<string, Page<unknown>>()
  private readonly reset = new Map<string, number>()
  private readonly lifetime = new AbortController()
  private githubQueue: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly request: Fetch = fetch,
    private readonly timeoutMs = 10000,
    private readonly now = Date.now,
  ) {}

  get<T>(
    url: URL,
    signal: AbortSignal,
    stats: RequestStats,
    project: (body: unknown) => T,
    github?: GitHubAccess,
  ): Promise<T> {
    if (url.hostname !== 'api.github.com') return this.fetchPage(url, signal, stats, project)
    const response = this.githubQueue.then(() => this.fetchPage(url, signal, stats, project, github))
    this.githubQueue = response.catch(() => {})
    return response
  }

  private async fetchPage<T>(
    url: URL,
    signal: AbortSignal,
    stats: RequestStats,
    project: (body: unknown) => T,
    github?: GitHubAccess,
  ): Promise<T> {
    if (signal.aborted || this.lifetime.signal.aborted) throw new RadarRequestError('cancelled')
    if (url.protocol !== 'https:' || url.port || url.username || url.password || !hosts.has(url.hostname))
      throw new RadarRequestError('invalid-endpoint')
    const githubApi = url.hostname === 'api.github.com'
    const account = githubApi ? (github?.token ? sha256.hash(github.token) : 'anonymous') : ''
    const retryAt = this.reset.get(account)
    if (retryAt && retryAt > this.now()) throw new RadarRequestError('github-rate-limited', retryAt)
    const key = JSON.stringify([github?.partition, account, url.href])
    const cache = githubApi && github?.cache !== false
    const page = cache ? (this.pages.get(key) as Page<T> | undefined) : undefined
    const timeout = AbortSignal.timeout(this.timeoutMs)
    const requestSignal = AbortSignal.any([timeout, signal, this.lifetime.signal])
    const headers = new Headers({
      'User-Agent': 'WhaleMaid',
      Accept: githubApi ? 'application/vnd.github+json' : 'application/json',
    })
    if (githubApi && github?.token) headers.set('Authorization', 'Bearer ' + github.token)
    if (page) headers.set('If-None-Match', page.tag)
    let response: Response | undefined
    try {
      requestSignal.throwIfAborted()
      stats.requests++
      response = await this.request(url, { method: 'GET', headers, signal: requestSignal, redirect: 'error' })
      const remaining = response.headers.get('x-ratelimit-remaining')
      const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000
      const retryAfter = response.headers.get('retry-after')
      let secondary = false
      if (githubApi && response.status === 403 && remaining !== '0' && retryAfter === null) {
        const details = (await readJson(response).catch(() => undefined)) as { message?: unknown } | undefined
        secondary =
          typeof details?.message === 'string' &&
          /secondary rate limit|abuse detection/i.test(details.message)
      }
      const limited =
        response.status === 429 ||
        (response.status === 403 && (remaining === '0' || retryAfter !== null || secondary))
      if (githubApi && (limited || (remaining !== null && Number(remaining) <= 2))) {
        const delay = retryAfter ? Number(retryAfter) : 0
        const until = Math.max(
          !secondary && reset > this.now() ? reset : this.now() + 60000,
          Number.isFinite(delay) ? this.now() + delay * 1000 : 0,
        )
        if (this.reset.size >= 64) this.reset.clear()
        this.reset.set(account, until)
        stats.retryAt = until
        if (limited) throw new RadarRequestError('github-rate-limited', until)
      }
      if (response.status === 304 && page) {
        stats.cacheHits++
        stats.etags.push({ endpoint: sha256.hash(url.href), tag: page.tag })
        return page.value
      }
      if (!response.ok) throw new RadarRequestError('http-' + response.status)
      const data = project(await readJson(response))
      const tag = response.headers.get('etag')
      if (cache && tag && validTag.test(tag)) {
        this.pages.delete(key)
        if (this.pages.size >= 256) this.pages.delete(this.pages.keys().next().value!)
        this.pages.set(key, { tag, value: data })
        stats.etags.push({ endpoint: sha256.hash(url.href), tag })
      } else if (page) this.pages.delete(key)
      return data
    } catch (error) {
      if (signal.aborted || this.lifetime.signal.aborted) throw new RadarRequestError('cancelled')
      if (timeout.aborted) throw new RadarRequestError('timeout')
      if (error instanceof RadarRequestError) throw error
      throw new RadarRequestError(response ? 'invalid-response' : 'network-failed')
    } finally {
      await response?.body?.cancel().catch(() => {})
    }
  }

  dispose() {
    this.lifetime.abort()
    this.pages.clear()
  }
}
