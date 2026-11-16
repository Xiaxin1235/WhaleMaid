// SPDX-License-Identifier: AGPL-3.0-or-later
const { readFile, writeFile, rename, mkdir, rm } = require('node:fs/promises');
const { join } = require('node:path');
const { randomUUID } = require('node:crypto');
const { validInboxKey } = require('../web/inbox-receipts.js');
const MAX_AGE = 30 * 24 * 60 * 60 * 1000;
class InboxStore {
  constructor(directory, now = Date.now) { this.directory = directory; this.file = join(directory, 'inbox-receipts-v1.json'); this.now = now; this.entries = new Map(); this.queue = Promise.resolve(); this.pending = 0; }
  prune() {
    for (const [key, at] of this.entries) if (at <= this.now() - MAX_AGE || at > this.now()) this.entries.delete(key);
    while (this.entries.size > 1000) this.entries.delete(this.entries.keys().next().value);
  }
  keys() { this.prune(); return [...this.entries.keys()]; }
  async load() {
    try {
      const raw = await readFile(this.file, 'utf8'); if (raw.length > 8 * 1024 * 1024) throw new Error('oversized');
      const data = JSON.parse(raw);
      if (data?.schema !== 1 || Object.keys(data).length !== 2 || !Array.isArray(data.entries) || data.entries.length > 1000 || data.entries.some(e => !e || Object.keys(e).length !== 2 || !validInboxKey(e.key) || !Number.isSafeInteger(e.at) || e.at < 0)) throw new Error('invalid');
      this.entries = new Map(data.entries.map(e => [e.key, e.at])); this.prune();
    } catch { this.entries.clear(); }
    return this.keys();
  }
  remember(key) {
    if (!validInboxKey(key)) return Promise.resolve(false);
    this.pending++;
    const operation = this.queue.then(async () => {
      const previous = new Map(this.entries);
      this.entries.delete(key); this.entries.set(key, this.now()); this.prune();
      const temporary = `${this.file}.${randomUUID()}.tmp`;
      try {
        await mkdir(this.directory, { recursive: true });
        await writeFile(temporary, JSON.stringify({ schema: 1, entries: [...this.entries].map(([key, at]) => ({ key, at })) }), { flag: 'wx', mode: 0o600 });
        await rename(temporary, this.file); return true;
      } catch { this.entries = previous; return false; }
      finally { await rm(temporary, { force: true }).catch(() => {}); }
    });
    this.queue = operation.then(() => { this.pending--; }, () => { this.pending--; });
    return operation;
  }
  flush() { return this.queue; }
}
module.exports = { InboxStore };
