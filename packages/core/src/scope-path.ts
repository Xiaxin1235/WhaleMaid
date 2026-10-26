import { normalizeWindowsPath } from './windows-path.js'

/** DOS rules remain unchanged. POSIX roots retain case and never accept shell expansion or Windows aliases. */
export function normalizeScopePath(path: string): string | null {
  const windows = normalizeWindowsPath(path)
  if (windows) return windows
  if (
    !path.startsWith('/') ||
    path.startsWith('//') ||
    /[\\*?]/.test(path) ||
    [...path].some((c) => c.charCodeAt(0) < 32)
  )
    return null
  const parts: string[] = []
  for (const part of path.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (!parts.length) return null
      parts.pop()
    } else parts.push(part)
  }
  return '/' + parts.join('/')
}

export const scopePathSeparator = (normalized: string): '/' | '\\' =>
  normalized.startsWith('/') ? '/' : '\\'

/** Compare normalized roots at directory boundaries, preserving POSIX case sensitivity. */
export function isWithinScopePath(path: string, root: string): boolean {
  const separator = scopePathSeparator(root)
  return (
    scopePathSeparator(path) === separator &&
    (path === root || path.startsWith(root.endsWith(separator) ? root : root + separator))
  )
}

/** Resolve one literal tool path in the cwd's own path dialect; reject mixed or expanding forms. */
export function resolveScopePath(cwd: string, path: string): string | null {
  const base = normalizeScopePath(cwd)
  if (!base) return null
  if (base.startsWith('/')) {
    if (/^~|^[a-z]:|\\/i.test(path)) return null
    return normalizeScopePath(path.startsWith('/') ? path : base + '/' + path)
  }
  if (/^[a-z]:[\\/]/i.test(path)) return normalizeWindowsPath(path)
  if (/^[\\/]|^[a-z]:/i.test(path)) return null
  return normalizeWindowsPath(base + '\\' + path)
}
