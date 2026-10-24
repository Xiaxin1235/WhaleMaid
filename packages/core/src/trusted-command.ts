import type { AuthorizationScope } from './model/authorization.js'
import { normalizeWindowsPath, isWithinPath } from './windows-path.js'

/** Intersection of simple globs, so visible shell globs cannot bypass protected names. */
function overlap(a: string, b: string): boolean {
  const queue: [number, number][] = [[0, 0]],
    seen = new Set<string>()
  while (queue.length) {
    const [i, j] = queue.pop()!,
      key = `${i}:${j}`
    if (seen.has(key)) continue
    seen.add(key)
    if (i === a.length && j === b.length) return true
    if (a[i] === '*') queue.push([i + 1, j])
    if (b[j] === '*') queue.push([i, j + 1])
    if (
      i < a.length &&
      j < b.length &&
      (a[i] === '*' || b[j] === '*' || a[i] === '?' || b[j] === '?' || a[i] === b[j])
    )
      queue.push([a[i] === '*' ? i : i + 1, b[j] === '*' ? j : j + 1])
  }
  return false
}

/** Textual best effort only: a script's body and runtime expansion are not visible here. */
export function inspectTrustedCommand(line: string, cwd: string, scope: AuthorizationScope) {
  const reasons: string[] = [],
    paths: string[] = [],
    segments: string[][] = []
  let protectedPattern = false
  let tokens: string[] = [],
    token = '',
    quote = ''
  const brackets: string[] = []
  const flush = () => {
    if (token) tokens.push(token)
    token = ''
  }
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!
    if (quote) {
      if (c === quote) {
        if (line[i + 1] === quote) {
          token += c
          i++
        } else quote = ''
      } else if (c === '`' && quote === '"' && i + 1 < line.length) {
        token += line[++i]
      } else token += c
    } else if (c === '"' || c === "'") quote = c
    else if (';&|\r\n(){}'.includes(c)) {
      flush()
      if (tokens.length) segments.push(tokens)
      tokens = []
      if (c === '(' || c === '{') brackets.push(c)
      if (c === ')' || c === '}') {
        if (brackets.pop() !== (c === ')' ? '(' : '{')) reasons.push('unparsed-command')
      }
    } else if (/\s|[<>]/.test(c)) flush()
    else if (c === '`') {
      reasons.push('unparsed-command')
      token += c
    } else token += c
  }
  flush()
  if (tokens.length) segments.push(tokens)
  if (quote || brackets.length || !segments.length || /[&|<>]\s*$|^\s*(?:\||&&)/.test(line))
    reasons.push('unparsed-command')
  const base = normalizeWindowsPath(cwd)!
  const roots = scope.allowedPaths.map(normalizeWindowsPath)
  for (const words of segments) {
    const executable = (words[0] ?? '')
      .replaceAll('\\', '/')
      .split('/')
      .at(-1)!
      .replace(/\.(?:exe|cmd)$/i, '')
      .toLowerCase()
    const args = words.slice(1),
      lower = args.map((s) => s.toLowerCase())
    if (['rm', 'del', 'erase', 'remove-item', 'ri', 'rmdir', 'rd'].includes(executable))
      reasons.push('delete')
    if (executable === 'git') {
      const sub = lower.find((s) => ['clean', 'rm', 'checkout', 'restore', 'stash', 'branch'].includes(s))
      if (
        sub === 'clean' ||
        sub === 'rm' ||
        (sub === 'checkout' && lower.includes('--') && lower.includes('.')) ||
        (sub === 'restore' && !lower.includes('--staged')) ||
        (sub === 'stash' && lower.some((s) => s === 'drop' || s === 'clear')) ||
        (sub === 'branch' && args.includes('-D'))
      )
        reasons.push('repository-delete')
    }
    if (
      ['invoke-expression', 'iex'].includes(executable) ||
      lower.some((s) => /^-(?:encodedcommand|enc)(?::|$)/i.test(s)) ||
      (['powershell', 'pwsh', 'cmd'].includes(executable) &&
        lower.some((s) => /^-command(?::|$)|^\/c$/.test(s))) ||
      (executable === 'node' && lower.some((s) => s === '-e' || s === '--eval' || s.startsWith('--eval='))) ||
      (/^python(?:[23](?:\.\d+)?)?$/.test(executable) && lower.includes('-c'))
    )
      reasons.push('dynamic-execution')
    for (const word of words) {
      // Preserve quoted spaces; recognize named arguments and redirection targets as well as plain paths.
      const candidate = word.replace(/^[-/][\w-]+[=:]/, '')
      if (/[*?]/.test(candidate)) {
        const normalized = normalizeWindowsPath(
          (/^[a-z]:[\\/]/i.test(candidate) ? candidate : `${cwd}\\${candidate}`)
            .replaceAll('*', 'whalestarplaceholder')
            .replaceAll('?', 'whalequestionplaceholder'),
        )
        if (normalized) {
          const pattern = normalized
            .replaceAll('whalestarplaceholder', '*')
            .replaceAll('whalequestionplaceholder', '?')
          protectedPattern ||=
            pattern
              .split('\\')
              .slice(1)
              .some((part) => scope.protectedNames.some((name) => overlap(part, name.toLowerCase()))) ||
            scope.protectedPaths.some((root) => {
              const value = root.replaceAll('/', '\\').toLowerCase()
              return overlap(pattern, value) || overlap(pattern, `${value}\\*`)
            })
        }
      }
      const absolute = /^[a-z]:[\\/]/i.test(candidate) || /^\\\\|^\/\//.test(candidate)
      const relative = /^(?:\.{1,2}[\\/]|\.\.$)/.test(candidate) || /[\\/]\.\.(?:[\\/]|$)/.test(candidate)
      const path = normalizeWindowsPath(absolute ? candidate : `${cwd}\\${candidate}`)
      if (path) paths.push(path)
      if (
        absolute &&
        (!path ||
          /^[a-z]:[\\/]*$/i.test(candidate) ||
          !roots.some((root) => root && isWithinPath(path, root)))
      )
        reasons.push('outside-command-path')
      if (relative && (!path || !isWithinPath(path, base))) reasons.push('parent-path-escape')
      if (
        /^[a-z]:$/i.test(candidate) ||
        (/^[\\/]/.test(candidate) && !absolute && !/^\/[a-z]$/i.test(candidate))
      )
        reasons.push('ambiguous-command-path')
    }
    if (['move-item', 'mv', 'move'].includes(executable)) {
      const at = lower.findIndex((s) => s === '-destination' || s === '-dest')
      const destination = at >= 0 ? args[at + 1] : args.filter((s) => !/^[-/]/.test(s)).at(-1)
      const target =
        destination &&
        normalizeWindowsPath(/^[a-z]:[\\/]/i.test(destination) ? destination : `${cwd}\\${destination}`)
      if (!target || !roots.some((root) => root && isWithinPath(target, root)))
        reasons.push('move-outside-scope')
    }
  }
  return { reasons: [...new Set(reasons)], paths: [...new Set(paths)], protectedPattern }
}
