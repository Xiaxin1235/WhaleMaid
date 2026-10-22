/** Normalize an absolute DOS path without consulting the filesystem; reject ambiguous Windows aliases. */
export function normalizeWindowsPath(path: string): string | null {
  const normalized = path.replaceAll('/', '\\')
  if (
    !/^[a-z]:\\/i.test(normalized) ||
    /[<>"|?*]/.test(normalized) ||
    [...normalized].some((char) => char.charCodeAt(0) < 32)
  )
    return null
  const parts: string[] = []
  for (const part of normalized.slice(3).split('\\')) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      if (parts.length === 0) return null
      parts.pop()
      continue
    }
    // Trailing dots/spaces, device names and alternate data streams alias other Windows resources.
    if (
      /[. ]$/.test(part) ||
      part.includes(':') ||
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)
    ) {
      return null
    }
    parts.push(part.toLowerCase())
  }
  return `${normalized.slice(0, 2).toLowerCase()}\\${parts.join('\\')}`
}

/** Compare normalized paths at a directory boundary, including a volume root. */
export function isWithinPath(path: string, root: string): boolean {
  return path === root || path.startsWith(root.endsWith('\\') ? root : `${root}\\`)
}
