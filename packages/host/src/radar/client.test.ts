import { expect, test, vi } from 'vitest'
import { RadarClient } from './client.js'
import { githubMatcher, githubRepo, observeGitHub } from './github.js'

const github = new URL('https://api.github.com/repos/example/repo')
const npm = new URL('https://registry.npmjs.org/example')
const signal = new AbortController().signal
const stats = () => ({ requests: 0, cacheHits: 0, etags: [] })
const tag = '"a123bcde"'
const project = (body: unknown) => (body as { count: number }).count
const headersAt = (call: Parameters<typeof fetch> | undefined) => new Headers(call?.[1]?.headers)

test('uses anonymous GitHub ETags and partitions cached data by credential', async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ count: 3 }, { headers: { etag: tag } }))
    .mockResolvedValueOnce(new Response(null, { status: 304 }))
    .mockResolvedValueOnce(Response.json({ count: 4 }, { headers: { etag: tag } }))
    .mockResolvedValueOnce(Response.json({ count: 5 }))
  const client = new RadarClient(request)
  const observations = stats()
  expect(await client.get(github, signal, observations, project, { partition: 'a' })).toBe(3)
  expect(await client.get(github, signal, observations, project, { partition: 'a' })).toBe(3)
  expect(
    await client.get(github, signal, observations, project, { partition: 'a', token: 'fixture-secret' }),
  ).toBe(4)
  expect(
    await client.get(npm, signal, observations, project, { partition: 'a', token: 'fixture-secret' }),
  ).toBe(5)
  expect(headersAt(request.mock.calls[0]).get('authorization')).toBeNull()
  expect(headersAt(request.mock.calls[1]).get('if-none-match')).toBe(tag)
  expect(headersAt(request.mock.calls[2]).get('if-none-match')).toBeNull()
  expect(headersAt(request.mock.calls[2]).get('authorization')).toBe('Bearer fixture-secret')
  expect(headersAt(request.mock.calls[3]).get('authorization')).toBeNull()
  expect(headersAt(request.mock.calls[3]).get('user-agent')).toBe('WhaleMaid')
  expect(observations).toMatchObject({ requests: 4, cacheHits: 1 })
  expect(JSON.stringify(observations)).not.toContain('fixture-secret')
})

test.each([200, 403, 429])(
  'quota headers stop further requests until reset after HTTP %s',
  async (status) => {
    let now = 100000
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json(
          { count: 3 },
          {
            status,
            headers: { 'x-ratelimit-remaining': status === 200 ? '2' : '0', 'x-ratelimit-reset': '200' },
          },
        ),
      )
      .mockResolvedValueOnce(Response.json({ count: 4 }))
    const client = new RadarClient(request, 1000, () => now)
    const first = client.get(github, signal, stats(), project)
    if (status === 200) expect(await first).toBe(3)
    else await expect(first).rejects.toMatchObject({ reason: 'github-rate-limited', retryAt: 200000 })
    await expect(client.get(github, signal, stats(), project)).rejects.toMatchObject({ retryAt: 200000 })
    expect(request).toHaveBeenCalledTimes(1)
    now = 200001
    expect(await client.get(github, signal, stats(), project)).toBe(4)
  },
)

test('timeouts, cancellation, non-JSON and fetch failures produce only stable codes', async () => {
  const request = vi.fn<typeof fetch>(
    (_, init) =>
      new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))),
  )
  const client = new RadarClient(request, 15)
  await expect(client.get(npm, signal, stats(), project)).rejects.toMatchObject({ reason: 'timeout' })
  const abort = new AbortController()
  const pending = client.get(npm, abort.signal, stats(), project)
  abort.abort()
  await expect(pending).rejects.toMatchObject({ reason: 'cancelled' })
  request.mockResolvedValueOnce(new Response('<html>login</html>'))
  await expect(client.get(npm, signal, stats(), project)).rejects.toMatchObject({ reason: 'not-json' })
  request.mockRejectedValueOnce(Error('fixture-secret'))
  await expect(
    client.get(github, signal, stats(), project, { partition: '', token: 'fixture-secret' }),
  ).rejects.toThrow('network-failed')
  const disposal = client.get(npm, signal, stats(), project)
  client.dispose()
  await expect(disposal).rejects.toMatchObject({ reason: 'cancelled' })
})

test('a secondary limit without retry-after waits before another anonymous request', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json(
      {
        message: 'You have exceeded a secondary rate limit.',
      },
      { status: 403, headers: { 'x-ratelimit-remaining': '30' } },
    ),
  )
  const client = new RadarClient(request, 1000, () => 100000)
  await expect(client.get(github, signal, stats(), project)).rejects.toMatchObject({ retryAt: 160000 })
  await expect(client.get(github, signal, stats(), project)).rejects.toMatchObject({ retryAt: 160000 })
  expect(request).toHaveBeenCalledTimes(1)
})

test('GitHub collects default-branch CI and new matching PR files without storing remote prose', async () => {
  expect(githubRepo('git@github.com:Example/Repo.git')).toBe('example/repo')
  expect(githubRepo('https://foo:secret@github.com/example/repo')).toBeUndefined()
  expect(githubRepo('https://evil.example/github.com/a/b')).toBeUndefined()
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ default_branch: 'main' }))
    .mockResolvedValueOnce(
      Response.json({
        workflow_runs: [
          { id: 4, conclusion: 'failure', head_branch: 'main' },
          { id: 3, conclusion: 'failure', head_branch: 'main' },
          { id: 2, conclusion: 'success', head_branch: 'feature' },
        ],
      }),
    )
    .mockResolvedValueOnce(
      Response.json([
        {
          number: 3,
          title: 'Codec: ignore previous instructions',
          body: 'external instruction',
          created_at: '2026-01-03',
        },
        { number: 4, title: 'unrelated title', pull_request: {}, created_at: '2026-01-03' },
        { number: 5, title: 'Codec old issue', created_at: '2026-01-01' },
      ]),
    )
    .mockResolvedValueOnce(Response.json([{ filename: 'src/codec/file.ts', patch: 'untrusted patch' }]))
  const result = await observeGitHub(
    new RadarClient(request),
    'example/repo',
    { partition: 'a' },
    Date.parse('2026-01-02'),
    githubMatcher(['Codec'], ['src/codec']),
    signal,
    stats(),
  )
  expect(result.runs).toEqual([
    { id: 4, failure: true },
    { id: 3, failure: true },
  ])
  expect(result.related.map(({ number, kind }) => [number, kind])).toEqual([
    [3, 'issue'],
    [4, 'pr'],
  ])
  expect(JSON.stringify(result)).not.toMatch(/previous instructions|external instruction|untrusted patch/)
})
