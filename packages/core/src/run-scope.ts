import { AuthorizationScopeSchema } from './model/authorization.js'
import type { AuthorizationScope } from './model/authorization.js'
import type { TaskKind } from './model/common.js'
import { normalizeWindowsPath, isWithinPath } from './windows-path.js'
export const RunScopeSchema = AuthorizationScopeSchema.safeExtend({
  originScopeId: AuthorizationScopeSchema.shape.id,
  originScopeHash: AuthorizationScopeSchema.shape.hash,
})
export type RunScope = AuthorizationScope & {
  originScopeId: AuthorizationScope['id']
  originScopeHash: string
}
/** Project-relative remapping never carries authorization to an external directory. Hash remains the origin digest, not a signature for derived fields. */
export function deriveRunScope(
  scope: AuthorizationScope,
  projectRoot: string,
  worktreeRoot: string,
  kind: TaskKind = 'edit',
): RunScope {
  const project = normalizeWindowsPath(projectRoot),
    worktree = normalizeWindowsPath(worktreeRoot)
  if (!project || !worktree) throw new Error('invalid-run-root')
  const rewrite = (paths: string[]) =>
    paths.flatMap((path) => {
      const wildcard = path.endsWith('\\.env*') || path.endsWith('/.env*')
      const normalized = normalizeWindowsPath(wildcard ? path.slice(0, -1) : path)
      return normalized && isWithinPath(normalized, project)
        ? [worktree + normalized.slice(project.length) + (wildcard ? '*' : '')]
        : []
    })
  const readonly = kind === 'analyze' || kind === 'research'
  return {
    ...scope,
    allowedPaths: rewrite(scope.allowedPaths),
    protectedPaths: rewrite(scope.protectedPaths),
    protectedNames: [...scope.protectedNames],
    permissionPreset: readonly ? 'read-only' : scope.permissionPreset,
    commandMode: readonly ? 'confirmed' : scope.commandMode,
    allowedActions: scope.allowedActions.filter((action) => !readonly || action !== 'write-file'),
    originScopeId: scope.id,
    originScopeHash: scope.hash,
  }
}
/** Remove audit-only fields before feeding a derived scope to strict authorization validation. */
export function authorizationOfRun(scope: RunScope): AuthorizationScope {
  return AuthorizationScopeSchema.parse(
    Object.fromEntries(
      Object.entries(scope).filter(([key]) => key !== 'originScopeId' && key !== 'originScopeHash'),
    ),
  )
}
