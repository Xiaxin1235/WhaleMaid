import { createElement as h, useEffect, useState } from 'react'
import { t, notificationMessages, NotificationPreferencesSchema } from '@whaledot/core'
import type { Locale } from '@whaledot/core'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import {
  NotificationCenterSchema,
  RouteResultSchema,
  PANEL_CHANNEL,
  PANEL_PREFIX,
} from '../panel-api/contract.js'
import type { z } from 'zod'
/** Native inbox and panel use the same stored choices; free-text notes are displayed as text nodes. */
export function NotificationCenter({
  connection,
  locale,
  onOpenGoal,
  goalId,
}: {
  connection: ConnectionHandle
  locale: Locale
  onOpenGoal: (id: string) => void
  goalId?: string
}) {
  const [data, setData] = useState<z.infer<typeof NotificationCenterSchema>>()
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [revision, refresh] = useState(0),
    [preview, setPreview] = useState('')
  const [muted, setMuted] = useState(false),
    [start, setStart] = useState(''),
    [end, setEnd] = useState(''),
    [limit, setLimit] = useState(4),
    [editing, setEditing] = useState(false)
  const text = (key: Parameters<typeof t>[1]) => t(locale, key)
  const call = async (method: string, input: unknown, signal?: AbortSignal) => {
    const reply = await connection.rpc.call(PANEL_CHANNEL, `${PANEL_PREFIX}/${method}`, input, signal)
    if (!reply.ok) throw reply.error
    return reply.value
  }
  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    const load = async () => {
      try {
        const next = NotificationCenterSchema.parse(
          await call('notification-center', goalId ? { goalId } : {}, controller.signal),
        )
        if (!controller.signal.aborted) {
          setData(next)
          setError('')
          if (!editing) {
            setMuted(next.preferences.muted)
            setLimit(next.preferences.maxPerHour)
            setStart(next.preferences.quietHours?.start ?? '')
            setEnd(next.preferences.quietHours?.end ?? '')
          }
        }
      } catch (e) {
        if (!controller.signal.aborted) setError(String(e))
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(load, 2000)
      }
    }
    void load()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [connection, goalId, revision, editing])
  const write = async (method: string, input: unknown) => {
    setBusy(true)
    try {
      const value = await call(method, input)
      if (method === 'route-suggestion') {
        const r = RouteResultSchema.parse(value)
        if (!r.ok) throw new Error(r.reason ?? 'option-rejected')
        if (r.stat !== undefined) setPreview(r.stat || text('noFileDifferences'))
        else if (r.openPanel && r.goalId) onOpenGoal(r.goalId)
      }
      setError('')
      refresh((v) => v + 1)
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }
  const save = async () => {
    try {
      const prefs = NotificationPreferencesSchema.parse({
        muted,
        maxPerHour: limit,
        ...(start || end ? { quietHours: { start, end } } : {}),
      })
      await write('notification-preferences', prefs)
      setEditing(false)
    } catch (e) {
      setError(String(e))
    }
  }
  const delivery = (item: NonNullable<typeof data>['items'][number]) => {
    const n = item.notification
    return text(
      n.deliveryState === 'muted'
        ? 'notifyMuted'
        : n.deliveryState === 'failed'
          ? 'notifyFailed'
          : n.deliveryState === 'cancelled'
            ? 'notifyCancelled'
            : n.deliveryReason === 'quiet-hours'
              ? 'heldQuiet'
              : n.deliveryReason === 'hourly-limit'
                ? 'heldHourly'
                : n.deliveryReason === 'snoozed'
                  ? 'heldSnooze'
                  : n.deliveredAt !== undefined
                    ? 'deliveredInbox'
                    : 'notifyQueued',
    )
  }
  const field = (label: string, type: string, value: string | number, onChange: (v: string) => void) =>
    h(
      'label',
      null,
      label,
      ' ',
      h('input', {
        type,
        value,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
          setEditing(true)
          onChange(e.target.value)
        },
      }),
    )
  return h(
    'section',
    { className: 'whaledot-notifications' },
    h('h2', null, text('notificationCenter')),
    error && h('p', { role: 'alert' }, error),
    h(
      'details',
      null,
      h('summary', null, text('notifyPreferences')),
      h(
        'label',
        null,
        h('input', {
          type: 'checkbox',
          checked: muted,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
            setEditing(true)
            setMuted(e.target.checked)
          },
        }),
        text('muteNotifications'),
      ),
      field(text('quietStart'), 'time', start, setStart),
      field(text('quietEnd'), 'time', end, setEnd),
      field(text('maxPerHour'), 'number', limit, (v) => setLimit(Number(v))),
      h(
        'button',
        {
          disabled: busy,
          onClick: () => {
            void save()
          },
        },
        text('savePreferences'),
      ),
    ),
    h(
      'div',
      { className: 'whaledot-notification-columns' },
      ...(['pending', 'handled', 'digest'] as const).map((group) => {
        const items = (data?.items ?? []).filter((item) =>
          group === 'handled'
            ? item.notification.resolvedAt !== undefined
            : group === 'digest'
              ? item.notification.resolvedAt === undefined &&
                (item.notification.kind === 'info' || item.notification.deliveryState === 'digest')
              : item.notification.resolvedAt === undefined &&
                item.notification.kind !== 'info' &&
                item.notification.deliveryState !== 'digest',
        )
        return h(
          'section',
          { key: group },
          h(
            'h3',
            null,
            text(
              group === 'pending' ? 'notifyPending' : group === 'handled' ? 'notifyHandled' : 'notifyDigest',
            ),
          ),
          ...(group === 'digest'
            ? [...new Set(items.map((i) => i.notification.goalId))].map((id) =>
                h(
                  'details',
                  { key: id },
                  h('summary', null, items.find((i) => i.notification.goalId === id)!.copy.detail),
                  ...items
                    .filter((i) => i.notification.goalId === id)
                    .map((i) => h('p', { key: i.notification.id }, i.copy.question)),
                ),
              )
            : items.map((item) =>
                h(
                  'article',
                  { key: item.notification.id },
                  h('strong', null, item.copy.header),
                  h('p', null, item.copy.question),
                  h('small', null, item.copy.detail),
                  h('p', null, delivery(item)),
                  ...item.notes.map((note) => h('p', { key: note.id }, text('userNote'), ': ', note.text)),
                  ...item.choices.map((c) =>
                    h(
                      'p',
                      { key: c.id },
                      text('choiceSource'),
                      ': ',
                      text(c.source === 'inbox' ? 'choiceInbox' : 'choicePanel'),
                      ' · ',
                      notificationMessages[locale][c.action as keyof typeof notificationMessages.en]?.[0] ??
                        c.action,
                      ' · ',
                      text(
                        c.result === 'succeeded'
                          ? 'choiceSucceeded'
                          : c.result === 'failed'
                            ? 'choiceFailed'
                            : 'choicePending',
                      ),
                      c.detail ? ' · ' + c.detail : '',
                    ),
                  ),
                  ...item.suggestions
                    .filter((s) => (item.notification.suggestionIds ?? []).includes(s.id))
                    .map((s) =>
                      h(
                        'button',
                        {
                          key: s.id,
                          title: s.description,
                          disabled:
                            busy ||
                            group === 'handled' ||
                            s.consumedAt !== undefined ||
                            s.expiresAt <= Date.now() ||
                            !!item.notification.routingSuggestionId,
                          onClick: () => {
                            void write('route-suggestion', { suggestionId: s.id })
                          },
                        },
                        s.label,
                        h('small', null, ' — ', s.description),
                      ),
                    ),
                  group === 'pending' &&
                    h(
                      'button',
                      {
                        disabled: busy || !!item.notification.routingSuggestionId,
                        onClick: () => {
                          void write('remind-notification', { notificationId: item.notification.id })
                        },
                      },
                      text('remindAgain'),
                    ),
                ),
              )),
        )
      }),
    ),
    preview && h('pre', null, preview),
  )
}
