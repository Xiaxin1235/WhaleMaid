import { readFileSync } from 'node:fs'
import process from 'node:process'
import { URL, fileURLToPath } from 'node:url'
import { load } from 'js-yaml'
import semver from 'semver'

export function untestedDshVersions(tags, tested) {
  return [...new Set([tags.latest, tags.next].filter(Boolean))].filter((version) => {
    if (semver.valid(version) !== version) throw Error('Invalid DSH dist-tag version: ' + version)
    return !tested.includes(version)
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const release = new URL('../.github/workflows/release.yml', import.meta.url)
  const tested = load(readFileSync(release, 'utf8')).jobs.install.strategy.matrix.dsh
  const response = await globalThis.fetch(
    'https://registry.npmjs.org/-/package/@deepseek-ai%2fdsh/dist-tags',
    {
      signal: globalThis.AbortSignal.timeout(30000),
    },
  )
  if (!response.ok) throw Error('DSH dist-tags returned HTTP ' + response.status)
  const tags = await response.json()
  if (!tags.latest) throw Error('The DSH registry response did not contain a latest tag')
  console.log(JSON.stringify(untestedDshVersions(tags, tested)))
}
