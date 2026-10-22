import { createServer } from 'node:http'
import { Context } from '@deepseek-ai/cordis'
import { apply as applyConnection } from '@deepseek-ai/dsh-client-connection'
import { expect, test, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createPanelRoute } from './index.js'
import { snapshot } from '../../tests/panel-fixture.js'

test('real DSH Connection refuses unauthenticated HTTP before dispatch; its signed cookie admits owner', async () => {
  const ctx = new Context()
  const routes = new Map<string, (req: IncomingMessage, res: ServerResponse) => Promise<void>>()
  ctx.provide('credentials', {
    async modifyRecord(_key: unknown, update: (record: undefined) => Promise<unknown>) {
      return update(undefined)
    },
  })
  ctx.provide('webServer', {
    host: '127.0.0.1',
    protocol: 'http:',
    register(route: { path: string; handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> }) {
      routes.set(route.path, route.handler)
      return () => {
        routes.delete(route.path)
      }
    },
  })
  const read = vi.fn(() => snapshot),
    write = vi.fn()
  const server = createServer((req, res) => {
    void routes.get('/api')!(req, res)
  })
  try {
    await applyConnection(ctx)
    for (const method of ['status', 'set-paused', 'revoke-scope'] as const) {
      ctx.connection.fetch.register(
        createPanelRoute(
          method,
          { snapshot: read, setLanguage: write, goals: () => [], setPaused: write, revokeScope: write },
          (request) => ctx.connection.admit(request),
        ),
      )
    }
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address() as { port: number }
    const base = `http://127.0.0.1:${address.port}`
    const request = (cookie?: string, origin?: string, method = 'status', payload: unknown = {}) =>
      fetch(`${base}/api/whaledot/${method}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(cookie ? { cookie } : {}),
          ...(origin ? { origin } : {}),
        },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: 'test',
          method: `whaledot/${method}`,
          payload,
        }),
      })
    const denied = await request()
    expect(denied.status).toBe(401)
    expect(await denied.text()).toBe('unauthorized')
    expect((await request(undefined, undefined, 'set-paused', { paused: true })).status).toBe(401)
    expect((await request(undefined, undefined, 'revoke-scope', { scopeId: 'scope_1' })).status).toBe(401)
    expect(read).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()
    let headers: Readonly<Record<string, string>> = {}
    ctx.connection.authorizeIndex(
      {
        method: 'GET',
        url: ctx.connection.authenticatedUrl(`${base}/`),
        headers: { host: `127.0.0.1:${address.port}` },
      },
      {
        writeHead(_status, next) {
          headers = next ?? {}
          return this
        },
        end() {},
      },
    )
    const cookie = headers['set-cookie']?.split(';')[0]
    expect(cookie).toBeTruthy()
    const accepted = await request(cookie)
    expect(accepted.status).toBe(200)
    expect(await accepted.json()).toMatchObject({ result: { ok: true, value: snapshot } })
    expect((await request(cookie, 'http://untrusted.invalid')).status).toBe(403)
    expect(
      await (await request(cookie, undefined, 'set-paused', { paused: true, extra: 1 })).json(),
    ).toMatchObject({
      result: { ok: false, error: { code: 'whaledot/invalid-input' } },
    })
    expect(write).not.toHaveBeenCalled()
    expect(await (await request(cookie, undefined, 'set-paused', { paused: true })).json()).toMatchObject({
      result: { ok: true, value: { paused: true } },
    })
    expect(write).toHaveBeenCalledWith(true)
    expect(
      await (await request(cookie, undefined, 'revoke-scope', { scopeId: 'scope_1' })).json(),
    ).toMatchObject({
      result: { ok: true, value: { scopeId: 'scope_1' } },
    })
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await ctx.fiber.dispose()
  }
})
