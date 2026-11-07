import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
test('staged complete manifest loads the private core and declares both components', () => {
  const stage = execFileSync(process.execPath, ['scripts/pack-release.mjs', '--stage-only'], {
    cwd: root,
    encoding: 'utf8',
  }).trim()
  const pkg = JSON.parse(readFileSync(join(stage, 'package.json'), 'utf8'))
  assert.equal(pkg.dependencies['@whalemaid/core'], undefined)
  assert.equal(
    pkg.dependencies['@takboo/dsh-coopanion'],
    JSON.parse(readFileSync(join(root, 'market/companion.json'), 'utf8')).version,
  )
  assert.deepEqual(pkg.bundledDependencies, ['@takboo/dsh-coopanion'])
  assert.ok(!JSON.stringify(pkg).includes('workspace:'))
  const patch = readFileSync(join(stage, 'cordis.patch.yml'), 'utf8')
  assert.equal(patch.match(/id: dsh-coopanion\b/g)?.length, 1)
  assert.equal(patch.match(/^\s+- id: whaledot\s*$/gm)?.length, 1)
  assert.ok(patch.includes('id: preset-whaledot-companion'))
  assert.deepEqual(readdirSync(join(stage, 'vendor')), ['core'])
  assert.ok(!readdirSync(stage).includes('desktop'))
  assert.ok(pkg.files.includes('lib/**/*.js'))
  assert.ok(pkg.files.includes('THIRD_PARTY_NOTICES.md'))
  assert.match(readFileSync(join(stage, 'THIRD_PARTY_NOTICES.md'), 'utf8'), /ZipZipPipe/)
  const client = readFileSync(join(stage, 'lib/client.js'), 'utf8')
  for (const [name, mime] of [
    ['dafeiyu.webp', 'image/webp'],
    ['dafeiyu.gif', 'image/gif'],
    ['dafeiyu-still.png', 'image/png'],
  ]) {
    const source = join(root, 'packages/host/welcome', name)
    if (!existsSync(source)) continue
    const bytes = readFileSync(source)
    assert.ok(bytes.length <= 600_000, name + ' exceeds 600 KB')
    assert.ok(
      client.includes('data:' + mime + ';base64,' + bytes.toString('base64')),
      name + ' is missing from the client bundle',
    )
  }
  // Resolve against the installed development dependencies only for this load
  // check. The actual archive separately materializes the verified bundled pet.
  mkdirSync(join(stage, 'node_modules'), { recursive: true })
  for (const packageDir of ['host', 'core']) {
    const modules = join(root, 'packages', packageDir, 'node_modules')
    for (const name of readdirSync(modules).filter((name) => name !== '.bin' && name !== '@whalemaid')) {
      const names = name.startsWith('@')
        ? readdirSync(join(modules, name)).map((child) => name + '/' + child)
        : [name]
      for (const dep of names) {
        const target = join(stage, 'node_modules', dep)
        mkdirSync(dirname(target), { recursive: true })
        try {
          symlinkSync(join(modules, dep), target, 'junction')
        } catch (error) {
          if (error.code !== 'EEXIST') throw error
        }
      }
    }
  }
  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "import assert from 'node:assert/strict'; const core = await import('#whalemaid/core'); assert.equal(typeof core.resolveLocale, 'function'); const host = await import('./lib/index.js'); assert.equal(typeof host.apply, 'function'); await import('./lib/companion/agent.js');",
    ],
    { cwd: stage, stdio: 'pipe' },
  )
})
