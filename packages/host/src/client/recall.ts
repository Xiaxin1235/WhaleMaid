import { createElement as h, useEffect, useState } from 'react'
import { z } from 'zod'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import { CompanionJournalSchema, recallCopy } from '@whalemaid/core'
import type { Locale } from '@whalemaid/core'
import { PANEL_CHANNEL, PANEL_PREFIX } from '../panel-api/contract.js'

const View = z.object({
  settings: z.object({ enabled: z.boolean(), summarize: z.boolean() }),
  items: z.array(CompanionJournalSchema),
  calls7d: z.number(),
  characters: z.number(),
})
/** Owner-only journal controls, separate from the confirmation workflow for durable memories. */
export function Recall({ connection, locale }: { connection: ConnectionHandle; locale: Locale }) {
  const c = recallCopy(locale),
    [data, setData] = useState<z.infer<typeof View>>(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const call = async (method: string, input: unknown) => {
    const r = await connection.rpc.call(PANEL_CHANNEL, `${PANEL_PREFIX}/${method}`, input)
    if (!r.ok) throw r.error
    return r.value
  }
  useEffect(() => {
    let live = true
    const load = () => {
      void call('recall-list', {})
        .then((v) => {
          if (live) setData(View.parse(v))
        })
        .catch((e) => {
          if (live) setError(String(e.message ?? e))
        })
    }
    load()
    const timer = setInterval(load, 2000)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [connection])
  const run = async (method: string, input: unknown) => {
    setBusy(true)
    setError('')
    try {
      await call(method, input)
      setData(View.parse(await call('recall-list', {})))
    } catch (e) {
      setError(String((e as { message?: string }).message ?? e))
    } finally {
      setBusy(false)
    }
  }
  return h(
    'section',
    { 'data-whaledot-recall': true },
    ...(['enabled', 'summarize'] as const).map((key) =>
      h(
        'label',
        { key, style: { display: 'block' } },
        h('input', {
          type: 'checkbox',
          checked: data?.settings[key] ?? true,
          disabled: busy,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
            void run('recall-settings', { [key]: e.target.checked }),
        }),
        c[key],
      ),
    ),
    h('p', null, `${c.calls}: ${data?.calls7d ?? 0} · ${c.characters}: ${data?.characters ?? 0}`),
    error && h('p', { role: 'alert' }, error),
    ...(['conversation', 'experience'] as const).map((kind) =>
      h(
        'section',
        { key: kind, 'data-recall-kind': kind },
        h('h3', null, c[kind]),
        ...(data?.items ?? [])
          .filter((r) => r.kind === kind)
          .map((row) =>
            h(
              'article',
              { key: row.id, 'data-journal-id': row.id },
              h('small', null, new Date(row.createdAt).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'),
              h('p', null, row.text),
              h(
                'button',
                { disabled: busy, onClick: () => void run('recall-delete', { id: row.id }) },
                c.remove,
              ),
            ),
          ),
      ),
    ),
    h(
      'button',
      {
        disabled: busy,
        onClick: () => {
          if (window.confirm(c.confirmClear)) void run('recall-clear', { confirm: true })
        },
      },
      c.clear,
    ),
  )
}
