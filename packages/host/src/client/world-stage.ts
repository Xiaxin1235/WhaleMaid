import { createElement as h, useEffect, useRef, useState } from 'react'
import type { WorldSnapshot } from '@whalemaid/core'

const stagePath = '/api/coopanion/stage/1'
const protocol = 'stage/1'
const poses = ['idle', 'walk', 'sit-work', 'sleep']
const width = 260,
  height = 280

export interface StagePosition {
  x: number
  y: number
  scale: number
}

export function stageEvent(event: Pick<MessageEvent, 'source' | 'origin' | 'data'>, source: Window | null) {
  if (
    !source ||
    event.source !== source ||
    event.origin !== 'null' ||
    !event.data ||
    typeof event.data !== 'object'
  )
    return
  const {
    protocol: version,
    type,
    actions,
  } = event.data as { protocol?: unknown; type?: unknown; actions?: unknown }
  if (version !== protocol) return type === 'ready' ? { type: 'error' as const } : undefined
  if (type === 'ready') {
    if (!Array.isArray(actions) || !poses.every((name) => actions.includes(name)))
      return { type: 'error' as const }
    return { type, actions: actions.filter((item): item is string => typeof item === 'string') }
  }
  if (type === 'error' || type === 'hover' || type === 'click') return { type }
}

