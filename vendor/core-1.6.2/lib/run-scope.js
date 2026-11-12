import { AuthorizationScopeSchema } from './model/authorization.js';
import { normalizeScopePath, isWithinScopePath } from './scope-path.js';
export const RunScopeSchema = AuthorizationScopeSchema.safeExtend({
    originScopeId: AuthorizationScopeSchema.shape.id,
    originScopeHash: AuthorizationScopeSchema.shape.hash,
});
/** Project-relative remapping never carries authorization to an external directory. Hash remains the origin digest, not a signature for derived fields. */
export function deriveRunScope(scope, projectRoot, worktreeRoot, kind = 'edit') {
    const project = normalizeScopePath(projectRoot), worktree = normalizeScopePath(worktreeRoot);
    if (!project || !worktree || project.startsWith('/') !== worktree.startsWith('/'))
        throw new Error('invalid-run-root');
    const rewrite = (paths) => paths.flatMap((path) => {
        const wildcard = path.endsWith('\\.env*') || path.endsWith('/.env*');
        const normalized = normalizeScopePath(wildcard ? path.slice(0, -1) : path);
        return normalized && isWithinScopePath(normalized, project)
            ? [worktree + normalized.slice(project.length) + (wildcard ? '*' : '')]
            : [];
    });
    const readonly = kind === 'analyze' || kind === 'research';
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
    };
}
/** Remove audit-only fields before feeding a derived scope to strict authorization validation. */
export function authorizationOfRun(scope) {
    return AuthorizationScopeSchema.parse(Object.fromEntries(Object.entries(scope).filter(([key]) => key !== 'originScopeId' && key !== 'originScopeHash')));
}
//# sourceMappingURL=run-scope.js.map