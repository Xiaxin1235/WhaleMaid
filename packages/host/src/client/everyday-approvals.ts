import { createElement as h, useEffect, useState } from 'react'
import type { Locale } from '@whalemaid/core'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import { PANEL_CHANNEL, PANEL_PREFIX } from '../panel-api/contract.js'
import { EverydayApprovalPanelSchema, everydayApprovalCopy } from '../everyday-approval/contract.js'

/** Settings and history share the same persisted switch and authenticated Host endpoint. */
export function EverydayApprovalsView({
  connection,
  locale,
  history = false,
}: {
  connection: ConnectionHandle
  locale: Locale
  history?: boolean
}) {
  const [data, setData] = useState<ReturnType<typeof EverydayApprovalPanelSchema.parse>>()
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const copy = everydayApprovalCopy(locale)
  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    const load = async () => {
      try {
        const reply = await connection.rpc.call(
          PANEL_CHANNEL,
          `${PANEL_PREFIX}/everyday-approvals`,
          {},
          controller.signal,
        )
        if (!reply.ok) throw Error(reply.error.code)
        if (!controller.signal.aborted) {
          setData(EverydayApprovalPanelSchema.parse(reply.value))
          setError('')
        }
      } catch {
        if (!controller.signal.aborted)
          setError(locale === 'zh-CN' ? '无法读取自动审批设置。' : 'Auto-approval settings unavailable.')
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(load, 2000)
      }
    }
    void load()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [connection, locale])
  const setEnabled = async (enabled: boolean) => {
    if (enabled && !window.confirm(copy.risk)) return
    setBusy(true)
    try {
      const reply = await connection.rpc.call(PANEL_CHANNEL, `${PANEL_PREFIX}/everyday-approval-settings`, {
        enabled,
        ...(enabled ? { confirm: true } : {}),
      })
      if (!reply.ok) throw Error(reply.error.code)
      setData(EverydayApprovalPanelSchema.parse(reply.value))
      setError('')
    } catch {
      setError(locale === 'zh-CN' ? '自动审批设置未保存。' : 'Auto-approval settings were not saved.')
    } finally {
      setBusy(false)
    }
  }
  return h(
    'section',
    { 'aria-label': history ? copy.history : copy.title },
    h('h2', null, history ? copy.history : copy.title),
    h('p', null, copy.description),
    error && h('p', { role: 'alert' }, error),
    h(
      'label',
      null,
      h('input', {
        type: 'checkbox',
        checked: data?.enabled ?? false,
        disabled: !data || busy,
        onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
          void setEnabled(event.target.checked)
        },
      }),
      copy.title,
    ),
    history &&
      data?.enabled &&
      h(
        'button',
        {
          disabled: busy,
          onClick: () => {
            void setEnabled(false)
          },
        },
        copy.disable,
      ),
    history &&
      (data?.records.length
        ? h(
            'div',
            { style: { overflowX: 'auto' } },
            h(
              'table',
              null,
              h(
                'thead',
                null,
                h(
                  'tr',
                  null,
                  [copy.time, copy.session, copy.cwd, copy.command, copy.classification].map((label) =>
                    h('th', { key: label }, label),
                  ),
                ),
              ),
              h(
                'tbody',
                null,
                [...data.records]
                  .reverse()
                  .map((row, index) =>
                    h(
                      'tr',
                      { key: index },
                      h('td', null, new Date(row.at).toLocaleString(locale)),
                      h('td', null, row.sessionName, h('small', null, row.sessionId)),
                      h('td', null, row.cwd),
                      h('td', null, h('code', null, row.command)),
                      h('td', null, copy.safe),
                    ),
                  ),
              ),
            ),
          )
        : h('p', null, copy.empty)),
  )
}
