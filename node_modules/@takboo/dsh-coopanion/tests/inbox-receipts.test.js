// SPDX-License-Identifier: AGPL-3.0-or-later
import { it, expect } from 'vitest';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { InboxReceipts, continuedInboxKey } from '../web/inbox-receipts.js';
import { SessionAttention, inboxContents } from '../web/session-ui.js';
import { PetModel } from '../src/model.ts';
import { NotificationBroker } from '../src/notification-broker.ts';
const { InboxStore } = createRequire(import.meta.url)('../desktop/inbox-store.cjs');
const issue = seq => JSON.stringify(['same-session', 'issue', 'error', 1, seq]);

it('serializes atomic receipts, survives restart, bounds 1000 and expires after 30 days', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'inbox-store-')); let now = 100000;
  try {
    const store = new InboxStore(dir, () => now); await store.load();
    await Promise.all(Array.from({ length: 1002 }, (_, n) => store.remember(issue(n))));
    expect(store.keys()).toHaveLength(1000); expect(store.keys()).not.toContain(issue(1));
    const restarted = new InboxStore(dir, () => now); expect(await restarted.load()).toEqual(store.keys());
    expect(await readdir(dir)).toEqual(['inbox-receipts-v1.json']);
    now += 30 * 86400000; expect(restarted.keys()).toEqual([]);
    expect(await restarted.remember(issue(2000))).toBe(true);
    expect(JSON.parse(await readFile(restarted.file, 'utf8')).entries).toHaveLength(1);
  } finally { await rm(dir, { recursive: true, force: true }); }
  // 1002 serialized atomic writes exceed the default 5s when the suite runs in parallel.
}, 20000);
it('drops malformed saves and keys, then writes a fresh archive', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'inbox-corrupt-'));
  try {
    for (const data of ['{', JSON.stringify({ schema: 1, entries: [{ key: 'arbitrary', at: 1 }] })]) {
      const store = new InboxStore(dir); await writeFile(store.file, data); expect(await store.load()).toEqual([]);
      expect(await store.remember('arbitrary')).toBe(false); expect(await store.remember(issue(1))).toBe(true);
      expect(await new InboxStore(dir).load()).toEqual([issue(1)]);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

it('restores six categories without settling requests, and new events still enter the inbox', () => {
  const kinds = ['reply', 'error', 'blocked', 'continued', 'open', 'approval'];
  const histories = new Map(kinds.map(kind => {
    const events = [{ type: 'turn/start', data: { turn: 1 }, seq: 0, time: 1 }];
    if (kind === 'reply') events.push({ type: 'assistant/message', data: { turn: 1, message: { content: [{ type: 'text', text: 'Reply' }] } }, seq: 1, time: 2 });
    if (['continued', 'open'].includes(kind)) events.push({ type: 'tool/call', data: { turn: 1, name: 'ask_user_question', callId: kind, arguments: '{}' }, seq: 1, time: 2 });
    if (kind === 'approval') events.push({ type: 'approval/asked', data: { id: 'approval', toolName: 'fixture' }, seq: 1, time: 2 });
    if (!['open', 'approval'].includes(kind)) events.push({ type: 'turn/end', data: { turn: 1, reason: { kind: ['error', 'blocked'].includes(kind) ? kind : 'completed' } }, seq: 2, time: 3 });
    return [kind, { id: kind, header: { id: kind, createdAt: 1 }, snapshotEvents: () => events }];
  }));
  function restore() {
    const model = new PetModel(), broker = new NotificationBroker();
    for (const [kind, session] of histories) { model.restore(session); broker.restore(session, ['continued', 'open'].includes(kind) ? { active: [{ callId: kind, state: kind, questions: [{ question: 'Question' }] }] } : undefined); }
    model.interactions(broker.snapshot().interactions); return { model, broker };
  }
  const first = restore(), receipts = new InboxReceipts(), attention = new SessionAttention(receipts);
  const initial = first.model.snapshot(), requests = first.broker.snapshot().interactions;
  expect(initial.results.every(r => r.read)).toBe(true);
  for (const kind of ['error', 'blocked']) expect(attention.acknowledge(initial, requests, kind)).toBe(true);
  for (const item of requests) receipts.remember(continuedInboxKey(item));
  const restarted = restore(), loaded = new InboxReceipts(); loaded.load([...receipts.keys]);
  const state = restarted.broker.snapshot(), projected = new SessionAttention(loaded).project(restarted.model.snapshot(), state.interactions);
  const inbox = inboxContents(projected, state.interactions.filter(item => !loaded.hides(item)));
  expect(inbox.issues).toEqual([]); expect(inbox.replies).toEqual([]);
  expect(inbox.requests.map(r => r.sessionId).sort()).toEqual(['approval', 'open']);
  expect(state.interactions).toHaveLength(3);
  const session = histories.get('error');
  restarted.model.consume(session, { type: 'turn/start', seq: 3, time: 4, data: { turn: 2 } });
  restarted.model.consume(session, { type: 'turn/end', seq: 4, time: 5, data: { turn: 2, reason: { kind: 'error' } } });
  expect(inboxContents(new SessionAttention(loaded).project(restarted.model.snapshot(), state.interactions), state.interactions.filter(r => !loaded.hides(r))).issues.map(s => s.id)).toContain('error');
  expect(loaded.hides({ ...requests.find(r => r.kind === 'question'), state: 'continued', nativeId: 'new-call' })).toBe(false);
  first.broker.dispose(); restarted.broker.dispose();
});
