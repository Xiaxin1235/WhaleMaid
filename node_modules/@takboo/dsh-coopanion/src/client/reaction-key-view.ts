// SPDX-License-Identifier: AGPL-3.0-or-later
export interface ReactionKeyInfo { configured: boolean; source?: string; writable: boolean; }
export type ReactionKeyView = 'loading' | 'missing' | 'harness' | 'env' | 'env-file';

/** Map a credential description to what the settings card shows; any non-writable configured source is read-only. */
export function reactionKeyView(info?: ReactionKeyInfo): ReactionKeyView {
  if (!info) return 'loading';
  if (!info.configured) return 'missing';
  if (info.writable) return 'harness';
  return info.source === 'project-env' || info.source === 'user-env' ? 'env-file' : 'env';
}
