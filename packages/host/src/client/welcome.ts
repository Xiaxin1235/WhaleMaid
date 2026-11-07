import { createElement as h, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { KeyboardEvent, MouseEvent, PointerEvent, SyntheticEvent } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import { resolveLocale, t, WELCOME_NOTES, WELCOME_RELEASE } from '@whalemaid/core'
import type { LanguageSetting, Locale } from '@whalemaid/core'
import { PANEL_CHANNEL, PANEL_PREFIX, WelcomeArtSchema, WelcomeStatusSchema } from '../panel-api/contract.js'

type ArtKind = 'motion' | 'still'
type LoadArt = (kind: ArtKind) => Promise<string | undefined>
// Artwork is fetched from the host only when a dialog opens, then kept for this page.
const artCache = new Map<ArtKind, Promise<string | undefined>>()
function artLoader(connection: ConnectionHandle): LoadArt {
  return (kind) => {
    let pending = artCache.get(kind)
    if (!pending) {
      pending = connection.rpc
        .call(PANEL_CHANNEL, PANEL_PREFIX + '/welcome-art', { kind })
        .then((result) => (result.ok ? WelcomeArtSchema.parse(result.value).src : undefined))
        .catch(() => undefined)
      // A failed or empty load may succeed after reconnecting.
      void pending.then((src) => {
        if (!src) artCache.delete(kind)
      })
      artCache.set(kind, pending)
    }
    return pending
  }
}
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

type Welcome =
  { mode: 'automatic'; language: LanguageSetting; firstRun: boolean } | { mode: 'manual'; locale: Locale }

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
  const [loadArt] = useState(() => artLoader(connection))

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
        setWelcome({ mode: 'automatic', language: status.language, firstRun: status.firstRun })
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
    loadArt,
    // First installs get the plain welcome; upgrades lead with what changed; a manual reopen shows both.
    view: welcome.mode === 'manual' ? 'both' : welcome.firstRun ? 'welcome' : 'update',
  })
}

function WelcomeArtwork({ alt, loadArt }: { alt: string; loadArt: LoadArt }) {
  const [motion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)'))
  const reduce = useSyncExternalStore(
    (changed) => {
      motion.addEventListener('change', changed)
      return () => motion.removeEventListener('change', changed)
    },
    () => motion.matches,
  )
  return h(WelcomeImage, {
    key: String(reduce),
    kinds: reduce ? ['still'] : ['motion', 'still'],
    alt,
    loadArt,
  })
}

function WelcomeImage({ kinds, alt, loadArt }: { kinds: ArtKind[]; alt: string; loadArt: LoadArt }) {
  const [index, setIndex] = useState(0)
  const [src, setSrc] = useState<string>()
  const kind = kinds[index]
  useEffect(() => {
    let live = true
    setSrc(undefined)
    if (!kind) return
    void loadArt(kind).then((value) => {
      if (!live) return
      if (value) setSrc(value)
      else setIndex((i) => i + 1)
    })
    return () => {
      live = false
    }
  }, [kind, loadArt])
  if (src)
    return h('img', { className: 'whalemaid-welcome-art', src, alt, onError: () => setIndex(index + 1) })
  // Keep the slot while loading so the dialog does not jump; render nothing once no artwork exists.
  return kind ? h('span', { className: 'whalemaid-welcome-art', 'aria-hidden': true }) : null
}

function WelcomeDialog({
  locale,
  dismiss,
  loadArt,
  view,
}: {
  locale: Locale
  dismiss: () => void
  loadArt: LoadArt
  view: 'welcome' | 'update' | 'both'
}) {
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
      h(WelcomeArtwork, { alt: text('welcomeArt'), loadArt }),
      h(
        'div',
        null,
        h(
          'h1',
          { id: 'whalemaid-welcome-title' },
          view === 'update'
            ? t(locale, 'welcomeUpdatedTitle', { version: WELCOME_RELEASE })
            : text('welcomeTitle'),
        ),
        h('p', null, text(view === 'update' ? 'welcomeUpdatedIntro' : 'welcomeIntro')),
      ),
    ),
    view !== 'welcome' &&
      h(
        'section',
        { className: 'whalemaid-welcome-news' },
        h('h2', null, t(locale, 'welcomeWhatsNew', { version: WELCOME_RELEASE })),
        h('ul', null, ...WELCOME_NOTES[locale].map((note) => h('li', { key: note }, note))),
      ),
    view !== 'welcome' && h('h2', { className: 'whalemaid-welcome-subhead' }, text('welcomeBasics')),
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
    h(
      'p',
      { className: 'whalemaid-welcome-star' },
      '⭐ ',
      text('welcomeStar'),
      ' ',
      h('a', { href: repository, target: '_blank', rel: 'noopener noreferrer' }, text('welcomeStarLink')),
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

/** Settings entry: reopen the welcome without changing its record, and reach feedback channels. */
export function AboutSettings({ locale }: { locale: Locale }) {
  const [copyState, setCopyState] = useState<'copied' | 'manual'>()
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const text = (key: Parameters<typeof t>[1]) => t(locale, key)
  const copy = async () => {
    clearTimeout(timer.current)
    try {
      await navigator.clipboard.writeText(group)
      setCopyState('copied')
      timer.current = setTimeout(() => setCopyState(undefined), 1800)
    } catch {
      setCopyState('manual')
    }
  }
  return h(
    'section',
    { className: 'whalemaid-about' },
    h('h3', null, text('aboutFeedback')),
    h(
      'div',
      { className: 'whalemaid-about-row' },
      h('button', { type: 'button', onClick: () => openWelcome(locale) }, text('welcomeAbout')),
      h(
        'a',
        { href: repository + '/issues/new', target: '_blank', rel: 'noopener noreferrer' },
        text('reportIssue'),
      ),
    ),
    h(
      'div',
      { className: 'whalemaid-about-row' },
      h('span', null, text('welcomeGroup'), ' ', h('code', null, group)),
      h(
        'button',
        { type: 'button', onClick: () => void copy() },
        text(copyState === 'copied' ? 'welcomeCopied' : 'welcomeCopy'),
      ),
      copyState === 'manual' && h('span', { role: 'status' }, text('welcomeCopyManual')),
    ),
  )
}
