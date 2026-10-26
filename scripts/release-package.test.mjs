import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, symlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
test('complete distribution loads without an unpublished workspace core and activates both components', () => {
  const stage = execFileSync(process.execPath, ['scripts/pack-release.mjs', '--stage-only'], {
    cwd: root,
    encoding: 'utf8',
  }).trim()
  const pkg = JSON.parse(readFileSync(join(stage, 'package.json'), 'utf8'))
  assert.equal(pkg.dependencies['@whalemaid/core'], undefined)
  assert.equal(
    pkg.dependencies['@takboo/dsh-coopanion'],
    JSON.parse(readFileSync(join(root, 'market/companion.json'), 'utf8')).tarball,
  )
  assert.ok(!JSON.stringify(pkg).includes('workspace:'))
  const patch = readFileSync(join(stage, 'cordis.patch.yml'), 'utf8')
  assert.equal(patch.match(/id: dsh-coopanion\b/g)?.length, 1)
  assert.equal(patch.match(/^\s+- id: whaledot\s*$/gm)?.length, 1)
  assert.ok(patch.includes('id: preset-whaledot-companion'))
  assert.deepEqual(readdirSync(join(stage, 'vendor')), ['core'])
  assert.ok(!readdirSync(stage).includes('desktop'))
  // Resolve against the installed development dependencies only for this load
  // check. node_modules is never part of the generated archive or Git package.
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
