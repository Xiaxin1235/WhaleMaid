import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const options = {}
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i]
  if (!['--root', '--reference', '--revision', '--report'].includes(key) || !process.argv[i + 1])
    throw Error(
      'Usage: check-license-boundary.mjs [--root dir] [--reference AGPL-repo] [--revision commit] [--report json]',
    )
  options[key] = key === '--revision' ? process.argv[i + 1] : resolve(process.argv[i + 1])
}
const root = options['--root'] ?? resolve(dirname(fileURLToPath(import.meta.url)), '..')
const tracked = (dir) =>
  execFileSync('git', ['ls-files', '-z'], { cwd: dir, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
    .split('\0')
    .filter(Boolean)
const hash = (data) => createHash('sha256').update(data).digest('hex')
/** Read one committed tree through Git objects; never mix in another task's working-tree edits. */
function snapshot(dir, revision) {
  const head = execFileSync('git', ['rev-parse', '--verify', `${revision}^{commit}`], {
    cwd: dir,
    encoding: 'utf8',
  }).trim()
  const entries = execFileSync('git', ['ls-tree', '-r', '-z', '--full-tree', head], {
    cwd: dir,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean)
    .map((line) => {
      const tab = line.indexOf('\t'),
        [, type, id] = line.slice(0, tab).split(' ')
      if (type !== 'blob') throw Error('Reference submodules require a separate comparison')
      return { path: line.slice(tab + 1), id }
    })
  const ids = [...new Set(entries.map((e) => e.id))]
  const raw = execFileSync('git', ['cat-file', '--batch'], {
    cwd: dir,
    input: ids.join('\n') + '\n',
    maxBuffer: 512 * 1024 * 1024,
  })
  const blobs = new Map()
  let offset = 0
  for (const id of ids) {
    const end = raw.indexOf(10, offset),
      [actual, type, size] = raw.subarray(offset, end).toString('ascii').split(' ')
    const length = Number(size)
    if (
      end < 0 ||
      actual !== id ||
      type !== 'blob' ||
      !Number.isSafeInteger(length) ||
      length < 0 ||
      end + length + 1 >= raw.length
    )
      throw Error('Invalid Git blob response')
    blobs.set(id, raw.subarray(end + 1, end + 1 + length))
    offset = end + length + 2
  }
  return { head, files: entries.map((e) => ({ path: e.path, bytes: blobs.get(e.id) })) }
}
const media =
  /\.(?:png|jpe?g|gif|webp|svg|avif|ico|bmp|icns|wav|mp3|ogg|flac|aac|m4a|mp4|webm|zip|figpack|vrm|glb|gltf)$/i
const code = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.css', '.html', '.md', '.mdx'])
const files = tracked(root).map((path) => ({ path, bytes: readFileSync(resolve(root, path)) }))
const errors = []
const forbidden =
  /(?:@takboo\/dsh-coopanion|(?:^|[/\\])dsh-coopanion(?:[/\\]|$)|github:takboo\/dsh-coopanion)/i
let manifests = 0,
  longestQuote = 0
for (const { path, bytes } of files) {
  const text = bytes.toString('utf8')
  if (/(?:^|\/)package.json$/.test(path)) {
    manifests++
    const pkg = JSON.parse(text)
    for (const key of [
      'dependencies',
      'devDependencies',
      'peerDependencies',
      'optionalDependencies',
      'bundledDependencies',
      'bundleDependencies',
    ]) {
      for (const [name, value] of Object.entries(pkg[key] ?? {}))
        if (forbidden.test(name) || forbidden.test(String(value)))
          errors.push(`${path}: forbidden dependency in ${key}: ${name}`)
    }
    if (pkg.license !== 'MIT') errors.push(`${path}: expected MIT license`)
  }
  if (!/^(?:docs|prompts)\//.test(path) && code.has(extname(path))) {
    // Inspect module specifiers, including dynamic imports, require and side-effect imports.
    for (const m of text.matchAll(
      /(?:\bfrom\s*|\b(?:import|require|require\.resolve)\s*\(?\s*)['"]([^'"]+)['"]/g,
    ))
      if (forbidden.test(m[1])) errors.push(`${path}: forbidden module import ${m[1]}`)
    if (path.startsWith('packages/') && /\bAGPL(?:-3\.0)?\b|SPDX-License-Identifier:\s*AGPL/.test(text))
      errors.push(`${path}: AGPL marker in package source`)
  }
  if (path.startsWith('docs/coopanion/') && path.endsWith('.md')) {
    let fence,
      count = 0
    for (const line of text.split(/\r?\n/)) {
      const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/)
      if (marker && !fence) {
        fence = marker[1]
        count = 0
      } else if (marker && marker[1][0] === fence?.[0] && marker[1].length >= fence.length) {
        longestQuote = Math.max(longestQuote, count)
        if (count > 15) errors.push(`${path}: fenced quotation exceeds 15 lines (${count})`)
        fence = undefined
      } else if (fence) count++
    }
  }
}

// Comparing normalized 16-line windows catches partial copies without retaining reference source.
function windows(bytes) {
  if (bytes.includes(0)) return []
  const lines = bytes
    .toString('utf8')
    .split(/\r?\n/)
    .map((text, i) => ({ text: text.trim(), line: i + 1 }))
    .filter((v) => v.text && v.text.length <= 8000)
  const out = []
  for (let i = 0; i + 16 <= lines.length; i++) {
    const text = lines
      .slice(i, i + 16)
      .map((v) => v.text)
      .join('\n')
    if (text.length >= 240) out.push({ hash: hash(text), line: lines[i].line })
  }
  return out
}
function embedded(bytes) {
  if (bytes.includes(0)) return []
  return [
    ...bytes.toString('utf8').matchAll(/<svg\b[\s\S]*?<\/svg>|data:(?:image|audio|video)\/[^\s"'<>]+/gi),
  ]
    .map((m) => m[0].replace(/\s+/g, ' ').trim())
    .filter((value) => value.length >= 100)
    .map((value) => hash(value))
}
const result = {
  trackedFiles: files.length,
  manifests,
  mediaFiles: files.filter((f) => media.test(f.path)).map((f) => f.path),
  longestCoopanionFence: longestQuote,
  reference: null,
  exactMatches: [],
  shortMatches: [],
  blockMatches: [],
  embeddedMedia: files.flatMap((f) => (code.has(extname(f.path)) ? embedded(f.bytes) : [])).length,
  embeddedMatches: [],
  errors,
}
if (options['--reference']) {
  const reference = options['--reference']
  if (reference === root) throw Error('Reference must be a separate checkout')
  const committed = snapshot(reference, options['--revision'] ?? 'HEAD'),
    hashes = new Map(),
    blocks = new Map(),
    embeddedHashes = new Map()
  for (const { path, bytes } of committed.files) {
    const digest = hash(bytes)
    if (!hashes.has(digest)) hashes.set(digest, path)
    if (code.has(extname(path)))
      for (const w of windows(bytes)) if (!blocks.has(w.hash)) blocks.set(w.hash, { path, line: w.line })
    if (code.has(extname(path)))
      for (const h of embedded(bytes)) if (!embeddedHashes.has(h)) embeddedHashes.set(h, path)
  }
  for (const { path, bytes } of files) {
    const same = hashes.get(hash(bytes))
    if (same !== undefined) {
      const entry = { file: path, reference: same, bytes: bytes.length }
      if (bytes.length >= 100 || media.test(path)) result.exactMatches.push(entry)
      else result.shortMatches.push(entry) // Empty files / tiny generic metadata are not evidence of source reuse.
    }
    if (code.has(extname(path))) {
      for (const h of embedded(bytes))
        if (embeddedHashes.has(h))
          result.embeddedMatches.push({ file: path, reference: embeddedHashes.get(h) })
      const hit = windows(bytes)
        .map((w) => ({ ownLine: w.line, ref: blocks.get(w.hash) }))
        .find((v) => v.ref)
      if (hit) result.blockMatches.push({ file: path, line: hit.ownLine, reference: hit.ref })
    }
  }
  result.reference = {
    path: reference,
    head: committed.head,
    source: 'committed Git blobs',
    trackedFiles: committed.files.length,
    worktreeClean: !execFileSync('git', ['status', '--porcelain'], {
      cwd: reference,
      encoding: 'utf8',
    }).trim(),
    normalizedWindows: blocks.size,
  }
  for (const m of result.exactMatches) errors.push(`${m.file}: identical reference content (${m.reference})`)
  for (const m of result.blockMatches)
    errors.push(`${m.file}:${m.line}: 16-line reference overlap (${m.reference.path}:${m.reference.line})`)
  for (const m of result.embeddedMatches) errors.push(`${m.file}: identical embedded media (${m.reference})`)
}
if (options['--report']) writeFileSync(options['--report'], JSON.stringify(result, null, 2) + '\n')
console.log(
  `License boundary: ${files.length} tracked files, ${manifests} manifests, ${result.mediaFiles.length} media, longest report fence ${longestQuote} lines`,
)
console.log(
  result.reference
    ? `Reference ${result.reference.head.slice(0, 12)}: ${result.reference.trackedFiles} files; exact matches ${result.exactMatches.length}, 16-line overlaps ${result.blockMatches.length}, embedded matches ${result.embeddedMatches.length}, tiny matches ${result.shortMatches.length}`
    : 'Reference comparison not run; supply --reference <separate checkout> for hash and partial-copy checks.',
)
if (errors.length) {
  console.error(errors.join('\n'))
  process.exitCode = 1
}
