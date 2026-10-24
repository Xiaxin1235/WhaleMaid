import type { AuthorizationScope } from './model/authorization.js'
import { normalizeWindowsPath, isWithinPath } from './windows-path.js'
import { parseCommandText } from './trusted-command-parser.js'
import type { CommandWord } from './trusted-command-parser.js'

/** Intersection of simple globs, so visible shell globs cannot bypass protected names. */
function overlap(a: string, b: string): boolean {
  // A single star cannot cross a directory separator; globstar can.
  const left = a.match(/\*\*|./gu) ?? [],
    right = b.match(/\*\*|./gu) ?? []
  const repeat = (token: string | undefined) => token === '*' || token === '**'
  const wildcard = (token: string) => repeat(token) || token === '?'
  const compatible = (x: string, y: string) =>
    (wildcard(x) && wildcard(y)) ||
    (wildcard(x) ? y !== '\\' || x === '**' : wildcard(y) ? x !== '\\' || y === '**' : x === y)
  const queue: [number, number][] = [[0, 0]],
    seen = new Set<string>()
  while (queue.length) {
    const [i, j] = queue.pop()!,
      key = `${i}:${j}`
    if (seen.has(key)) continue
    seen.add(key)
    if (i === left.length && j === right.length) return true
    if (repeat(left[i])) queue.push([i + 1, j])
    if (repeat(right[j])) queue.push([i, j + 1])
    if (left[i] === '**' && left[i + 1] === '\\') queue.push([i + 2, j])
    if (right[j] === '**' && right[j + 1] === '\\') queue.push([i, j + 2])
    if (i < left.length && j < right.length && compatible(left[i]!, right[j]!))
      queue.push([repeat(left[i]) ? i : i + 1, repeat(right[j]) ? j : j + 1])
  }
  return false
}

