import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))
const saveJson = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n')
const host = readJson(join(root, 'packages/host/package.json'))
const core = readJson(join(root, 'packages/core/package.json'))
const companion = readJson(join(root, 'market/companion.json'))
const stageOnly = process.argv.includes('--stage-only')
if (!stageOnly) assert.equal(git('status', '--porcelain'), '', 'Commit source before making a release')
assert.equal(host.version, core.version)
assert.equal(host.license, 'MIT')
assert.equal(core.license, 'MIT')
assert.match(companion.sourceCommit, /^[a-f0-9]{40}$/)
assert.equal(
  companion.tarball,
  `https://github.com/Xiaxin1235/dsh-coopanion/releases/download/v${companion.version}/dsh-coopanion-${companion.version}.tgz`,
)
for (const dir of ['host', 'core'])
  assert.ok(existsSync(join(root, `packages/${dir}/lib/index.js`)), 'Run pnpm build first')

const out = join(root, 'dist/release')
mkdirSync(out, { recursive: true })
const stage = mkdtempSync(join(out, 'stage-'))
for (const name of ['lib', 'companion', 'LICENSE'])
  cpSync(join(root, 'packages/host', name), join(stage, name), { recursive: true })
cpSync(join(root, 'packages/core/lib'), join(stage, 'vendor/core/lib'), { recursive: true })
cpSync(join(root, 'packages/core/LICENSE'), join(stage, 'vendor/core/LICENSE'))

// Keep the original module/resource layout. The private import is local to this
// package, so installation never needs the unpublished workspace core package.
function rewrite(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) rewrite(path)
    else if (/\.(?:js|ts)$/.test(entry.name)) {
      const text = readFileSync(path, 'utf8')
      writeFileSync(path, text.replace(/(['"])@whalemaid\/core\1/g, '$1#whalemaid/core$1'))
    }
  }
}
rewrite(join(stage, 'lib'))
const pkg = globalThis.structuredClone(host)
delete pkg.scripts
delete pkg.devDependencies
delete pkg.dependencies['@whalemaid/core']
for (const [name, version] of Object.entries(core.dependencies ?? {})) {
  assert.ok(!pkg.dependencies[name] || pkg.dependencies[name] === version, `Conflicting ${name}`)
  pkg.dependencies[name] = version
}
pkg.dependencies['@takboo/dsh-coopanion'] = companion.version
pkg.bundledDependencies = ['@takboo/dsh-coopanion']
pkg.imports = {
  '#whalemaid/core': {
    types: './vendor/core/lib/types/index.d.ts',
    default: './vendor/core/lib/index.js',
  },
}
pkg.files.push(
  'vendor/core/lib/**/*.js',
  'vendor/core/lib/types/**/*.d.ts',
  'vendor/core/LICENSE',
  'DISTRIBUTION.md',
  'release-source.json',
)
saveJson(join(stage, 'package.json'), pkg)
writeFileSync(
  join(stage, 'cordis.patch.yml'),
  readFileSync(join(root, 'packages/host/cordis.patch.yml'), 'utf8') +
    "\n- insert:\n    - id: dsh-coopanion\n      name: '@takboo/dsh-coopanion'\n      config:\n        autoStart: true\n        roam: true\n        size: 150\n        notifications: true\n        bubbleDurationMs: 12000\n        defaultChatTarget: companion\n",
)
writeFileSync(
  join(stage, 'DISTRIBUTION.md'),
  `# WhaleMaid complete installation\n\nThis is a multi-license distribution. WhaleMaid and its private core are MIT licensed. Source: https://github.com/Xiaxin1235/WhaleMaid\n\nThe separate AGPL-3.0-or-later companion fork ${companion.version} is included as an npm bundled dependency, with its corresponding source, LICENSE, THIRD_PARTY_NOTICES.md and artwork notices under node_modules/@takboo/dsh-coopanion. It retains its own package identity and license; its implementation is not copied into WhaleMaid's MIT source. The two plugins still communicate through public DSH services. Fork source: https://github.com/Xiaxin1235/dsh-coopanion/tree/${companion.sourceCommit}\nUpstream and attribution: https://github.com/takboo/dsh-coopanion\nOther bundled runtime dependencies retain their own licenses. No package is published to the upstream npm account.\n`,
)
const source = { sourceCommit: git('rev-parse', 'HEAD'), version: host.version, companion }
saveJson(join(stage, 'release-source.json'), source)
if (stageOnly) {
  console.log(stage)
} else {
  assert.ok(process.env.npm_execpath, 'Run through pnpm pack:release')
  const response = await globalThis.fetch(companion.tarball, {
    signal: globalThis.AbortSignal.timeout(120000),
  })
  assert.equal(response.status, 200, 'Published companion archive is required')
  const bytes = new Uint8Array(await response.arrayBuffer())
  const metadata = await globalThis.fetch(companion.tarball.replace(/[^/]+$/, 'verification.json'), {
    signal: globalThis.AbortSignal.timeout(120000),
  })
  assert.equal(metadata.status, 200)
  const verified = await metadata.json()
  assert.equal(verified.version, companion.version)
  assert.equal(verified.sourceCommit, companion.sourceCommit)
  assert.equal(createHash('sha256').update(bytes).digest('hex'), verified.sha256)
  const dependency = join(out, `companion-${companion.version}.tgz`)
  writeFileSync(dependency, bytes)
  // Keep the consumer's blockExoticSubdeps protection enabled. Fetch the
  // verified archive only while assembling this separate distribution tree.
  writeFileSync(
    join(stage, 'pnpm-workspace.yaml'),
    'packages:\n  - .\nnodeLinker: hoisted\nautoInstallPeers: false\nblockExoticSubdeps: true\n',
  )
  const assembling = globalThis.structuredClone(pkg)
  delete assembling.bundledDependencies
  assembling.dependencies['@takboo/dsh-coopanion'] = `file:${dependency.replaceAll('\\', '/')}`
  saveJson(join(stage, 'package.json'), assembling)
  execFileSync(
    process.execPath,
    [process.env.npm_execpath, '--dir', stage, 'install', '--ignore-scripts', '--lockfile=false'],
    { stdio: 'inherit' },
  )
  assert.equal(
    readJson(join(stage, 'node_modules/@takboo/dsh-coopanion/package.json')).version,
    companion.version,
  )
  saveJson(join(stage, 'package.json'), pkg)
  execFileSync(
    process.execPath,
    [process.env.npm_execpath, '--dir', stage, 'pack', '--pack-destination', out],
    { stdio: 'inherit' },
  )
  const packed = join(out, `${host.name}-${host.version}.tgz`)
  assert.ok(existsSync(packed))
  const versioned = join(out, `dsh-whalemaid-full-${host.version}.tgz`)
  const alias = join(out, 'dsh-whalemaid-full.tgz')
  cpSync(packed, versioned)
  cpSync(packed, alias)
  const packedBytes = readFileSync(packed)
  const sha256 = createHash('sha256').update(packedBytes).digest('hex')
  saveJson(join(out, 'verification.json'), { name: host.name, ...source, sha256 })
  writeFileSync(
    join(out, 'SHA256SUMS'),
    `${sha256}  dsh-whalemaid-full-${host.version}.tgz\n${sha256}  dsh-whalemaid-full.tgz\n`,
  )
  console.log(`Complete installation package: ${versioned}`)
}
