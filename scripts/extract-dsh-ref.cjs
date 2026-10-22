// Run with Desktop's Electron and ELECTRON_RUN_AS_NODE=1 (asar-aware fs).
const fs = require('node:fs')
const path = require('node:path')

if (!process.versions.electron || process.env.ELECTRON_RUN_AS_NODE !== '1') {
  throw new Error('Use DeepSeek Harness.exe with ELECTRON_RUN_AS_NODE=1')
}
const app = path.join(path.dirname(process.execPath), 'resources', 'app.asar')
const version = JSON.parse(fs.readFileSync(path.join(app, 'package.json'), 'utf8')).version
const source = path.join(app, 'dsh', 'node_modules', '@deepseek-ai')
const target = path.resolve(__dirname, '..', '.dsh-ref', version)
const rows = []

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true })
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name)
    const dst = path.join(to, entry.name)
    if (entry.isDirectory()) copyTree(src, dst)
    else if (entry.name.endsWith('.d.ts')) fs.copyFileSync(src, dst)
  }
}

for (const pkg of fs.readdirSync(source).sort()) {
  const from = path.join(source, pkg)
  const manifest = path.join(from, 'package.json')
  if (!fs.existsSync(manifest)) continue
  const metadata = JSON.parse(fs.readFileSync(manifest, 'utf8'))
  const to = path.join(target, '@deepseek-ai', pkg)
  fs.mkdirSync(to, { recursive: true })
  for (const filename of fs.readdirSync(from)) {
    if (filename === 'package.json' || /^README.*\.md$/i.test(filename)) {
      fs.copyFileSync(path.join(from, filename), path.join(to, filename))
    }
  }
  const types = path.join(from, 'lib', 'types')
  if (fs.existsSync(types)) copyTree(types, path.join(to, 'lib', 'types'))
  rows.push(`| ${metadata.name} | ${metadata.version} |`)
}
fs.writeFileSync(
  path.join(target, 'INDEX.md'),
  `# DSH Desktop ${version} reference\n\nOnly package.json, README*.md and declarations under lib/types/** are copied. Runtime JavaScript is excluded. Desktop may omit declarations even when package.json advertises them.\n\n| Package | Version |\n| --- | --- |\n${rows.join('\n')}\n`,
)
console.log(`Extracted ${rows.length} packages to ${target}`)
