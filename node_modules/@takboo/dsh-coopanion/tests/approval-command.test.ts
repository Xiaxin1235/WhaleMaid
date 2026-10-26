// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, it, vi } from 'vitest';
import type { SessionEvent } from '@deepseek-ai/dsh-session';
import { approvalCommand, approvalText } from '../src/approval-command.ts';
import { NotificationBroker } from '../src/notification-broker.ts';
import { ApprovalCards } from '../src/approval-cards.ts';
import type { NotificationSnapshot } from '../src/notification-contract.ts';

const call = (callId: string, args: unknown, name = 'pwsh') => ({ type: 'tool/call', seq: 2, time: 2, data: { turn: 1, step: 1, callId, name, arguments: typeof args === 'string' ? args : JSON.stringify(args) } }) as SessionEvent;
it('looks up the exact public call, exposes only bounded command/workdir, and restores the same safe data', () => {
  const events = [call('wrong', { command: 'wrong' }), call('exact', { command: 'Remove-Item victim.txt', workdir: '/fictional', description: 'PRIVATE DESCRIPTION', justification: 'PRIVATE JUSTIFICATION', timeout_ms: 9000, sandbox_permissions: 'danger-full-access' })];
  expect(approvalCommand('pwsh', 'exact', events)).toEqual({ kind: 'shell', command: 'Remove-Item victim.txt', workdir: '/fictional' });
  const source = { id: 'session', header: { cwd: '/fictional' }, snapshotEvents: () => events } as never;
  const asked = { type: 'approval/asked', seq: 3, time: 3, data: { id: 'native', toolName: 'pwsh', callId: 'exact', reason: 'test reason' } } as SessionEvent;
  const live = new NotificationBroker(); live.consume(source, asked);
  const text = JSON.stringify(live.snapshot());
  expect(text).toContain('Remove-Item victim.txt');
  for (const field of ['PRIVATE', 'description', 'justification', 'timeout_ms', 'sandbox_permissions']) expect(text).not.toContain(field);
  const restored = new NotificationBroker(); restored.restore({ ...source as object, snapshotEvents: () => [...events, asked] } as never);
  expect(restored.snapshot().interactions[0].approvalCommand).toEqual(live.snapshot().interactions[0].approvalCommand);
  live.dispose(); restored.dispose();
});
it.each(['missing-call', 'missing-command', 'bad-json', 'wrong-type', 'wrong-tool', 'empty', 'controls-only'])('fails closed for %s', kind => {
  const data = kind === 'bad-json' ? '{' : kind === 'missing-command' ? { description: 'no' } : kind === 'wrong-type' ? { command: [] } : kind === 'empty' ? { command: '   ' } : kind === 'controls-only' ? { command: '\u0000\u200b' } : { command: 'echo okay' };
  expect(approvalCommand('pwsh', kind === 'missing-call' ? undefined : 'c', [call('c', data, kind === 'wrong-tool' ? 'bash' : 'pwsh')])).toEqual({ kind: 'shell' });
});
it('keeps non-shell approvals as reason-only, and permits omitted workdir', () => {
  expect(approvalCommand('custom_tool', 'c', [call('c', { command: 'do not forward' }, 'custom_tool')])).toEqual({ kind: 'other' });
  expect(approvalCommand('bash', 'c', [call('c', { command: 'echo okay' }, 'bash')])).toEqual({ kind: 'shell', command: 'echo okay' });
});
it.each(['sk-test0000000000000000000000', 'sk-or-v1-test000000', 'ghp_fake123456789', 'gho_fake123456789', 'github_pat_fake123456789', 'AKIAIOSFODNN7EXAMPLE', 'Bearer fake.jwt.secret', 'xoxb-fake-123456789'])('redacts token format %s', token => {
  const text = approvalText(`echo ${token} > token.txt`); expect(text).not.toContain(token); expect(text).toContain('[REDACTED]');
});
it('redacts quoted/unquoted environment assignments, including whitespace and escaped segments', () => {
  const text = approvalText(`TOKEN=plainsecret run\nexport OTHER='two secret words'\n$env:KEY = "private value"\nESC=private\\ value run\nJOIN='first'"second"\nSUB=$(echo confidential)`);
  for (const word of ['plainsecret', 'secret words', 'private', 'first', 'second', 'confidential']) expect(text).not.toContain(word);
  expect(text.match(/\[REDACTED\]/g)).toHaveLength(6);
});
it('removes control and format characters before redaction, retaining normalized newlines', () => {
  expect(approvalText('echo\t one\u0000\r\ntwo\rthree\u007f\u202e')).toBe('echo  one\ntwo\nthree');
  expect(approvalText('echo sk-\u200btestsecret')).toBe('echo [REDACTED]');
});
it('redacts tab-separated Bearer credentials and incomplete quoted environment values', () => {
  expect(approvalText('curl -H "Authorization: Bearer\tfake.jwt.secret"')).not.toContain('fake.jwt.secret');
  expect(approvalText('TOKEN="unfinished private value')).toBe('TOKEN=[REDACTED]');
  expect(approvalText("TOKEN='unfinished private value")).toBe('TOKEN=[REDACTED]');
});
it('caps 12 lines and 500 characters with a marker after redaction', () => {
  expect(approvalText('a'.repeat(500))).toHaveLength(500);
  const long = approvalText('a'.repeat(501)); expect(long).toHaveLength(500); expect(long).toMatch(/…（已截断）$/);
  const lines = approvalText(Array.from({ length: 13 }, (_, i) => `line ${i}`).join('\n'));
  expect(lines.split('\n')).toHaveLength(12); expect(lines).toMatch(/…（已截断）$/);
  expect(approvalText('a'.repeat(490) + ' sk-test00000000000000000000')).not.toContain('sk-');
});
it('enforces the missing-command allowance gate in the Host while rejection keeps the same channel', async () => {
  const value: NotificationSnapshot = { protocol: 1, runtime: { phase: 'running', generation: 1, visibilityRevision: 1, visible: true, suspended: false }, interactions: [{ id: 'interaction', nativeId: 'native', callId: 'c', sessionId: 'session', kind: 'approval', approvalCommand: { kind: 'shell' }, turn: 1, seq: 1, createdAt: 1, preview: 'reason', state: 'open', dueAt: null, automaticReminders: 0 }] };
  const bridge = new ApprovalCards(() => true, () => value, vi.fn());
  const poll = (receipts: unknown[] = []) => bridge.poll({ clientId: 'client', cards: [{ key: 'key', sessionId: 'session', callId: 'c', toolName: 'pwsh', reason: 'reason', appearedAt: 1 }], receipts });
  poll(); const input = { type: 'approval-answer', interactionId: 'interaction', requestId: 'pet', generation: 1, answer: 'allow-once' };
  expect(await bridge.submit(input)).toMatchObject({ code: 'approval/command-unavailable' }); expect(poll().commands).toEqual([]);
  const rejection = bridge.submit({ ...input, answer: 'reject' }), command = poll().commands[0];
  expect(command.outcome).toBe('rejected'); poll([{ requestId: command.requestId, key: 'key', ok: true }]);
  expect(await rejection).toMatchObject({ status: 'accepted', answer: 'reject' }); bridge.dispose();
});
