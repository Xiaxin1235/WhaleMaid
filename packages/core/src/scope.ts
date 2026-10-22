import type { Result, ScopeHasher } from './infra.js'
import { ActionIntentSchema } from './model/action.js'
import type { ActionIntent } from './model/action.js'
import { AuthorizationScopeSchema, ScopeContentSchema, ScopeHashSchema } from './model/authorization.js'
import type { AuthorizationScope, ScopeContent } from './model/authorization.js'
import { readOnlyCommandPaths } from './read-only-command.js'
import { isWithinPath, normalizeWindowsPath } from './windows-path.js'

export type ScopeHashError = { code: 'invalid-scope-content' | 'invalid-scope-path' }

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

function sortedSet(values: readonly string[]): string[] {
  return [...new Set(values)].sort()
}

function normalizeProtection(path: string): string | null {
  if (/[\\/]\.env\*$/i.test(path)) {
    const prefix = normalizeWindowsPath(path.slice(0, -1))
    return prefix === null ? null : prefix + '*'
  }
  return normalizeWindowsPath(path)
}

/** Canonicalize scope fields, path aliases and set ordering, excluding the stored hash itself. */
export function canonicalScopeContent(scope: ScopeContent): Result<string, ScopeHashError> {
  const content = Object.fromEntries(Object.entries(scope).filter(([key]) => key !== 'hash'))
  const parsed = ScopeContentSchema.safeParse(content)
  if (!parsed.success) return { ok: false, error: { code: 'invalid-scope-content' } }
  const allowedPaths = parsed.data.allowedPaths.map(normalizeWindowsPath)
  const protectedPaths = parsed.data.protectedPaths.map(normalizeProtection)
  if (allowedPaths.some((path) => path === null) || protectedPaths.some((path) => path === null)) {
    return { ok: false, error: { code: 'invalid-scope-path' } }
  }
  return {
    ok: true,
    value: stableJson({
      ...parsed.data,
      allowedPaths: sortedSet(allowedPaths as string[]),
      protectedPaths: sortedSet(protectedPaths as string[]),
      protectedNames: sortedSet(parsed.data.protectedNames.map((name) => name.toLowerCase())),
      allowedActions: sortedSet(parsed.data.allowedActions),
      forbiddenActions: sortedSet(parsed.data.forbiddenActions),
      verifyCommands: sortedSet(parsed.data.verifyCommands),
    }),
  }
}

/** Hash canonical scope content through a host-provided SHA-256 implementation. */
export function hashScope(scope: ScopeContent, deps: ScopeHasher): Result<string, ScopeHashError> {
  const canonical = canonicalScopeContent(scope)
  if (!canonical.ok) return canonical
  // An invalid injected digest is a programming error at the adapter boundary.
  return { ok: true, value: ScopeHashSchema.parse(deps.hash(canonical.value)) }
}

/** Check a host-resolved absolute Windows path; the host must realpath both policy roots and targets first. */
export function isPathAllowed(scope: AuthorizationScope, absPath: string): boolean {
  if (scope.status !== 'active') return false
  const path = normalizeWindowsPath(absPath)
  if (path === null) return false
  if (
    scope.protectedNames.some((pattern) => {
      const expression = new RegExp(
        '^' +
          pattern
            .split('*')
            .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join('.*') +
          '$',
        'i',
      )
      return path
        .slice(3)
        .split('\\')
        .some((part) => expression.test(part))
    })
  )
    return false
  const allowed = scope.allowedPaths.map(normalizeWindowsPath)
  const protectedRoots = scope.protectedPaths.map(normalizeProtection)
  if (allowed.some((root) => root === null) || protectedRoots.some((root) => root === null)) return false
  if (
    protectedRoots.some(
      (root) =>
        root !== null && (root.endsWith('*') ? path.startsWith(root.slice(0, -1)) : isWithinPath(path, root)),
    )
  )
    return false
  return allowed.some((root) => root !== null && isWithinPath(path, root))
}

export interface CommandClass {
  class: 'safe' | 'needs-approval' | 'forbidden'
  reasons: string[]
}

const LOCAL_TEST_COMMAND = /^(?:pnpm|npm)\s+(?:test|run\s+(?:test|build|lint|typecheck))(?:\s+--run)?$/i

