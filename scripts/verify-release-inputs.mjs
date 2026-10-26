import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import process from 'node:process'
import { URL } from 'node:url'

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
const pkg = read('../packages/host/package.json')
const companion = read('../market/companion.json')
assert.match(pkg.version, /^\d+\.\d+\.\d+$/)
assert.equal(process.env.RELEASE_TAG, `v${pkg.version}`)
const download = async (url) => {
  const response = await globalThis.fetch(url, { signal: globalThis.AbortSignal.timeout(120000) })
  assert.equal(response.status, 200, `Cannot download ${url}`)
  return response
}
const report = await (await download(companion.tarball.replace(/[^/]+$/, 'verification.json'))).json()
assert.equal(report.name, companion.name)
assert.equal(report.version, companion.version)
assert.equal(report.sourceCommit, companion.sourceCommit)
const bytes = await (await download(companion.tarball)).arrayBuffer()
assert.equal(createHash('sha256').update(new Uint8Array(bytes)).digest('hex'), report.sha256)
console.log(`Release inputs verified: WhaleMaid ${pkg.version}, companion ${companion.version}`)
