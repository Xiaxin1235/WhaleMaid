import { createElement as h, useEffect, useState } from 'react'
import { z } from 'zod'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import { MemorySchema, memoryCopy, memoryScopeKey } from '@whaledot/core'
import type { Locale, Memory } from '@whaledot/core'
import { PANEL_CHANNEL, PANEL_PREFIX } from '../panel-api/contract.js'

const ListSchema = z.object({
  memories: z.array(MemorySchema.extend({ stale: z.boolean() })),
  characters: z.number(),
  estimatedTokens: z.number(),
  calls7d: z.number(),
})
/** All editing actions come from the authenticated owner connection; no model confirmation flag exists. */
export function Memories({ connection, locale }: { connection: ConnectionHandle; locale: Locale }) {
  const c = memoryCopy(locale),
    [data, setData] = useState<z.infer<typeof ListSchema>>(),
    [error, setError] = useState(''),
    [editing, setEditing] = useState<string>(),
    [editVersion, setEditVersion] = useState(0),
    [draft, setDraft] = useState(''),
    [busy, setBusy] = useState(false)
  const call = async (method: string, input: unknown) => {
    const r = await connection.rpc.call(PANEL_CHANNEL, `${PANEL_PREFIX}/${method}`, input)
    if (!r.ok) throw r.error
    return r.value
  }
  const load = async () => setData(ListSchema.parse(await call('memories-list', { includeArchived: true })))
  useEffect(() => {
    let live = true
    const update = () => {
      void call('memories-list', { includeArchived: true })
        .then((v) => {
          if (live) setData(ListSchema.parse(v))
        })
        .catch(() => {})
    }
    update()
    const timer = setInterval(update, 2000)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [connection])
  const run = async (f: () => Promise<unknown>) => {
    setBusy(true)
    setError('')
    try {
      await f()
      await load()
    } catch (e) {
      const code =
        (e as { code?: string; message?: string })?.message ?? (e as { code?: string })?.code ?? String(e)
      setError(code.includes('stale-version') ? c.conflict : code)
    } finally {
      setBusy(false)
    }
  }
  const button = (text: string, action: () => Promise<unknown>) =>
    h('button', { disabled: busy, onClick: () => void run(action) }, text)
  const download = async (format: 'markdown' | 'json') => {
    const r = z
      .object({ content: z.string(), filename: z.string() })
      .parse(await call('memories-export', { format }))
    const url = URL.createObjectURL(
      new Blob([r.content], { type: format === 'json' ? 'application/json' : 'text/markdown' }),
    )
    const a = document.createElement('a')
    a.href = url
    a.download = r.filename
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const groups = new Map<string, Memory[]>()
  for (const row of data?.memories ?? []) {
    const key = memoryScopeKey(row.scope)
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  return h(
    'section',
    { 'data-whaledot-memories': true },
    h('h2', null, c.title),
    h(
      'p',
      null,
      `${c.usage}：${data?.characters ?? 0} / ${data?.estimatedTokens ?? 0} · ${c.calls}：${data?.calls7d ?? 0}`,
    ),
    button(c.refresh, load),
    button(c.exportMd, () => download('markdown')),
    button(c.exportJson, () => download('json')),
    error && h('p', { role: 'alert' }, error),
    ...[...groups].map(([key, rows]) =>
      h(
        'section',
        { key },
        h('h3', null, key === 'personal' ? c.personal : key.slice(8)),
        ...rows.map((row) =>
          h(
            'article',
            {
              key: row.id,
              'data-memory-id': row.id,
              style: { opacity: row.status === 'archived' ? 0.55 : 1 },
            },
            h('strong', null, c[row.kind]),
            ' ',
            h('span', null, row.text),
            h(
              'small',
              { style: { display: 'block' } },
              `${c.source}：${row.source.via} · ${c.confirmed}：${new Date(row.confirmedAt).toLocaleString(locale)}${data?.memories.find((m) => m.id === row.id)?.stale ? ` · ${c.stale}` : ''}`,
            ),
            editing === row.id
              ? h(
                  'form',
                  {
                    onSubmit: (event: React.FormEvent) => {
                      event.preventDefault()
                      void run(async () => {
                        await call('memory-update', { id: row.id, version: editVersion, text: draft })
                        setEditing(undefined)
                      })
                    },
                  },
                  h('input', {
                    'aria-label': c.edit,
                    value: draft,
                    onChange: (event: React.ChangeEvent<HTMLInputElement>) => setDraft(event.target.value),
                  }),
                  h('button', { disabled: busy, type: 'submit' }, c.approve),
                )
              : h(
                  'button',
                  {
                    disabled: busy,
                    onClick: () => {
                      setEditing(row.id)
                      setEditVersion(row.version)
                      setDraft(row.text)
                    },
                  },
                  c.edit,
                ),
            button(row.status === 'active' ? c.archive : c.restore, () =>
              call(row.status === 'active' ? 'memory-archive' : 'memory-restore', {
                id: row.id,
                version: row.version,
              }),
            ),
            button(c.remove, async () => {
              if (window.confirm(c.confirmDelete))
                await call('memory-delete', { id: row.id, version: row.version, confirm: true })
            }),
          ),
        ),
      ),
    ),
  )
}