/** One browser-owned lease through the authenticated Coopanion host route. */
export async function keepStageLease(signal: AbortSignal, ready: () => void, request: typeof fetch = fetch) {
  const response = await request(stagePath + '/away', { method: 'POST', signal })
  if (
    !response.ok ||
    !response.body ||
    !response.headers.get('content-type')?.startsWith('text/event-stream')
  )
    throw Error('stage-lease-unavailable')
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  try {
    let first = ''
    while (!first.includes('\n\n')) {
      const chunk = await reader.read()
      if (chunk.done) throw Error('stage-lease-ended')
      first += chunk.value
      if (first.length > 512) throw Error('stage-lease-invalid')
    }
    if (first.split('\n\n', 1)[0] !== 'data: stage/1') throw Error('stage-lease-invalid')
    ready()
    while (!(await reader.read()).done) {
      /* Ignore keepalives. */
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
}

export function WorldStage({
  position,
  actor,
  time,
  quiet,
  visible,
  away,
  still,
  label,
  fallback,
  leaseError,
}: {
  position: StagePosition
  actor: WorldSnapshot['actor']
  time: WorldSnapshot['time']
  quiet: boolean
  visible: boolean
  away: boolean
  still: () => Promise<string | undefined>
  label: string
  fallback: string
  leaseError: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const iframe = useRef<HTMLIFrameElement>(undefined)
  const actions = useRef<string[]>([])
  const motion = useRef(actor.motion)
  const previous = useRef(position.x)
  const facing = useRef<'left' | 'right'>('right')
  const [state, setState] = useState<'loading' | 'ready' | 'fallback'>('loading')
  const [image, setImage] = useState<string>()
  const [leaseFailed, setLeaseFailed] = useState(false)
  const send = (value: Record<string, string | number>) =>
    iframe.current?.contentWindow?.postMessage({ protocol, ...value }, '*')
  useEffect(() => {
    const holder = ref.current!
    setState('loading')
    const controller = new AbortController()
    const frame = document.createElement('iframe')
    frame.title = label
    frame.tabIndex = -1
    frame.setAttribute('sandbox', 'allow-scripts')
    iframe.current = frame
    let expression: ReturnType<typeof setTimeout> | undefined
    const fail = () => {
      if (controller.signal.aborted) return
      clearTimeout(deadline)
      frame.remove()
      setState('fallback')
      void still()
        .then((src) => {
          if (!controller.signal.aborted) setImage(src)
        })
        .catch(() => {})
    }
    const deadline = setTimeout(fail, 20000)
    const receive = (event: MessageEvent) => {
      const message = stageEvent(event, frame.contentWindow)
      if (message?.type === 'ready') {
        actions.current = message.actions ?? []
        clearTimeout(deadline)
        setState('ready')
      } else if (message?.type === 'error') fail()
      else if (message?.type === 'hover' || message?.type === 'click') {
        const name = message.type === 'click' ? 'love' : 'happy'
        if (!actions.current.includes(name)) return
        send({ type: 'motion', name })
        clearTimeout(expression)
        expression = setTimeout(() => send({ type: 'motion', name: motion.current }), 1200)
      }
    }
    window.addEventListener('message', receive)
    void fetch(stagePath, { method: 'HEAD', signal: controller.signal })
      .then((response) => {
        if (!response.ok || !response.headers.get('content-type')?.startsWith('text/html')) {
          fail()
          return
        }
        if (!controller.signal.aborted) {
          frame.src = stagePath
          holder.append(frame)
        }
      })
      .catch(fail)
    return () => {
      controller.abort()
      clearTimeout(deadline)
      clearTimeout(expression)
      window.removeEventListener('message', receive)
      send({ type: 'pause' })
      frame.remove()
      iframe.current = undefined
    }
  }, [label, still])

  useEffect(() => {
    if (state !== 'ready' || !away) return
    const controller = new AbortController()
    const ackTimer = setTimeout(() => {
      controller.abort()
      setLeaseFailed(true)
    }, 20000)
    setLeaseFailed(false)
    const ended = () => {
      clearTimeout(ackTimer)
      if (!controller.signal.aborted) setLeaseFailed(true)
    }
    void keepStageLease(controller.signal, () => clearTimeout(ackTimer)).then(ended, ended)
    return () => {
      clearTimeout(ackTimer)
      controller.abort()
    }
  }, [state, away])

  useEffect(() => {
    if (state !== 'ready') return
    motion.current = actor.motion
    send({ type: 'motion', name: actor.motion })
  }, [state, actor.motion])
  useEffect(() => {
    if (state === 'ready')
      send({
        type: 'light',
        name: time === 'dawn' ? 'day' : time === 'night' && actor.motion === 'sit-work' ? 'lamp' : time,
      })
  }, [state, time, actor.motion])
  useEffect(() => {
    if (state === 'ready') send({ type: visible ? 'resume' : 'pause' })
  }, [state, visible])
  useEffect(() => {
    if (state !== 'ready') return
    if (actor.motion === 'walk' && position.x !== previous.current)
      facing.current = position.x < previous.current ? 'left' : 'right'
    previous.current = position.x
    const scale = position.scale * 0.29
    if (iframe.current)
      iframe.current.style.clipPath = `inset(${Math.max(3, height - 12 - 222 * scale)}px ${Math.max(5, width / 2 - 106 * scale)}px 7px)`
    send({
      type: 'place',
      x: width / 2,
      y: height - 12,
      scale,
      facing: facing.current,
    })
  }, [state, position.scale, position.x, actor.motion])

  return h(
    'div',
    { className: 'whalemaid-world-actor-layer', 'data-stage': state },
    h(
      'div',
      {
        ref,
        className: 'whalemaid-world-actor',
        style: {
          width,
          height,
          visibility: visible ? 'visible' : 'hidden',
          transform: `translate(${position.x - width / 2}px,${position.y - height + 12}px)`,
          transitionDuration: actor.motion === 'walk' && !quiet ? `${actor.durationMs ?? 0}ms` : '0ms',
        },
      },
      state === 'fallback' &&
        image &&
        h('img', {
          src: image,
          alt: label,
          style: { height: position.scale * 62 },
        }),
    ),
    state === 'fallback' && h('p', { className: 'whalemaid-world-stage-message', role: 'status' }, fallback),
    away && leaseFailed && h('p', { className: 'whalemaid-world-stage-message', role: 'status' }, leaseError),
  )
}
