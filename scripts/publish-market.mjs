import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parseMarketIndex } from '@deepseek-ai/dsh-plugin-market-index'
import { format, resolveConfig } from 'prettier'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Run the release workflow in GitHub Actions')
assert.equal(process.env.GITHUB_REPOSITORY, 'Xiaxin1235/WhaleMaid')
const run = (command, args, cwd = root) => execFileSync(command, args, { cwd, encoding: 'utf8' }).trim()
const pkg = JSON.parse(readFileSync(join(root, 'packages/host/package.json'), 'utf8'))
const version = pkg.version
assert.match(version, /^\d+\.\d+\.\d+$/)
assert.equal(process.env.RELEASE_TAG, `v${version}`)
const repo = 'Xiaxin1235/WhaleMaid'
const repoUrl = `https://github.com/${repo}.git`
const out = join(root, 'dist/release')
const report = JSON.parse(readFileSync(join(out, 'verification.json'), 'utf8'))
assert.equal(report.sourceCommit, run('git', ['rev-parse', 'HEAD']))
const archive = join(out, `dsh-whalemaid-full-${version}.tgz`)
assert.equal(createHash('sha256').update(readFileSync(archive)).digest('hex'), report.sha256)

// Native Discover accepts pinned Git packages. Publish exactly the tested
// archive's file tree, with no source build or additional dependencies added.
const work = mkdtempSync(join(tmpdir(), 'whalemaid-market-'))
run('tar', ['-xzf', archive, '-C', work])
const directory = join(work, 'package')
const branch = `codex/market-package-v${version}`
run('git', ['init', '--initial-branch', branch], directory)
run('git', ['config', 'core.autocrlf', 'false'], directory)
run('git', ['config', 'user.name', 'github-actions[bot]'], directory)
run('git', ['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'], directory)
run('git', ['config', 'credential.helper', '!gh auth git-credential'], directory)
run('git', ['add', '--force', '.'], directory)
run(
  'git',
  ['commit', '--quiet', '-m', `build: WhaleMaid complete ${version} from ${report.sourceCommit}`],
  directory,
)
run('git', ['remote', 'add', 'origin', repoUrl], directory)
const existing = run('git', ['ls-remote', '--heads', 'origin', `refs/heads/${branch}`], directory)
let commit
if (existing) {
  run('git', ['fetch', '--depth', '1', 'origin', branch], directory)
  assert.equal(
    run('git', ['rev-parse', 'HEAD^{tree}'], directory),
    run('git', ['rev-parse', 'FETCH_HEAD^{tree}'], directory),
    'Published package tree differs',
  )
  commit = run('git', ['rev-parse', 'FETCH_HEAD'], directory)
} else {
  run('git', ['push', 'origin', `HEAD:refs/heads/${branch}`], directory)
  commit = run('git', ['rev-parse', 'HEAD'], directory)
}
const gh = (...args) => run('gh', args)
const releaseApi = `repos/${repo}/releases/tags/v${version}`
let release
try {
  release = JSON.parse(gh('api', releaseApi))
} catch (error) {
  if (!String(error.stderr).includes('404')) throw error
}
if (release) {
  for (const name of [`dsh-whalemaid-full-${version}.tgz`, 'dsh-whalemaid-full.tgz'])
    assert.equal(
      release.assets.find((a) => a.name === name)?.digest,
      `sha256:${report.sha256}`,
      'Published release bytes differ',
    )
} else {
  const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8').replace(/\r\n/g, '\n')
  const section = changelog.split(`## ${version}\n`)[1]?.split('\n## ')[0]
  assert.ok(section, 'Current changelog section required')
  const notes = join(work, 'release-notes.md')
  writeFileSync(
    notes,
    `WhaleMaid Complete ${version}: one install includes the pinned companion fork.\n${section}\n\nMIT source: https://github.com/${repo}/tree/${report.sourceCommit}\nCompanion source and AGPL notices: https://github.com/Xiaxin1235/dsh-coopanion/tree/${report.companion.sourceCommit}\n`,
  )
  gh(
    'release',
    'create',
    `v${version}`,
    archive,
    join(out, 'dsh-whalemaid-full.tgz'),
    join(out, 'verification.json'),
    join(out, 'SHA256SUMS'),
    '--repo',
    repo,
    '--verify-tag',
    '--title',
    `WhaleMaid Complete ${version}`,
    '--notes-file',
    notes,
  )
  release = JSON.parse(gh('api', releaseApi))
}
const path = `repos/${repo}/contents/market/index.json`
let previous
try {
  previous = JSON.parse(gh('api', `${path}?ref=master`))
} catch (error) {
  if (!String(error.stderr).includes('404')) throw error
}
const old = previous ? JSON.parse(Buffer.from(previous.content, 'base64').toString('utf8')) : undefined
const entry = {
  name: pkg.name,
  title: { en: 'WhaleMaid Complete', zh: 'WhaleMaid 完整版' },
  description: {
    en: 'Project autopilot, memory and companion conversations, with the compatible desktop pet installed automatically.',
    zh: '项目自动推进、长期记忆和大肥鱼对话，一次安装自动带上配套桌宠。',
  },
  author: 'Xiaxin1235',
  homepage: `https://github.com/${repo}`,
  repository: { url: `https://github.com/${repo}`, directory: 'packages/host' },
  metadata: { keywords: ['whalemaid', 'companion', 'memory', 'autopilot', '桌宠', '大肥鱼'] },
  versions: [
    {
      version,
      publishTimestamp: Math.floor(Date.parse(release.published_at) / 1000),
      source: { type: 'git', url: repoUrl, commit },
      engines: { dsh: pkg.engines.dsh },
    },
    ...(old?.plugins[0]?.versions ?? []).filter((v) => v.version !== version),
  ],
}
const index = { format: 1, title: { en: 'WhaleMaid', zh: 'WhaleMaid 完整版' }, plugins: [entry] }
parseMarketIndex(index, `https://raw.githubusercontent.com/${repo}/master/market/index.json`)
const body = {
  message: `chore: update WhaleMaid market to ${version}`,
  branch: 'master',
  content: Buffer.from(
    await format(JSON.stringify(index), {
      ...(await resolveConfig(join(root, 'market/index.json'))),
      parser: 'json',
    }),
  ).toString('base64'),
  ...(previous ? { sha: previous.sha } : {}),
}
const payload = join(work, 'index-update.json')
writeFileSync(payload, JSON.stringify(body))
gh('api', '--method', 'PUT', path, '--input', payload)
console.log(`Published complete package and native Discover index for ${version} (${commit}).`)
