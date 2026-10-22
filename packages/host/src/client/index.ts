import type { Context } from '@deepseek-ai/cordis'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { createElement as h, useEffect, useState, useSyncExternalStore } from 'react'
import { resolveLocale, t, type LanguageSetting } from '@whaledot/core'
import {
  GoalsSchema,
  LanguageResponseSchema,
  LanguageSchema,
  PANEL_CHANNEL,
  PANEL_PREFIX,
  StatusSchema,
  PausedSchema,
  type PanelStatus,
} from '../panel-api/contract.js'
import { serviceRows, formatStartedAt } from './format.js'
import styles from './panel.css'
import { IntakeView, GoalDetailView } from './intake.js'

export const inject = ['slots', 'locale', 'connection']
const PANEL_ID = 'whaledot'

interface Face {
  ctx: Context
  connection: ConnectionHandle
}
function Panel({ ctx, connection }: Face) {
  const hostLocale = useSyncExternalStore(
    (fn) => ctx.locale.subscribe(fn),
    () => ctx.locale.getSnapshot(),
  )
  const [status, setStatus] = useState<PanelStatus>()
  const [goals, setGoals] = useState<ReturnType<typeof GoalsSchema.parse>>([])
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)
  const [pausing, setPausing] = useState(false)
  const [revision, refresh] = useState(0)
  const [creating, setCreating] = useState(false)
  const [selectedGoal, setSelectedGoal] = useState<string>()
  const locale = resolveLocale(status?.language ?? 'auto', hostLocale.active)
  const text = (key: Parameters<typeof t>[1]) => t(locale, key)

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    async function load() {
      try {
        const reply = await connection.rpc.call(
          PANEL_CHANNEL,
          `${PANEL_PREFIX}/status`,
          {},
          controller.signal,
        )
        if (!reply.ok) throw reply.error
        const next = StatusSchema.parse(reply.value)
        if (!controller.signal.aborted) {
          setStatus(next)
          setError(undefined)
        }
      } catch (error) {
        if (!controller.signal.aborted) setError(errorCode(error))
      } finally {
        // Read-only refresh also observes edits made in the native Settings page or another client.
        if (!controller.signal.aborted) timer = setTimeout(load, 2000)
      }
    }
    void load()
    void connection.rpc
      .call(PANEL_CHANNEL, `${PANEL_PREFIX}/goals`, {}, controller.signal)
      .then((reply) => {
        if (!reply.ok) throw reply.error
        const next = GoalsSchema.parse(reply.value)
        if (!controller.signal.aborted) setGoals(next)
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(errorCode(error))
      })
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [connection, revision])

  async function changeLanguage(language: LanguageSetting) {
    setSaving(true)
    try {
      const reply = await connection.rpc.call(PANEL_CHANNEL, `${PANEL_PREFIX}/language`, { language })
      if (!reply.ok) throw reply.error
      const value = LanguageResponseSchema.parse(reply.value)
      setStatus((previous) => previous && { ...previous, language: value.language })
      setError(undefined)
    } catch (error) {
      setError(errorCode(error))
    } finally {
      setSaving(false)
    }
  }

  async function changePaused(paused: boolean) {
    setPausing(true)
    try {
      const reply = await connection.rpc.call(PANEL_CHANNEL, `${PANEL_PREFIX}/set-paused`, { paused })
      if (!reply.ok) throw reply.error
      const value = PausedSchema.parse(reply.value)
      setStatus((previous) => previous && { ...previous, paused: value.paused })
      setError(undefined)
    } catch (error) {
      setError(errorCode(error))
    } finally {
      setPausing(false)
    }
  }

  async function takeover() {
    setSaving(true)
    try {
      const reply = await connection.rpc.call(PANEL_CHANNEL, `${PANEL_PREFIX}/takeover-store`, {
        confirm: true,
      })
      if (!reply.ok) throw reply.error
      setStatus(StatusSchema.parse(reply.value))
      setError(undefined)
    } catch (error) {
      setError(errorCode(error))
    } finally {
      setSaving(false)
    }
  }

  if (creating)
    return h(
      'main',
      { className: 'whaledot-panel' },
      h(IntakeView, {
        connection,
        locale,
        onCancel: () => setCreating(false),
        onCreated: (id: string) => {
          setCreating(false)
          setSelectedGoal(id)
          refresh((value) => value + 1)
        },
      }),
    )
  if (selectedGoal)
    return h(
      'main',
      { className: 'whaledot-panel' },
      h(GoalDetailView, {
        connection,
        locale,
        goalId: selectedGoal,
        onBack: () => {
          setSelectedGoal(undefined)
          refresh((value) => value + 1)
        },
      }),
    )

  return h(
    'main',
    { className: 'whaledot-panel', 'data-whaledot-panel': '', lang: locale },
    h(
      'header',
      null,
      h('div', null, h('h1', null, 'WhaleDot'), h('p', null, text('subtitle'))),
      h('button', { onClick: () => refresh((value) => value + 1) }, text('refresh')),
    ),
    error && h('p', { role: 'alert' }, t(locale, 'requestFailed', { code: error })),
    h(
      'section',
      { 'aria-label': text('status') },
      h('h2', null, text('status')),
      status
        ? h(
            'div',
            null,
            h(
              'dl',
              null,
              h('dt', null, text('version')),
              h('dd', null, status.version),
              h('dt', null, text('startedAt')),
              h('dd', null, formatStartedAt(status.startedAt, locale)),
              h('dt', null, text('dataDir')),
              h('dd', { className: 'whaledot-path' }, status.dataDir),
              h('dt', null, text('store')),
              h(
                'dd',
                { role: status.store.state === 'ok' ? undefined : 'status' },
                text(
                  status.store.state === 'ok'
                    ? 'storeOk'
                    : status.store.state === 'read-only'
                      ? 'storeReadOnly'
                      : 'storeError',
                ),
                status.store.state === 'error' && status.store.message && `: ${status.store.message}`,
              ),
              h('dt', null, text('storeRecords')),
              h('dd', null, t(locale, 'corruptRows', { count: status.store.corruptRows })),
            ),
            status.store.state === 'read-only' &&
              h(
                'button',
                {
                  disabled: saving,
                  onClick: () => {
                    void takeover()
                  },
                },
                text('takeoverStore'),
              ),
            h('h3', null, text('dependencies')),
            h(
              'ul',
              { className: 'whaledot-services' },
              serviceRows(status, locale).map((row) =>
                h('li', { key: row.name }, h('code', null, row.name), h('span', null, row.text)),
              ),
            ),
            h(
              'p',
              null,
              `${text('pet')}：${text(status.coopanion ? 'petDetected' : 'petMissing')}`,
              ' ',
              !status.coopanion &&
                h(
                  'a',
                  { href: 'https://github.com/takboo/dsh-coopanion', target: '_blank', rel: 'noreferrer' },
                  text('petLink'),
                ),
            ),
            h(
              'label',
              { className: 'whaledot-language' },
              text('language'),
              h(
                'select',
                {
                  value: status.language,
                  disabled: saving,
                  onChange: (event: React.ChangeEvent<HTMLSelectElement>) => {
                    void changeLanguage(LanguageSchema.parse(event.target.value))
                  },
                },
                h('option', { value: 'auto' }, text('auto')),
                h('option', { value: 'zh-CN' }, '简体中文'),
                h('option', { value: 'en' }, 'English'),
              ),
              saving && h('span', { role: 'status' }, text('saving')),
            ),
          )
        : h('p', null, text('loading')),
    ),
    h(
      'section',
      { 'aria-label': text('goals') },
      h(
        'div',
        { className: 'whaledot-section-title' },
        h('h2', null, text('goals')),
        h(
          'button',
          { disabled: status?.store.state !== 'ok', onClick: () => setCreating(true) },
          text('createGoal'),
        ),
      ),
      goals.length
        ? h(
            'ul',
            null,
            goals.map((goal) =>
              h(
                'li',
                { key: goal.id },
                h('button', { onClick: () => setSelectedGoal(goal.id) }, goal.title),
                ' · ',
                goal.status,
              ),
            ),
          )
        : h('p', { className: 'whaledot-empty' }, text('emptyGoals')),
    ),
    h(
      'section',
      { 'aria-label': text('globalSwitch') },
      h('h2', null, text('globalSwitch')),
      h(
        'label',
        { className: 'whaledot-pause' },
        h('input', {
          type: 'checkbox',
          checked: status?.paused ?? false,
          disabled: !status || status.store.state !== 'ok' || pausing,
          onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
            void changePaused(event.target.checked)
          },
        }),
        text('pauseAll'),
        pausing && h('small', { role: 'status' }, text('saving')),
      ),
    ),
  )
}

function errorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'whaledot/unavailable'
}

/** The shipped shell does not auto-render every Config form; expose the same setting here. */
function LanguageSettings({ ctx, connection }: Face) {
  const host = useSyncExternalStore(
    (fn) => ctx.locale.subscribe(fn),
    () => ctx.locale.getSnapshot(),
  )
  const [language, setLanguage] = useState<LanguageSetting>('auto')
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const locale = resolveLocale(language, host.active)
  useEffect(() => {
    const controller = new AbortController()
    void connection.rpc
      .call(PANEL_CHANNEL, `${PANEL_PREFIX}/status`, {}, controller.signal)
      .then((reply) => {
        if (!reply.ok) throw reply.error
        const value = StatusSchema.parse(reply.value)
        if (!controller.signal.aborted) {
          setLanguage(value.language)
          setReady(true)
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(errorCode(error))
      })
    return () => controller.abort()
  }, [connection])
  async function change(value: string) {
    setSaving(true)
    try {
      const reply = await connection.rpc.call(PANEL_CHANNEL, `${PANEL_PREFIX}/language`, {
        language: LanguageSchema.parse(value),
      })
      if (!reply.ok) throw reply.error
      setLanguage(LanguageResponseSchema.parse(reply.value).language)
      setError(undefined)
    } catch (error) {
      setError(errorCode(error))
    } finally {
      setSaving(false)
    }
  }
  return h(
    'div',
    { className: 'whaledot-settings', lang: locale },
    h('h2', null, 'WhaleDot'),
    error && h('p', { role: 'alert' }, t(locale, 'requestFailed', { code: error })),
    h(
      'label',
      null,
      t(locale, 'language'),
      ' ',
      h(
        'select',
        {
          value: language,
          disabled: !ready || saving,
          onChange: (event: React.ChangeEvent<HTMLSelectElement>) => {
            void change(event.target.value)
          },
        },
        h('option', { value: 'auto' }, t(locale, 'auto')),
        h('option', { value: 'zh-CN' }, '简体中文'),
        h('option', { value: 'en' }, 'English'),
      ),
    ),
    saving && h('p', { role: 'status' }, t(locale, 'saving')),
  )
}

export function apply(ctx: Context): void {
  const connection = ctx.get('connection') as unknown as ConnectionHandle
  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.plugin = 'whaledot'
    style.textContent = styles
    document.head.append(style)
    return () => style.remove()
  })
  ctx.slots.inject('main', () =>
    ctx.slots.register({ name: 'main', key: PANEL_ID, inject: () => ({ ctx, connection }) }, Panel),
  )
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: PANEL_ID,
        label: 'WhaleDot',
        order: 65,
        inject: () => ({ ctx, connection }),
      },
      LanguageSettings,
    ),
  )
  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register(
      { name: 'sidebar.panellist', id: PANEL_ID, order: 30, label: 'WhaleDot' },
      ({ size }: { size: number; active: boolean }) =>
        h(
          'svg',
          {
            viewBox: '0 0 24 24',
            width: size,
            height: size,
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 1.6,
            'aria-hidden': true,
          },
          h('path', { d: 'M3 13c0 5 4 7 9 7s9-3 9-8c-3 2-5 0-5-3 0-3 3-4 5-4-1 4-3 5-5 4M3 13c2-2 5-3 8-2' }),
          h('circle', { cx: 7, cy: 14, r: 0.8 }),
        ),
    ),
  )
}
