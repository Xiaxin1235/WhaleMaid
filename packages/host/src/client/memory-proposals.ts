import { createElement as h, useEffect, useState } from 'react'
import { z } from 'zod'
import { MemoryProposalSchema, memoryCopy, memoryScopeKey } from '@whaledot/core'
import type { Locale } from '@whaledot/core'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import { PANEL_CHANNEL, PANEL_PREFIX } from '../panel-api/contract.js'
/** The same persisted proposal is visible in memory management and P04's notification center. */
export function MemoryProposals({
  connection,
  locale,
  goalId,
}: {
  connection: ConnectionHandle
  locale: Locale
  goalId?: string | undefined
}) {
  const c = memoryCopy(locale),
    [rows, setRows] = useState<z.infer<typeof MemoryProposalSchema>[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [drafts, setDrafts] = useState<Record<string, string>>({})
  const call = async (method: string, payload: unknown) => {
    const r = await connection.rpc.call(PANEL_CHANNEL, `${PANEL_PREFIX}/${method}`, payload)
    if (!r.ok) throw r.error
    return r.value
  }
  useEffect(() => {
    let active = true
    const load = () => {
      void call('memory-proposals', goalId ? { goalId } : {})
        .then((value) => {
          if (active) setRows(z.array(MemoryProposalSchema).parse(value))
        })
        .catch(() => {})
    }
    load()
    const timer = setInterval(load, 2000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [connection, goalId])
  const resolve = async (id: string, choice: 'confirm' | 'decline') => {
    setBusy(true)
    setError('')
    try {
      await call('memory-proposal-resolve', {
        id,
        choice,
        ...(drafts[id] === undefined ? {} : { text: drafts[id] }),
      })
      setRows((rows) => rows.filter((r) => r.id !== id))
    } catch (e) {
      const message = (e as { message?: string }).message ?? String(e)
      setError(
        message.includes('stale-version')
          ? c.conflict
          : message.includes('scope-full')
            ? c.scopeFull
            : message,
      )
    } finally {
      setBusy(false)
    }
  }
  if (!rows.length && !error) return null
  return h(
    'section',
    { 'data-memory-proposals': true },
    h('h3', null, c.pending),
    rows.some(
      (p) =>
        p.scope.kind === 'project' &&
        rows.filter((r) => memoryScopeKey(r.scope) === memoryScopeKey(p.scope)).length >= 3,
    ) && h('p', { role: 'status' }, c.pendingLimit),
    error && h('p', { role: 'alert' }, error),
    ...rows.map((p) =>
      h(
        'article',
        { key: p.id, 'data-proposal-id': p.id, 'data-kind': p.kind },
        h('strong', null, p.origin === 'project-lesson' ? c.lessonDraft : c.mergeProposal),
        h('span', null, ` · ${c[p.memoryKind]}`),
        h('small', null, ` · ${p.scope.kind === 'personal' ? c.personal : memoryScopeKey(p.scope).slice(8)}`),
        h('p', null, p.text),
        p.replaces.length > 0 &&
          h(
            'details',
            null,
            h('summary', null, `${c.archive} (${p.replaces.length})`),
            h('ul', null, ...p.replaces.map((r) => h('li', { key: r.id }, r.text))),
          ),
        h('input', {
          'aria-label': c.edit,
          value: drafts[p.id] ?? p.text,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
            setDrafts({ ...drafts, [p.id]: e.target.value }),
        }),
        h('button', { disabled: busy, onClick: () => void resolve(p.id, 'confirm') }, c.approve),
        h('button', { disabled: busy, onClick: () => void resolve(p.id, 'decline') }, c.reject),
      ),
    ),
  )
}
