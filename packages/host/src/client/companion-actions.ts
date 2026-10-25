import { createElement as h, useEffect, useState } from 'react'
import { z } from 'zod'
import { actionCopy, actionLabel, AutopilotEventSchema } from '@whalemaid/core'
import type { Locale } from '@whalemaid/core'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import { CompanionDraftsSchema } from '../panel-api/contract.js'
import { intakeCall } from './intake.js'
/** Show confirmed proposals, with a separate entry into the existing P07 grant editor. */
export function CompanionActionsView({
  connection,
  locale,
  onDraft,
}: {
  connection: ConnectionHandle
  locale: Locale
  onDraft(id: string): void
}) {
  const [drafts, setDrafts] = useState<z.infer<typeof CompanionDraftsSchema>>([]),
    [events, setEvents] = useState<z.infer<typeof AutopilotEventSchema>[]>([]),
    c = actionCopy(locale)
  useEffect(() => {
    let live = true
    const load = async () => {
      try {
        const [d, e] = await Promise.all([
          intakeCall(connection, 'companion-drafts', {}),
          intakeCall(connection, 'companion-action-events', {}),
        ])
        if (live) {
          setDrafts(CompanionDraftsSchema.parse(d))
          setEvents(z.array(AutopilotEventSchema).parse(e))
        }
      } catch {
        /* unavailable services must not interrupt the panel */
      }
    }
    void load()
    const timer = setInterval(() => {
      void load()
    }, 2000)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [connection])
  return h(
    'section',
    { 'data-companion-actions': true },
    drafts.length > 0 && h('h3', null, c.drafts),
    ...drafts.map((d) =>
      h(
        'article',
        { key: d.draftId },
        h('p', null, d.text),
        h(
          'small',
          null,
          c.attribution(
            new Date(d.confirmedAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
          ),
        ),
        h('button', { onClick: () => onDraft(d.draftId) }, c.review),
      ),
    ),
    ...events
      .slice(-5)
      .map((e) =>
        h(
          'p',
          { key: e.id },
          `${actionLabel(e.action, locale)} · ${e.reason === 'succeeded' ? c.saved : c.failed} · ${c.attribution(new Date(e.confirmedAt!).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }))}`,
        ),
      ),
  )
}
