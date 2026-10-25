import { createElement as h, useEffect, useState } from 'react'
import { z } from 'zod'
import { archiveCopy } from '@whaledot/core'
import type { Locale } from '@whaledot/core'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import { PANEL_CHANNEL, PANEL_PREFIX } from '../panel-api/contract.js'
const View = z.object({
  enabled: z.boolean(),
  available: z.boolean(),
  items: z.array(z.object({ id: z.string(), createdAt: z.number() })),
})
/** Owner-only reversible archive controls, independent of companion tools and ordinary conversations. */
export function CompanionArchivesView({
  connection,
  locale,
}: {
  connection: ConnectionHandle
  locale: Locale
}) {
  const c = archiveCopy(locale),
    [data, setData] = useState<z.infer<typeof View>>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const call = async (method: string, input: unknown) => {
    const result = await connection.rpc.call(PANEL_CHANNEL, `${PANEL_PREFIX}/${method}`, input)
    if (!result.ok) throw result.error
    return result.value
  }
  useEffect(() => {
    let live = true
    const load = () => {
      void call('companion-archives', {})
        .then((value) => {
          if (live) setData(View.parse(value))
        })
        .catch(() => {
          if (live) setError(c.unavailable)
        })
    }
    load()
    const timer = setInterval(load, 2000)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [connection, locale])
  const run = async (method: string, input: unknown) => {
    setBusy(true)
    setError('')
    try {
      const result = await call(method, input)
      if (method === 'companion-restore' && z.object({ failed: z.number() }).parse(result).failed)
        throw Error(c.unavailable)
      setData(View.parse(await call('companion-archives', {})))
    } catch {
      setError(c.unavailable)
    } finally {
      setBusy(false)
    }
  }
  const restore = (id?: string) => {
    if (window.confirm(c.confirm)) void run('companion-restore', { confirm: true, ...(id ? { id } : {}) })
  }
  return h(
    'section',
    { 'data-companion-archives': true },
    h(
      'label',
      null,
      h('input', {
        type: 'checkbox',
        checked: data?.enabled ?? true,
        disabled: busy,
        onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
          void run('companion-archive-settings', { enabled: event.target.checked }),
      }),
      c.enabled,
    ),
    h('p', null, c.count(data?.items.length ?? 0)),
    h('p', null, c.hint),
    ((data && !data.available) || error) && h('p', { role: 'status' }, error || c.unavailable),
    h('button', { disabled: busy || !data?.items.length, onClick: () => restore() }, c.restoreAll),
    ...(data?.items ?? []).map((item) =>
      h(
        'article',
        { key: item.id, 'data-archived-session': item.id },
        h(
          'small',
          null,
          `${new Date(item.createdAt).toISOString().slice(0, 16).replace('T', ' ')} UTC · ${item.id}`,
        ),
        h('button', { disabled: busy, onClick: () => restore(item.id) }, c.restore),
      ),
    ),
  )
}