const MAX_WRAPPER_DEPTH = 8
interface Inspection {
  reasons: string[]
  paths: string[]
  protectedPattern: boolean
}
type LegacyReasons = (line: string) => readonly string[]
const empty = (): Inspection => ({ reasons: [], paths: [], protectedPattern: false })
const unresolved = (word: string) => /^~|%[^%]+%|\$(?:env:|HOME\b|\{|\(|[a-z_]\w*)/i.test(word)
const programName = (word: string) =>
  word
    .replaceAll('\\', '/')
    .split('/')
    .at(-1)!
    .replace(/\.(?:exe|cmd|bat|ps1)$/i, '')
    .toLowerCase()
const parameter = (word: string, name: string) => {
  const flag = word.toLowerCase().split(':')[0]!
  return flag.startsWith('-') && flag.length > 1 && `-${name}`.startsWith(flag)
}
function merge(target: Inspection, other: Inspection) {
  target.reasons.push(...other.reasons)
  target.paths.push(...other.paths)
  target.protectedPattern ||= other.protectedPattern
}
function inspectPaths(words: CommandWord[], cwd: string, scope: AuthorizationScope): Inspection {
  const result = empty(),
    base = normalizeWindowsPath(cwd)!
  const roots = scope.allowedPaths.map(normalizeWindowsPath)
  const target = words[0]?.value === '&' || words[0]?.value === '.' ? words[1] : words[0]
  const executable = programName(target?.value ?? '')
  const commandOptions =
    executable === 'schtasks'
      ? ['query', 'create', 'change', 'delete', 'run', 'tn', 'tr']
      : executable === 'taskkill'
        ? ['im', 'pid', 'fi']
        : []
  for (const word of words) {
    const candidate = word.value.replace(/^[-/][\w-]+[=:]/, '')
    if (unresolved(candidate)) {
      result.reasons.push('unresolved-command-path')
      continue
    }
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
        result.protectedPattern ||=
          pattern
            .split('\\')
            .slice(1)
            .some((part) => scope.protectedNames.some((name) => overlap(part, name.toLowerCase()))) ||
          scope.protectedPaths.some((root) => {
            const value = root.replaceAll('/', '\\').toLowerCase()
            return overlap(pattern, value) || overlap(pattern, `${value}\\**`)
          })
      }
    }
    const absolute = /^[a-z]:[\\/]/i.test(candidate) || /^\\\\|^\/\//.test(candidate)
    const relative = /^(?:\.{1,2}[\\/]|\.\.$)/.test(candidate) || /[\\/]\.\.(?:[\\/]|$)/.test(candidate)
    const path = normalizeWindowsPath(absolute ? candidate : `${cwd}\\${candidate}`)
    if (path) result.paths.push(path)
    if (
      absolute &&
      (!path || /^[a-z]:[\\/]*$/i.test(candidate) || !roots.some((root) => root && isWithinPath(path, root)))
    )
      result.reasons.push('outside-command-path')
    if (relative && (!path || !isWithinPath(path, base))) result.reasons.push('parent-path-escape')
    const slashOption =
      /^\/(?:[a-z]|mir|purge|wait|min|max|grant(?::r)?|deny|remove(?::[gd])?|setowner|reset|verify|save|restore)(?::.*)?$/i.test(
        candidate,
      )
    if (
      /^[a-z]:$/i.test(candidate) ||
      (/^[\\/]/.test(candidate) &&
        !absolute &&
        !slashOption &&
        !commandOptions.includes(candidate.slice(1).toLowerCase()))
    )
      result.reasons.push('ambiguous-command-path')
  }
  return result
}
/** Textual best effort only. Unresolved execution and paths ask; script bodies stay opaque. */
export function inspectTrustedCommand(
  line: string,
  cwd: string,
  scope: AuthorizationScope,
  legacy?: LegacyReasons,
): Inspection {
  const inspectScript = (script: string, depth: number, literalAllowed = false): Inspection => {
    if (depth > MAX_WRAPPER_DEPTH) return { ...empty(), reasons: ['unparsed-command'] }
    const parsed = parseCommandText(script),
      result = empty()
    result.reasons.push(...parsed.reasons)
    if (/\$[({]/.test(script)) result.reasons.push('unresolved-command-path')
    for (const segment of parsed.segments) merge(result, inspectWords(segment, depth, literalAllowed))
    return result
  }
  const inspectWords = (input: CommandWord[], depth: number, literalAllowed = false): Inspection => {
    if (depth > MAX_WRAPPER_DEPTH || !input.length) return { ...empty(), reasons: ['unparsed-command'] }
    let words = input
    let invocationOperator = false
    const targetWord = input[0]!.value === '&' || input[0]!.value === '.' ? input[1] : input[0]
    const result = inspectPaths(
      input.filter(
        (word, i) =>
          !(
            targetWord &&
            programName(targetWord.value) === 'start-process' &&
            input[i - 1]?.value.toLowerCase() === '-argumentlist' &&
            word.quoted
          ),
      ),
      cwd,
      scope,
    )
    if (words[0]!.value === '&' || words[0]!.value === '.') {
      invocationOperator = true
      words = words.slice(1)
      if (!words.length || unresolved(words[0]!.value) || /^(?:\$|\(|@|\[)/.test(words[0]!.value)) {
        result.reasons.push('dynamic-invocation')
        return result
      }
    }
    const first = words[0]!,
      executable = programName(first.value),
      args = words.slice(1),
      lower = args.map((word) => word.value.toLowerCase())
    if (unresolved(first.value) || /^[($@]/.test(first.value)) {
      result.reasons.push('dynamic-invocation')
      return result
    }
    const method = /^\[[\s\S]+\]::([a-z_]\w*)$/i.exec(first.value)?.[1]?.toLowerCase()
    if (method) {
      result.reasons.push(
        ['delete', 'move', 'replace'].includes(method)
          ? 'delete'
          : /^(?:writeall|copy$)/.test(method)
            ? 'write-outside-check'
            : 'dynamic-execution',
      )
      return result
    }
    if (first.value.startsWith('[')) {
      result.reasons.push('dynamic-invocation')
      return result
    }
    // A standalone quoted literal produces text; a quoted executable with spaces needs a literal path.
    if (
      literalAllowed &&
      !invocationOperator &&
      first.quoted &&
      words.length === 1 &&
      !/[\\/]/.test(first.value)
    )
      return result
    if (!first.value || (/[\s=]/.test(first.value) && !/^[a-z]:[\\/]/i.test(first.value))) {
      result.reasons.push(invocationOperator ? 'dynamic-invocation' : 'unparsed-command')
      return result
    }
    if (
      (!/[\\/]/.test(first.value) && !/^[\p{L}\p{N}_][\p{L}\p{N}_.+@-]*$/u.test(first.value)) ||
      /^[+-]?\d+(?:\.\d+)?(?:[+*-]\d+)*$/.test(first.value)
    ) {
      result.reasons.push('dynamic-invocation')
      return result
    }
    if (legacy)
      result.reasons.push(
        ...legacy(words.map((word) => word.value).join(' ')).filter(
          (reason) => !['unrecognized-command', 'compound-or-dynamic-command'].includes(reason),
        ),
      )
    const nested = (tail: CommandWord[]) => inspectWords(tail, depth + 1)
    const payload = (tail: CommandWord[]) => {
      if (tail.length === 1 && tail[0]!.quoted) return inspectScript(tail[0]!.value, depth + 1)
      if (tail[0]?.quoted && /\s/.test(tail[0].value) && !/^[a-z]:[\\/]/i.test(tail[0].value))
        return inspectScript(tail.map((word) => word.value).join(' '), depth + 1)
      return nested(tail)
    }
    const unparsed = () => {
      result.reasons.push('unparsed-command')
    }
    const packageTail = (start: number) => {
      let at = start
      while (at < args.length && args[at]!.value.startsWith('-')) {
        const value = lower[at]!
        if (value === '--') {
          at++
          break
        }
        if (
          ['-y', '--yes', '--no', '--no-install', '--ignore-existing', '--quiet', '-q'].includes(value) ||
          value.startsWith('--package=')
        )
          at++
        else if (['-p', '--package'].includes(value) && args[at + 1] && !args[at + 1]!.value.startsWith('-'))
          at += 2
        else {
          unparsed()
          return
        }
      }
      merge(result, nested(args.slice(at)))
    }
    if (['npx', 'bunx'].includes(executable)) {
      packageTail(0)
      return result
    }
    if (['pnpm', 'npm', 'yarn'].includes(executable)) {
      if (/^(?:--?\S+\s+)*(?:uninstall|remove|rm|un)(?:\s|$)/.test(lower.join(' ')))
        result.reasons.push('package-install')
      if (['exec', 'dlx'].includes(lower[0] ?? '')) {
        packageTail(1)
        return result
      }
      if (lower.some((word) => word === 'exec' || word === 'dlx')) {
        unparsed()
        return result
      }
    }
    if (executable === 'env') {
      let at = 0
      while (at < args.length) {
        const value = args[at]!.value
        if (value === '--') {
          at++
          break
        }
        if (
          /^[a-z_]\w*=/i.test(value) ||
          ['-i', '--ignore-environment'].includes(value) ||
          value.startsWith('--unset=')
        )
          at++
        else if (['-u', '--unset'].includes(value) && args[at + 1]) at += 2
        else if (value.startsWith('-')) {
          unparsed()
          return result
        } else break
      }
      merge(result, nested(args.slice(at)))
      return result
    }
    if (executable === 'call') {
      if (args[0]?.value.startsWith(':')) unparsed()
      else merge(result, nested(args))
      return result
    }
    if (executable === 'start') {
      let at = args[0]?.quoted ? 1 : 0
      while (['/b', '/wait', '/min', '/max'].includes(lower[at] ?? '')) at++
      if (args[at]?.value.startsWith('/')) unparsed()
      else merge(result, nested(args.slice(at)))
      return result
    }
    if (executable === 'start-process') {
      let file: CommandWord | undefined,
        argumentsSeen = false
      const argumentList: CommandWord[] = []
      for (let i = 0; i < args.length; i++) {
        const word = args[i]!,
          value = lower[i]!
        if (value === '-filepath' && !file && args[i + 1]) file = args[++i]
        else if (value === '-argumentlist' && !argumentsSeen) {
          argumentsSeen = true
          while (args[i + 1] && !(!args[i + 1]!.quoted && args[i + 1]!.value.startsWith('-')))
            argumentList.push(args[++i]!)
          if (!argumentList.length) unparsed()
        } else if (['-wait', '-nonewwindow', '-passthru'].includes(value)) continue
        else if (!word.value.startsWith('-') && !file) file = word
        else {
          unparsed()
          return result
        }
      }
      if (!file) unparsed()
      else if (unresolved(file.value)) result.reasons.push('dynamic-invocation')
      else
        merge(
          result,
          inspectScript(`${file.raw} ${argumentList.map((word) => word.value).join(' ')}`, depth + 1),
        )
      return result
    }
    if (executable === 'cmd') {
      const at = lower.findIndex((word) => word === '/c' || word === '/k')
      if (at < 0 || lower.slice(0, at).some((word) => !['/s', '/d', '/q'].includes(word))) {
        result.reasons.push('dynamic-execution')
        unparsed()
      } else {
        const child = payload(args.slice(at + 1))
        if (child.reasons.length) result.reasons.push('dynamic-execution')
        merge(result, child)
      }
      return result
    }
    if (executable === 'forfiles') {
      let body: CommandWord | undefined
      for (let i = 0; i < args.length; i++) {
        const flag = lower[i]!
        if (['/c', '-c'].includes(flag) && !body && args[i + 1]) body = args[++i]
        else if (
          ['/m', '-m', '/p', '-p', '/d', '-d'].includes(flag) &&
          args[i + 1] &&
          !/^[-/][a-z]$/i.test(args[i + 1]!.value)
        )
          i++
        else if (!['/s', '-s'].includes(flag)) unparsed()
      }
      if (body) merge(result, inspectScript(body.value, depth + 1))
      else unparsed()
      return result
    }
    if (['powershell', 'pwsh'].includes(executable)) {
      const commandAt = lower.findIndex((word) => parameter(word, 'command'))
      const encoded = lower.some((word) => parameter(word, 'encodedcommand'))
      const fileAt = lower.findIndex((word) => parameter(word, 'file'))
      if (commandAt >= 0 || encoded) {
        result.reasons.push('dynamic-execution')
        if (commandAt >= 0) merge(result, payload(args.slice(commandAt + 1)))
      } else if (fileAt >= 0) {
        const file = args[fileAt + 1]?.value
        const target =
          file &&
          !unresolved(file) &&
          normalizeWindowsPath(/^[a-z]:[\\/]/i.test(file) ? file : `${cwd}\\${file}`)
        if (
          !target ||
          !scope.allowedPaths.some((root) => {
            const path = normalizeWindowsPath(root)
            return path && isWithinPath(target, path)
          })
        )
          result.reasons.push('dynamic-execution')
      } else if (!lower.some((word) => ['--version', '-version', '-v', '-help', '-h', '-?'].includes(word)))
        result.reasons.push('dynamic-execution')
    }
    if (['bash', 'sh', 'zsh', 'wsl', 'busybox'].includes(executable)) {
      result.reasons.push('dynamic-execution')
      if (lower[0] === '-c') merge(result, payload(args.slice(1)))
      else if (executable === 'wsl' || executable === 'busybox') merge(result, nested(args))
    }
    if (
      ['invoke-expression', 'iex', 'invoke-command', 'icm', 'add-type'].includes(executable) ||
      (executable === 'node' && lower.some((word) => /^-[ep]+$|^--(?:eval|print)(?:=|$)/.test(word))) ||
      (executable === 'deno' && lower[0] === 'eval') ||
      (/^(?:python(?:[23](?:\.\d+)?)?|py)$/.test(executable) && lower.includes('-c')) ||
      (['perl', 'ruby'].includes(executable) && lower.includes('-e'))
    )
      result.reasons.push('dynamic-execution')
    if (
      [
        'format',
        'diskpart',
        'fsutil',
        'bcdedit',
        'vssadmin',
        'wbadmin',
        'takeown',
        'rundll32',
        'regsvr32',
        'shutdown',
        'restart-computer',
        'stop-computer',
        'register-scheduledtask',
        'unregister-scheduledtask',
        'mshta',
      ].includes(executable) ||
      (executable === 'schtasks' && lower.some((word) => /^\/(?:create|change|delete|run)$/.test(word))) ||
      (executable === 'wmic' && lower.some((word) => ['call', 'create', 'set', 'delete'].includes(word))) ||
      (executable === 'cipher' && lower.some((word) => /^\/w(?::|$)/.test(word))) ||
      (executable === 'icacls' &&
        lower.some((word) => /^\/(?:grant|deny|remove|setowner|reset)(?::|$)/.test(word)))
    )
      result.reasons.push('system-configuration')
    if (['taskkill', 'stop-process', 'kill', 'spps', 'tskill'].includes(executable))
      result.reasons.push('process-control')
    const deletion = executable.replace(/@[^@]+$/, '')
    if (
      [
        'rm',
        'del',
        'erase',
        'remove-item',
        'ri',
        'rmdir',
        'rd',
        'rimraf',
        'del-cli',
        'trash',
        'trash-cli',
        'clear-content',
        'clear-item',
        'clc',
        'cli',
      ].includes(deletion) ||
      (executable === 'shx' && lower.find((word) => !word.startsWith('-')) === 'rm') ||
      (executable === 'robocopy' && lower.some((word) => /^\/(?:mir|purge)$/.test(word)))
    )
      result.reasons.push('delete')
    if (['del', 'erase', 'rd', 'rmdir'].includes(executable) && lower.includes('/s'))
      result.reasons.push('recursive-delete')
    if (executable === 'git') {
      const sub = lower.find((word) =>
        ['clean', 'rm', 'checkout', 'restore', 'stash', 'branch', 'switch'].includes(word),
      )
      if (
        sub === 'clean' ||
        sub === 'rm' ||
        (sub === 'checkout' &&
          (lower.includes('.') ||
            lower.includes('-f') ||
            lower.includes('--force') ||
            (lower.indexOf('--') >= 0 && lower.indexOf('--') < lower.length - 1))) ||
        (sub === 'switch' && lower.some((word) => ['-f', '--force', '--discard-changes'].includes(word))) ||
        (sub === 'restore' &&
          (!lower.includes('--staged') ||
            lower.includes('--worktree') ||
            args.some((word) => word.value === '-W'))) ||
        (sub === 'stash' && lower.some((word) => word === 'drop' || word === 'clear')) ||
        (sub === 'branch' && args.some((word) => word.value === '-D'))
      )
        result.reasons.push('repository-delete')
    }
    if (['move-item', 'mv', 'move'].includes(executable)) {
      const at = lower.findIndex((word) => word === '-destination' || word === '-dest')
      const destination =
        at >= 0 ? args[at + 1]?.value : args.filter((word) => !/^[-/]/.test(word.value)).at(-1)?.value
      const target =
        destination &&
        !unresolved(destination) &&
        normalizeWindowsPath(/^[a-z]:[\\/]/i.test(destination) ? destination : `${cwd}\\${destination}`)
      if (
        !target ||
        !scope.allowedPaths.some((root) => {
          const path = normalizeWindowsPath(root)
          return path && isWithinPath(target, path)
        })
      )
        result.reasons.push('move-outside-scope')
    }
    return result
  }
  const result = inspectScript(line, 0, true)
  return { ...result, reasons: [...new Set(result.reasons)], paths: [...new Set(result.paths)] }
}