/** Classify known hazards; only a small literal allowlist is safe and all unknown shell syntax asks. */
export function classifyCommand(cmdline: string): CommandClass {
  const line = cmdline.trim()
  if (line.length === 0 || [...line].some((char) => char.charCodeAt(0) < 32 && !'\t\r\n'.includes(char))) {
    return { class: 'forbidden', reasons: ['invalid-command'] }
  }
  const reasons: string[] = []
  const forbidden: string[] = []
  if (/\bgit(?:\.exe)?\b[\s\S]*\breset\b[\s\S]*--hard\b/i.test(line)) forbidden.push('git-reset-hard')
  if (
    /\b(?:rm|rmdir)(?:\.exe)?\s+[^;&|\r\n]*(?:-[a-z]*r[a-z]*\b|--recursive\b)/i.test(line) ||
    /\b(?:Remove-Item|ri|del|erase)\s+[^;&|\r\n]*-(?:recurse|rec|r)(?:\b|:)/i.test(line) ||
    /\b(?:rd|rmdir)\s+[^;&|\r\n]*\/s\b/i.test(line)
  )
    forbidden.push('recursive-delete')
  if (
    /\breg(?:\.exe)?\s+(?:add|delete|import|load|unload|restore)\b/i.test(line) ||
    /\b(?:Set|New|Remove|Clear)-ItemProperty\b/i.test(line) ||
    /\b(?:Set|New|Remove)-Item\b[^\r\n]*(?:HKLM:|HKCU:|Registry::)/i.test(line) ||
    /\b(?:netsh|bcdedit|Set-ExecutionPolicy|Set-Service|Stop-Service|New-Service|Set-NetFirewallProfile|Set-MpPreference)\b/i.test(
      line,
    ) ||
    /\bsc(?:\.exe)?\s+(?:config|create|delete|stop)\b/i.test(line)
  )
    forbidden.push('system-configuration')
  if (/\bgit(?:\.exe)?\b[\s\S]*\bpush\b/i.test(line)) reasons.push('git-push')
  if (/\b(?:npm|pnpm|yarn)(?:\.cmd)?\s+(?:--\S+\s+)*publish\b/i.test(line)) reasons.push('package-publish')
  if (
    /\b(?:npm|pnpm|yarn)(?:\.cmd)?\s+(?:--\S+\s+)*(?:i|install|add|ci)\b/i.test(line) ||
    /\b(?:pip[23]?|python(?:3|\.exe)?\s+-m\s+pip)\s+install\b/i.test(line) ||
    /\b(?:winget|choco)(?:\.exe)?\b/i.test(line)
  )
    reasons.push('package-install')
  if (
    /\b(?:scp|sftp|rsync)(?:\.exe)?\b/i.test(line) ||
    /\bcurl(?:\.exe)?\b[^\r\n]*(?:\s-(?:T|d|F)\b|--(?:upload-file|data(?:-\w+)?|form|json)\b|(?:-X|--request)\s*["']?(?:PUT|POST|PATCH|DELETE)\b)/i.test(
      line,
    ) ||
    /\b(?:Invoke-WebRequest|Invoke-RestMethod|iwr|irm)\b[^\r\n]*-Method\s+["']?(?:Put|Post|Patch|Delete)\b/i.test(
      line,
    )
  )
    reasons.push('network-upload')
  if (forbidden.length > 0) return { class: 'forbidden', reasons: [...forbidden, ...reasons] }
  if (reasons.length > 0) return { class: 'needs-approval', reasons }
  // No shell composition, interpolation, redirection, control blocks, glob expansion or dynamic invocation is automatic.
  if (/[;&|<>$`\r\n(){}*?]/.test(line))
    return { class: 'needs-approval', reasons: ['compound-or-dynamic-command'] }
  if ('paths' in readOnlyCommandPaths(line, 'C:/') || LOCAL_TEST_COMMAND.test(line))
    return { class: 'safe', reasons: [] }
  return { class: 'needs-approval', reasons: ['unrecognized-command'] }
}

export interface GateDecision {
  decision: 'allow' | 'ask' | 'deny'
  reason: string
  ruleId: string
}

function decision(value: GateDecision['decision'], ruleId: string, reason: string): GateDecision {
  return { decision: value, ruleId, reason }
}

/** Apply immutable authorization constraints; an approval request never changes or enlarges the scope. */
export function checkAction(scope: AuthorizationScope, action: ActionIntent): GateDecision {
  const parsedScope = AuthorizationScopeSchema.safeParse(scope)
  const parsedAction = ActionIntentSchema.safeParse(action)
  if (!parsedScope.success || !parsedAction.success)
    return decision('deny', 'invalid-input', 'Invalid scope or action')
  scope = parsedScope.data
  action = parsedAction.data
  if (scope.status === 'revoked') return decision('deny', 'scope-revoked', 'Authorization has been revoked')
  if (scope.status !== 'active') return decision('deny', 'scope-inactive', 'Authorization is not active')
  if (scope.forbiddenActions.includes(action.type))
    return decision('deny', 'action-forbidden', 'Action is explicitly forbidden')
  if ('goalId' in action && action.goalId !== scope.goalId)
    return decision('deny', 'goal-mismatch', 'Action targets another goal')
  if (action.type === 'expand-scope')
    return decision('ask', 'ui-only-scope-expansion', 'Only the user can confirm scope expansion in the UI')
  if (!scope.allowedActions.includes(action.type))
    return decision('deny', 'action-not-authorized', 'Action is outside the granted authorization')

  switch (action.type) {
    case 'read-file':
    case 'write-file':
      if (action.type === 'write-file' && scope.permissionPreset === 'read-only') {
        return decision('deny', 'read-only-preset', 'The permission preset does not allow writes')
      }
      return isPathAllowed(scope, action.path)
        ? decision('allow', 'path-allowed', 'Resolved path is within the authorized boundaries')
        : decision('deny', 'path-outside-scope', 'Path is outside allowed roots or is protected/ambiguous')
    case 'run-command': {
      if (!isPathAllowed(scope, action.cwd))
        return decision('deny', 'path-outside-scope', 'Command working directory is not authorized')
      const command = classifyCommand(action.cmdline)
      if (command.class === 'forbidden')
        return decision('deny', 'command-forbidden', command.reasons.join(', '))
      const read = readOnlyCommandPaths(action.cmdline, action.cwd)
      if ('paths' in read && read.paths.some((path) => !isPathAllowed(scope, path)))
        return decision('deny', 'path-outside-scope', 'Read command target is outside authorization')
      if (scope.permissionPreset === 'read-only' && !('paths' in read)) {
        return decision('deny', 'read-only-preset', 'Command is not a known read-only operation')
      }
      if (command.class === 'needs-approval')
        return decision('ask', 'command-approval', command.reasons.join(', '))
      if ('paths' in read)
        return decision('allow', 'read-command-allowed', 'Known read-only command in authorized directory')
      if (!scope.verifyCommands.includes(action.cmdline))
        return decision('ask', 'command-not-confirmed', 'Exact command has not been confirmed by the user')
      return decision('allow', 'command-allowed', 'Exact command and working directory are authorized')
    }
    case 'git': {
      const cmdline = `git ${action.subcommand} ${action.args.join(' ')}`.trim()
      const command = classifyCommand(cmdline)
      if (command.class === 'forbidden')
        return decision('deny', 'command-forbidden', command.reasons.join(', '))
      if (scope.permissionPreset === 'read-only' && !('paths' in readOnlyCommandPaths(cmdline, 'C:/'))) {
        return decision('deny', 'read-only-preset', 'Git operation is not known to be read-only')
      }
      // This intent carries no cwd: a host adapter must bind a concrete worktree before execution.
      return decision(
        'ask',
        'git-worktree-binding-required',
        'Git requires a verified worktree and command binding',
      )
    }
    case 'spawn-subagent':
      return decision(
        'deny',
        'subagent-isolation-required',
        'Delegation requires an independently constrained child runtime',
      )
    case 'network':
      if (!/^https?:\/\//i.test(action.url))
        return decision('deny', 'network-protocol', 'Only HTTP(S) network proposals are supported')
      if (scope.permissionPreset === 'read-only' && !/^(GET|HEAD|OPTIONS)$/i.test(action.method)) {
        return decision(
          'deny',
          'read-only-preset',
          'Network mutation is not authorized by a read-only preset',
        )
      }
      return decision(
        'ask',
        'network-approval',
        'Network destinations and transfers require explicit confirmation',
      )
    case 'continue-goal':
    case 'pause-goal':
    case 'resume-goal':
      return decision('allow', 'goal-control-allowed', 'Goal control is within the granted authorization')
    case 'rollback-to-checkpoint':
      if (scope.permissionPreset === 'read-only')
        return decision('deny', 'read-only-preset', 'Rollback requires write permission')
      return decision(
        'ask',
        'checkpoint-binding-required',
        'Confirm checkpoint ownership and current user changes before rollback',
      )
    case 'reply-to-session':
      return decision(
        'ask',
        'session-binding-required',
        'The host must establish session ownership and interpret replies only within existing authorization',
      )
    case 'open-workbench':
      return action.sessionId === undefined
        ? decision('allow', 'workbench-allowed', 'Opening the workbench is authorized')
        : decision(
            'ask',
            'session-binding-required',
            'The host must establish ownership of the target session',
          )
  }
}
