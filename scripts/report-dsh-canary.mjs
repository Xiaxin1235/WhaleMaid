import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

const versions = JSON.parse(process.env.DSH_CANARY_VERSIONS)
const run = process.env.DSH_CANARY_RUN_URL
const root = 'dsh-canary-failures'
const failures = existsSync(root)
  ? readdirSync(root).map((artifact) =>
      JSON.parse(readFileSync(join(root, artifact, 'failure.json'), 'utf8')),
    )
  : []
const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8' }).trim()
for (const version of versions) {
  const details = failures
    .filter((failure) => failure.version === version)
    .map(({ os, step }) => '- ' + os + ' / ' + step)
  if (process.env.DSH_CANARY_PACKAGE === 'failure') details.push('- Windows / Build complete package')
  if (!details.length) continue
  const title = 'DSH ' + version + ' compatibility check failed'
  const open = JSON.parse(
    gh('issue', 'list', '--state', 'open', '--search', '"' + title + '" in:title', '--json', 'title,number'),
  )
  if (open.some((issue) => issue.title === title)) continue
  gh(
    'issue',
    'create',
    '--title',
    title,
    '--body',
    ['Failed steps', ...details, '', 'Workflow logs: ' + run].join('\n'),
  )
}
