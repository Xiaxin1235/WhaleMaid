import { RadarRepoSchema } from '@whalemaid/core'
import type { RadarGitHub } from '@whalemaid/core'
import { sha256 } from '../store/index.js'
import { record, string } from './dependencies.js'
import type { RadarClient } from './client.js'

export function githubRepo(value: string | undefined) {
  const raw = value
    ?.trim()
    .replace(/^(?:https:\/\/github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)/i, '')
    .replace(/\/$/, '')
    .replace(/\.git$/i, '')
  if (!raw || raw.split('/').some((part) => part === '.' || part === '..')) return undefined
  const result = RadarRepoSchema.safeParse(raw)
  return result.success ? result.data.toLowerCase() : undefined
}

const words = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}-]{2,}/gu) ?? []
const generic = new Set([
  'src',
  'lib',
  'docs',
  'test',
  'tests',
  'with',
  'the',
  'and',
  'for',
  'from',
  'fix',
  'add',
  'change',
  'update',
  'review',
  'readme',
  'work',
  'project',
  'support',
])

export function githubMatcher(titles: string[], paths: string[]) {
  const names = paths.flatMap((path) => path.split(/[\\/]+/).filter(Boolean))
  const terms = new Set([...titles, ...names].flatMap(words).filter((word) => !generic.has(word)))
  const prefixes = paths.filter(Boolean).map((path) => path.toLowerCase().replaceAll('\\', '/'))
  return {
    title: (title: string) => words(title).some((word) => terms.has(word)),
    path: (path: string) => {
      const normalized = path.toLowerCase()
      return (
        prefixes.some((prefix) => normalized === prefix || normalized.startsWith(prefix + '/')) ||
        words(normalized).some((word) => terms.has(word))
      )
    },
  }
}

export async function observeGitHub(
  client: RadarClient,
  repo: string,
  github: { token?: string | undefined; partition: string },
  after: number,
  match: ReturnType<typeof githubMatcher>,
  signal: AbortSignal,
  stats: Parameters<RadarClient['get']>[2],
): Promise<RadarGitHub> {
  const url = (suffix = '') => new URL('https://api.github.com/repos/' + repo + suffix)
  const get = <T>(endpoint: URL, project: (value: unknown) => T) =>
    client.get(endpoint, signal, stats, project, github)
  const branch = await get(url(), (body) => {
    const name = string(record(body).default_branch)
    if (!name || name.length > 240 || /[\p{Cc}]/u.test(name)) throw Error('invalid-branch')
    return name
  })
  const actions = url('/actions/runs')
  actions.search = new URLSearchParams({ branch, status: 'completed', per_page: '12' }).toString()
  const runs = await get(actions, (body) => {
    const raw = record(body).workflow_runs
    if (!Array.isArray(raw)) throw Error('invalid-runs')
    return raw.slice(0, 12).flatMap((run) => {
      const { id, conclusion, head_branch } = record(run)
      return typeof id === 'number' && Number.isSafeInteger(id) && id > 0 && head_branch === branch
        ? [{ id, failure: conclusion === 'failure' || conclusion === 'timed_out' }]
        : []
    })
  })
  const issues = await get(url('/issues?state=open&sort=created&direction=desc&per_page=20'), (body) => {
    if (!Array.isArray(body)) throw Error('invalid-issues')
    return body.slice(0, 20).flatMap((item) => {
      const { number, title, pull_request, created_at } = record(item)
      if (
        typeof number !== 'number' ||
        !Number.isSafeInteger(number) ||
        number < 1 ||
        typeof title !== 'string' ||
        !(Date.parse(string(created_at) ?? '') >= after)
      )
        return []
      return [
        {
          number,
          kind: (pull_request ? 'pr' : 'issue') as 'pr' | 'issue',
          titleMatch: match.title(title.slice(0, 400)),
          hash: sha256.hash(title),
        },
      ]
    })
  })
  const related: RadarGitHub['related'] = []
  let fileChecks = 0
  for (const { titleMatch, ...item } of issues) {
    if (titleMatch) related.push(item)
    else if (item.kind === 'pr' && fileChecks < 3) {
      fileChecks++
      const digest = await get(url('/pulls/' + item.number + '/files?per_page=30'), (body) => {
        if (!Array.isArray(body)) throw Error('invalid-files')
        const names = body.slice(0, 30).flatMap((file) => {
          const { filename, previous_filename } = record(file)
          return [filename, previous_filename].filter((value): value is string => typeof value === 'string')
        })
        return names.some(match.path) ? sha256.hash(JSON.stringify(names)) : ''
      })
      if (digest) related.push({ ...item, hash: sha256.hash(item.hash + digest) })
    }
  }
  return { branch, runs, related }
}
