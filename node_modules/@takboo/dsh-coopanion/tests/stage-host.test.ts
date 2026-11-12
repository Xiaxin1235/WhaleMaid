import type { HostConnectionHandle, PeerScope } from '@deepseek-ai/dsh-client-connection';
import { expect, test, vi } from 'vitest';
import { StagePresence, stageRoutes } from '../src/stage-host.ts';

const endpoint = 'http://harness.test/api/coopanion/stage/1';
const peerSignal = new AbortController().signal;
const owner = { principal: { kind: 'owner' }, signal: peerSignal } as unknown as PeerScope;
const viewer = { principal: { kind: 'viewer' }, signal: peerSignal } as unknown as PeerScope;
const connection: Pick<HostConnectionHandle, 'admit' | 'operator'> = {
  operator: owner,
  admit(request) {
    const access = request.headers instanceof Headers ? request.headers.get('authorization') : request.headers.authorization;
    return access ? { peer: access === 'owner' ? owner : viewer } : { rejection: 401 };
  },
};

test('only owners can receive the sandboxed document or acquire a lease', async () => {
  const transition = vi.fn();
  const load = vi.fn(async () => 'console.log("stage")');
  const presence = new StagePresence(transition);
  const [stage, away] = stageRoutes(connection, presence, load);
  expect((await stage!.fetch(new Request(endpoint))).status).toBe(401);
  expect((await stage!.fetch(new Request(endpoint, { headers: { authorization: 'viewer' } }))).status).toBe(403);
  expect((await away!.fetch(new Request(endpoint + '/away', { method: 'POST', headers: { authorization: 'viewer' } }))).status).toBe(403);
  expect(load).not.toHaveBeenCalled();
  expect(transition).not.toHaveBeenCalled();
  const response = await stage!.fetch(new Request(endpoint, { headers: { authorization: 'owner' } }));
  expect(response.status).toBe(200);
  expect(response.headers.get('content-security-policy')).toContain("sandbox allow-scripts; default-src 'none'");
  expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'self'");
  expect(response.headers.get('content-security-policy')).toContain("connect-src 'none'");
  expect(await response.text()).toContain('console.log("stage")');
  expect(load).toHaveBeenCalledOnce();
});

test('first stream sends away once and last disconnect or cancellation sends back', async () => {
  const transition = vi.fn();
  const presence = new StagePresence(transition);
  const a = new AbortController(), b = new AbortController();
  const first = presence.open(a.signal).body!.getReader();
  const second = presence.open(b.signal).body!.getReader();
  expect(new TextDecoder().decode((await first.read()).value)).toBe('data: stage/1\n\n');
  expect(transition.mock.calls).toEqual([[true]]);
  a.abort();
  expect(await first.read()).toMatchObject({ done: true });
  expect(transition.mock.calls).toEqual([[true]]);
  await second.cancel();
  b.abort();
  expect(transition.mock.calls).toEqual([[true], [false]]);
});

test('plugin shutdown closes all leases and a new host starts with none', async () => {
  const transition = vi.fn();
  const presence = new StagePresence(transition);
  const signal = new AbortController().signal;
  const first = presence.open(signal).body!.getReader();
  const second = presence.open(signal).body!.getReader();
  await first.read();
  await second.read();
  presence.close();
  expect(await first.read()).toMatchObject({ done: true });
  expect(await second.read()).toMatchObject({ done: true });
  expect(transition.mock.calls).toEqual([[true], [false]]);
  expect(presence.open(signal).status).toBe(503);
  const fresh = vi.fn();
  const restarted = new StagePresence(fresh);
  expect(fresh).not.toHaveBeenCalled();
  restarted.close();
});
