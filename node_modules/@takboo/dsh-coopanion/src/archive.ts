import type { Context } from '@deepseek-ai/cordis';

/**
 * Registry-global archive set from DSH's workspace service (`workspaceRegistry.archivedSessionIds`).
 * Read without a type dependency on the workspace package; a missing or failing service means none.
 */
export function archivedSessionIds(ctx: Context): readonly string[] {
  try {
    const registry = (ctx.get as (name: string) => unknown)('workspaceRegistry') as { archivedSessionIds?: unknown } | undefined;
    const ids = registry?.archivedSessionIds;
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}
