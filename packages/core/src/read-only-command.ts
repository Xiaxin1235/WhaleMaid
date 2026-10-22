import { normalizeWindowsPath } from './windows-path.js'

/** Parse the small, literal read-only shell grammar; ambiguity never confers read permission. */
export function readOnlyCommandPaths(
  cmdline: string,
  cwd: string,
): { paths: string[] } | { unparsable: true } {
  const invalid = { unparsable: true } as const
  const line = cmdline.trim()
  if (/[;&|<>$`\r\n(){}*?%!^,]/.test(line) || [...line].some((c) => c.charCodeAt(0) < 32 && c !== '\t'))
    return invalid
  if (
    /^(?:git(?:\.exe)?\s+(?:status(?:\s+--short)?|diff\s+--(?:stat|name-only)|log\s+--oneline)|(?:pwd|Get-Location|Get-Date)(?:\.exe)?)$/i.test(
      line,
    )
  )
    return { paths: [] }
  const tokens = line.match(/"[^"\r\n]*"|'[^'\r\n]*'|[^\s"']+/g)
  if (!tokens || tokens.join(' ').replace(/\s+/g, ' ') !== line.replace(/\s+/g, ' ')) return invalid
  const command = tokens.shift()!
  const listing = /^(?:Get-ChildItem|ls|dir)(?:\.exe)?$/i.test(command)
  if (!listing && !/^(?:Get-Content|cat|type)(?:\.exe)?$/i.test(command)) return invalid
  if (/^-(?:LiteralPath|Path)$/i.test(tokens[0] ?? '')) tokens.shift()
  if (tokens.length > 1 || (!listing && tokens.length !== 1)) return invalid
  const literal = (tokens[0] ?? '.').replace(/^(['"])(.*)\1$/, '$2')
  if (!literal || /^-/.test(literal)) return invalid
  const absolute = /^[a-z]:[\\/]/i.test(literal)
    ? normalizeWindowsPath(literal)
    : /^[\\/]|^[a-z]:/i.test(literal)
      ? null
      : normalizeWindowsPath(cwd + '\\' + literal)
  return absolute ? { paths: [absolute] } : invalid
}
