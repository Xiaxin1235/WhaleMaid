// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, vi } from 'vitest';
import { ApprovalCards, cardPollSchema } from '../src/approval-cards.ts';
import { ApprovalClient } from '../src/client/approval-client.ts';
import { approvalAnswer } from '../web/approval-contract.js';
import type { NotificationSnapshot } from '../src/notification-contract.ts';

const card = { key: 'local-key', sessionId: 'session', callId: 'call', toolName: 'bash', reason: 'Delete the fictional file', appearedAt: 1 };
function host() {
  let now = 100, enabled = true;
  const value: NotificationSnapshot = { protocol: 1, runtime: { phase: 'running', generation: 1, visibilityRevision: 1, visible: true, suspended: false }, interactions: [{ id: 'interaction', nativeId: 'native', callId: 'call', sessionId: 'session', kind: 'approval', turn: 1, seq: 1, createdAt: 1, preview: 'fallback', state: 'open', dueAt: null, automaticReminders: 0 }] };
  const bridge = new ApprovalCards(() => enabled, () => value, vi.fn(), () => now);
  const poll = (clientId = 'client', cards = [card], receipts: unknown[] = []) => bridge.poll({ clientId, cards, receipts });
  const submit = (answer = 'reject') => bridge.submit({ type: 'approval-answer', interactionId: 'interaction', generation: 1, requestId: 'pet-request', answer });
  return { bridge, value, poll, submit, time: (n: number) => { now = n; }, disable: () => { enabled = false; }, snapshot: () => bridge.snapshot(value) };
}
function client() {
  let enabled = true;
  const answer = vi.fn(async (_value: unknown) => {});
  const pending = { ...card, kind: 'approval', answerable: true, reason: 'audit', displayReason: { en: 'Localized\u0000 reason\nnext' }, answer };
  const status = new Map([['session', { pendingInteraction: pending }]]);
  const service = new ApprovalClient({ clientId: 'client', status: () => status as never, enabled: () => enabled, subscribe: () => () => {}, resolve: value => value.en, poll: vi.fn() });
  const command = { clientId: 'client', key: 'local-key', requestId: 'command', outcome: 'allowed-once' as const };
  return { service, status, pending, answer, command, disable: () => { enabled = false; } };
}
describe('Harness approval card bridge', () => {
  it('uses localized readable copy, strips controls, and never transmits parameters', () => {
    const c = client(); Object.assign(c.pending, { arguments: { token: 'secret' } });
    expect(c.service.cards()).toEqual([{ ...card, reason: 'Localized reason next', appearedAt: expect.any(Number) }]);
    c.pending.answerable = false; expect(c.service.cards()).toEqual([]);
    c.status.set('session', { pendingInteraction: { kind: 'question' } } as never); expect(c.service.cards()).toEqual([]);
    expect(cardPollSchema.safeParse({ clientId: 'c', cards: [{ ...card, arguments: {} }], receipts: [] }).success).toBe(false);
  });
  it('calls only the exact live public card once, including repeated command delivery', async () => {
    const c = client(); await c.service.answer(c.command); await c.service.answer(c.command);
    expect(c.answer).toHaveBeenCalledExactlyOnceWith('allowed-once');
  });
  it.each(['wrong-client', 'missing', 'answered', 'invalid', 'disabled'])('refuses %s commands', async kind => {
    const c = client();
    if (kind === 'wrong-client') c.command.clientId = 'someone-else';
    if (kind === 'missing') c.status.clear();
    if (kind === 'answered') c.pending.answerable = false;
    if (kind === 'invalid') c.command.outcome = 'always' as never;
    if (kind === 'disabled') c.disable();
    await c.service.answer(c.command); expect(c.answer).not.toHaveBeenCalled();
    if (kind === 'disabled') expect(c.service.cards()).toEqual([]);
  });
  it('expires clients after five seconds and retains the Harness-only fallback', () => {
    const h = host(); h.poll(); expect(h.snapshot().interactions[0].approvalAnswerable).toBe(true);
    h.time(5100); h.bridge.expire(); expect(h.snapshot().interactions[0]).toMatchObject({ approvalAnswerable: false, preview: 'fallback' });
  });
  it('deduplicates by session/call and routes to the latest reporting client', async () => {
    const h = host(); h.poll('old'); h.time(101); h.poll('new', [{ ...card, key: 'new-key' }]);
    expect(h.snapshot().interactions).toHaveLength(1);
    const pending = h.submit('allow-once');
    expect(h.poll('old').commands).toEqual([]);
    const command = h.poll('new', [{ ...card, key: 'new-key' }]).commands[0];
    expect(command).toMatchObject({ clientId: 'new', key: 'new-key', outcome: 'allowed-once' });
    expect(await h.submit()).toMatchObject({ code: 'approval/duplicate' });
    h.poll('new', [], [{ requestId: command.requestId, key: command.key, ok: true }]);
    expect(await pending).toMatchObject({ status: 'accepted', answer: 'allow-once' });
  });
  it('does not accept receipts from another client or key, or route to a different call', async () => {
    const h = host(); h.poll(); const pending = h.submit();
    const command = h.poll().commands[0];
    h.poll('other', [], [{ requestId: command.requestId, key: command.key, ok: true }]);
    h.poll('client', [card], [{ requestId: command.requestId, key: 'wrong', ok: true }]);
    expect(h.poll().commands).toHaveLength(1);
    h.poll('client', [], [{ requestId: command.requestId, key: command.key, ok: false, code: 'approval/missing' }]);
    expect(await pending).toMatchObject({ status: 'failed', code: 'approval/missing' });
    h.poll('client', [{ ...card, callId: 'different' }]); expect(await h.submit()).toMatchObject({ code: 'approval/offline' });
  });
  it('rejects disabled/stale/invalid replies without issuing commands', async () => {
    const h = host(); expect(approvalAnswer({ type: 'approval-answer', interactionId: 'i', generation: 1, requestId: 'p', answer: 'always' })).toBeUndefined();
    h.poll(); h.disable(); expect(await h.submit()).toMatchObject({ code: 'approval/disabled' });
    expect(h.poll().commands).toEqual([]); expect(h.snapshot().interactions[0].approvalAnswerable).toBe(false);
    const fresh = host(); fresh.poll(); fresh.value.interactions[0].state = 'settled'; expect(await fresh.submit()).toMatchObject({ code: 'approval/stale' });
  });
  it('times out unacknowledged commands and stops on disposal', async () => {
    vi.useFakeTimers();
    try { const h = host(); h.poll(); const promise = h.submit(); await vi.advanceTimersByTimeAsync(5000); expect(await promise).toMatchObject({ code: 'approval/timeout' });
      const other = h.submit(); h.bridge.dispose(); expect(await other).toMatchObject({ code: 'approval/unavailable' });
    } finally { vi.useRealTimers(); }
  });
});
