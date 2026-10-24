export interface CommandWord {
  value: string
  raw: string
  quoted: boolean
}

/** Read literal words and shell boundaries; never evaluate substitutions or expressions. */
export function parseCommandText(line: string) {
  const segments: CommandWord[][] = [],
    reasons: string[] = [],
    brackets: string[] = []
  let words: CommandWord[] = [],
    value = '',
    raw = '',
    quote = '',
    quoted = false
  const flush = () => {
    if (raw) words.push({ value, raw, quoted })
    value = ''
    raw = ''
    quoted = false
  }
  const boundary = () => {
    flush()
    if (words.length) segments.push(words)
    words = []
  }
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!,
      next = line[i + 1]
    if (quote) {
      raw += c
      if (c === quote) {
        if (next === quote) {
          value += c
          raw += line[++i]
        } else quote = ''
      } else if (c === '`' && quote === '"' && next !== undefined) {
        raw += line[++i]
        if (next !== '\n') value += next
      } else if (c === '\\' && quote === '"' && next === '"') {
        reasons.push('unparsed-command')
        value += next
        raw += line[++i]
      } else value += c
    } else if (c === '"' || c === "'") {
      quote = c
      quoted = true
      raw += c
    } else if (c === '`' || c === '^') {
      raw += c
      if (next === undefined) reasons.push('unparsed-command')
      else {
        raw += line[++i]
        if (next !== '\n') value += next
      }
      if (c === '^') reasons.push('unparsed-command')
    } else if (c === '\\' && next !== undefined && /[\s"';&|]/.test(next)) {
      reasons.push('unparsed-command')
      value += c
      raw += c
    } else if (c === '&' && /[<>]/.test(line[i - 1] ?? '') && /[\d-]/.test(next ?? '')) {
      // A literal descriptor redirect (2>&1, >&2, <&-) does not start another command.
      value += c
      raw += c
    } else if (c === '&' && next !== '&' && !raw && !words.length) {
      words.push({ value: '&', raw: '&', quoted: false })
    } else if (';&|\r\n(){}'.includes(c)) {
      if (c === '(' && !raw && !words.length) reasons.push('dynamic-invocation')
      boundary()
      if (c === '(' || c === '{') brackets.push(c)
      if ((c === ')' || c === '}') && brackets.pop() !== (c === ')' ? '(' : '{'))
        reasons.push('unparsed-command')
      if ((c === '&' || c === '|') && next === c) i++
    } else if (/\s|[,<>]/.test(c)) flush()
    else {
      value += c
      raw += c
    }
  }
  boundary()
  if (quote || brackets.length || !segments.length || /[&|<>]\s*$|^\s*(?:\||&&)/.test(line))
    reasons.push('unparsed-command')
  return { segments, reasons }
}
