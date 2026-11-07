import { createElement as h, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { KeyboardEvent, MouseEvent, PointerEvent, SyntheticEvent } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import { resolveLocale, t } from '@whalemaid/core'
import type { LanguageSetting, Locale } from '@whalemaid/core'
import { PANEL_CHANNEL, PANEL_PREFIX, WelcomeStatusSchema } from '../panel-api/contract.js'

declare const __WHALEMAID_WELCOME_ART__: { webp?: string; gif?: string; still?: string }
const openEvent = 'whalemaid-open-welcome'
const group = '1001092170'
const repository = 'https://github.com/Xiaxin1235/WhaleMaid'
const features = [
  ['◎', 'welcomeGoals'],
  ['◇', 'welcomeDecisions'],
  ['♡', 'welcomeCompanion'],
  ['↗', 'welcomeInitiative'],
  ['✓', 'welcomeSafety'],
] as const

export function openWelcome(locale: Locale): void {
  window.dispatchEvent(new CustomEvent(openEvent, { detail: locale }))
}

type Welcome = { mode: 'automatic'; language: LanguageSetting } | { mode: 'manual'; locale: Locale }

/** The shell overlay stays mounted independently of the selected Harness panel. */
export function WelcomeOverlay({ ctx, connection }: { ctx: Context; connection: ConnectionHandle }) {
  const generation = useSyncExternalStore(
    (changed) => connection.generation.subscribe(changed),
    () => connection.generation.getSnapshot(),
  )
  const hostLocale = useSyncExternalStore(
    (changed) => ctx.locale.subscribe(changed),
    () => ctx.locale.getSnapshot(),
  )
  const [welcome, setWelcome] = useState<Welcome>()
  const suppressAutomatic = useRef(false)

  useEffect(() => {
    const open = (event: Event) => {
      suppressAutomatic.current = true
      setWelcome({ mode: 'manual', locale: (event as CustomEvent<Locale>).detail })
    }
    window.addEventListener(openEvent, open)
    return () => window.removeEventListener(openEvent, open)
  }, [])

  useEffect(() => {
    const hideAutomatic = () => setWelcome((current) => (current?.mode === 'automatic' ? undefined : current))
    if (!generation) {
      hideAutomatic()
      return
    }
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const check = async () => {
      if (suppressAutomatic.current) return
      try {
        const result = await connection.rpc.call(
          PANEL_CHANNEL,
          PANEL_PREFIX + '/welcome-status',
          {},
          controller.signal,
        )
        if (!result.ok) throw result.error
        const status = WelcomeStatusSchema.parse(result.value)
        if (controller.signal.aborted || suppressAutomatic.current) return
        if (!status.show) {
          hideAutomatic()
          return
        }
        setWelcome({ mode: 'automatic', language: status.language })
        // Only a pending dialog polls for a dismissal from another client.
        timer = setTimeout(() => void check(), 2000)
      } catch {
        if (!controller.signal.aborted) hideAutomatic()
      }
    }
    void check()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [connection, generation])

  if (!welcome) return null
  const dismiss = () => {
    setWelcome(undefined)
    if (welcome.mode === 'manual' || suppressAutomatic.current) return
    suppressAutomatic.current = true
    void connection.rpc.call(PANEL_CHANNEL, PANEL_PREFIX + '/welcome-seen', {}).catch(() => {})
  }
  return h(WelcomeDialog, {
    locale: welcome.mode === 'manual' ? welcome.locale : resolveLocale(welcome.language, hostLocale.active),
    dismiss,
  })
}

function WelcomeArtwork({ alt }: { alt: string }) {
  const [motion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)'))
  const reduce = useSyncExternalStore(
    (changed) => {
      motion.addEventListener('change', changed)
      return () => motion.removeEventListener('change', changed)
    },
    () => motion.matches,
  )
  const art = __WHALEMAID_WELCOME_ART__
  const sources = (reduce ? [art.still] : [art.webp, art.gif, art.still]).filter(Boolean) as string[]
  return h(WelcomeImage, { key: String(reduce), sources, alt })
}

function WelcomeImage({ sources, alt }: { sources: string[]; alt: string }) {
  const [index, setIndex] = useState(0)
  const src = sources[index]
  return src
    ? h('img', { className: 'whalemaid-welcome-art', src, alt, onError: () => setIndex(index + 1) })
    : null
}

function WelcomeDialog({ locale, dismiss }: { locale: Locale; dismiss: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const start = useRef<HTMLButtonElement>(null)
  const pointerOnBackdrop = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const [copyState, setCopyState] = useState<'copied' | 'manual'>()
  const text = (key: Parameters<typeof t>[1]) => t(locale, key)

  useEffect(() => {
    const element = dialog.current!
    const previous = document.activeElement
    element.showModal()
    start.current?.focus({ preventScroll: true })
    return () => {
      clearTimeout(timer.current)
      element.close()
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
    }
  }, [])

  const copy = async () => {
    clearTimeout(timer.current)
    try {
      await navigator.clipboard.writeText(group)
      if (!dialog.current?.open) return
      setCopyState('copied')
      timer.current = setTimeout(() => setCopyState(undefined), 1800)
    } catch {
      if (dialog.current?.open) setCopyState('manual')
    }
  }
  const outside = (event: PointerEvent<HTMLDialogElement> | MouseEvent<HTMLDialogElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return (
      event.target === event.currentTarget &&
      (event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom)
    )
  }
  const tab = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== 'Tab') return
    const items = event.currentTarget.querySelectorAll<HTMLElement>('button, a[href]')
    const first = items[0],
      last = items[items.length - 1]
    if (document.activeElement !== (event.shiftKey ? first : last)) return
    event.preventDefault()
    ;(event.shiftKey ? last : first)?.focus()
  }

  return h(
    'dialog',
    {
      ref: dialog,
      className: 'whalemaid-welcome',
      role: 'dialog',
      'aria-modal': true,
      'aria-labelledby': 'whalemaid-welcome-title',
      lang: locale,
      onCancel: (event: SyntheticEvent<HTMLDialogElement>) => {
        event.preventDefault()
        dismiss()
      },
      onKeyDown: tab,
      onPointerDown: (event) => {
        pointerOnBackdrop.current = outside(event)
      },
      onClick: (event) => {
        if (pointerOnBackdrop.current && outside(event)) dismiss()
      },
    },
    h(
      'button',
      {
        type: 'button',
        className: 'whalemaid-welcome-close',
        'aria-label': text('welcomeClose'),
        onClick: dismiss,
      },
      '×',
    ),
    h(
      'header',
      { className: 'whalemaid-welcome-header' },
      h(WelcomeArtwork, { alt: text('welcomeArt') }),
      h(
        'div',
        null,
        h('h1', { id: 'whalemaid-welcome-title' }, text('welcomeTitle')),
        h('p', null, text('welcomeIntro')),
      ),
    ),
    h(
      'ul',
      { className: 'whalemaid-welcome-features' },
      ...features.map(([mark, key]) => h('li', { key }, h('span', { 'aria-hidden': true }, mark), text(key))),
    ),
    h(
      'div',
      { className: 'whalemaid-welcome-feedback' },
      h('span', null, text('welcomeGroup'), ' ', h('code', null, group)),
      h(
        'button',
        { type: 'button', onClick: () => void copy() },
        text(copyState === 'copied' ? 'welcomeCopied' : 'welcomeCopy'),
      ),
      h(
        'a',
        { href: repository + '/issues', target: '_blank', rel: 'noopener noreferrer' },
        text('welcomeIssues'),
      ),
      copyState === 'manual' && h('span', { role: 'status' }, text('welcomeCopyManual')),
    ),
    h('p', { className: 'whalemaid-welcome-pet' }, text('welcomePet')),
    h(
      'footer',
      null,
      h(
        'a',
        {
          href: repository + '/blob/master/docs/usage' + (locale === 'en' ? '.en' : '') + '.md',
          target: '_blank',
          rel: 'noopener noreferrer',
        },
        text('welcomeGuide'),
      ),
      h(
        'button',
        { type: 'button', ref: start, className: 'whalemaid-welcome-start', onClick: dismiss },
        text('welcomeStart'),
      ),
    ),
  )
}
