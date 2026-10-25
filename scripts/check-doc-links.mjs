import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { dirname, extname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)
const known = new Set(files)
const docs = files.filter((p) => /\.(?:md|mdx|html)$/.test(p))
/** Preserve line positions while excluding fenced examples and inline code from Markdown links. */
function visible(text, inline = true) {
  let fence
  return text
    .split('\n')
    .map((line) => {
      const m = line.match(/^\s{0,3}(`{3,}|~{3,})/)
      if (m && !fence) {
        fence = m[1]
        return ''
      }
      if (fence) {
        if (m && m[1][0] === fence[0] && m[1].length >= fence.length) fence = undefined
        return ''
      }
      return inline ? line.replace(/(`+)[^`]*?\1/g, '') : line
    })
    .join('\n')
}
function targets(text) {
  const out = []
  for (const m of text.matchAll(/\]\(\s*/g)) {
    let i = m.index + m[0].length,
      url = '',
      depth = 0
    if (text[i] === '<') {
      const end = text.indexOf('>', i)
      if (end >= 0) url = text.slice(i + 1, end)
    } else
      for (; i < text.length; i++) {
        const c = text[i]
        if (c === '\\' && i + 1 < text.length) {
          url += text[++i]
          continue
        }
        if ((c === ')' && depth === 0) || /\s/.test(c)) break
        if (c === '(') depth++
        if (c === ')') depth--
        url += c
      }
    if (url) out.push(url)
  }
  for (const m of text.matchAll(/^\s{0,3}\[[^\]]+\]:\s*(?:<([^>]+)>|(\S+))/gm)) out.push(m[1] ?? m[2])
  for (const m of text.matchAll(/\b(?:href|src)\s*=\s*['"]([^'"]+)['"]/g)) out.push(m[1])
  return out
}
const anchors = new Map()
function ids(path) {
  if (anchors.has(path)) return anchors.get(path)
  const text = readFileSync(resolve(root, path), 'utf8'),
    result = new Set(),
    counts = new Map()
  for (const m of text.matchAll(/\b(?:id|name)\s*=\s*['"]([^'"]+)['"]/g)) result.add(m[1])
  for (const m of visible(text, false).matchAll(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const slug = m[1]
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]*>/g, '')
      .replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu, '')
      .trim()
      .toLowerCase()
      .replace(/\s/g, '-')
    const n = counts.get(slug) ?? 0
    result.add(slug + (n ? '-' + n : ''))
    counts.set(slug, n + 1)
  }
  anchors.set(path, result)
  return result
}
let checked = 0
const errors = []
for (const file of docs) {
  const raw = readFileSync(resolve(root, file), 'utf8'),
    text = file.endsWith('.html') ? raw : visible(raw)
  for (const target of targets(text)) {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/|\{\{)/i.test(target) || target === '#') continue
    checked++
    try {
      const [uri, fragment] = target.replaceAll('&amp;', '&').split('#'),
        path = decodeURIComponent(uri.split('?')[0])
      let abs = path ? resolve(dirname(resolve(root, file)), path) : resolve(root, file),
        rel = relative(root, abs).split(sep).join('/')
      if (rel.startsWith('../') || rel === '..') throw Error('outside repository')
      const stat = statSync(abs)
      if (stat.isDirectory()) {
        if (!files.some((f) => f.startsWith(rel + '/'))) throw Error('untracked directory')
        if (fragment) {
          rel += '/README.md'
          abs = resolve(root, rel)
        }
      } else if (!known.has(rel)) throw Error('target is not tracked')
      if (
        fragment &&
        ['.md', '.mdx', '.html'].includes(extname(abs)) &&
        !ids(rel).has(decodeURIComponent(fragment))
      )
        throw Error('missing anchor')
    } catch (e) {
      errors.push(`${file}: ${target} (${e.message})`)
    }
  }
}
console.log(
  `Documentation links: ${docs.length} tracked documents, ${checked} relative targets, ${errors.length} broken`,
)
if (errors.length) {
  console.error(errors.join('\n'))
  process.exitCode = 1
}
