// SPDX-License-Identifier: AGPL-3.0-or-later
/** Exact durable event identities, without titles, text or presentation revisions. */
export function validInboxKey(key) {
  if (typeof key !== 'string' || key.length > 8192) return false;
  try {
    const parts = JSON.parse(key), text = value => typeof value === 'string' && value.length > 0 && value.length <= 2048;
    return Array.isArray(parts) && text(parts[0]) && JSON.stringify(parts) === key &&
      (parts.length === 3 && parts[1] === 'continued' && text(parts[2]) || parts.length === 5 && parts[1] === 'issue' &&
        ['error', 'blocked', 'max-tokens', 'interrupted', 'stopped'].includes(parts[2]) && parts.slice(3).every(n => Number.isSafeInteger(n) && n >= 0));
  } catch { return false; }
}
export const continuedInboxKey = item => item?.kind === 'question' && item.state === 'continued' ? JSON.stringify([item.sessionId, 'continued', item.nativeId]) : undefined;
export class InboxReceipts {
  constructor(save = () => {}) { this.keys = new Set(); this.save = save; }
  load(keys) { for (const key of keys ?? []) if (validInboxKey(key)) this.keys.add(key); }
  remember(key) {
    if (!validInboxKey(key) || this.keys.has(key)) return;
    this.keys.add(key); if (this.keys.size > 1000) this.keys.delete(this.keys.values().next().value);
    this.save(key);
  }
  hides(item) { const key = continuedInboxKey(item); return key !== undefined && this.keys.has(key); }
}
