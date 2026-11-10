import {
  createElement as h,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import { GoalIdSchema, WorldPreferencesSchema, worldLayout } from '@whalemaid/core'
import type { Locale, WorldPreferencePatch, WorldRoom, WorldSnapshot } from '@whalemaid/core'
import {
  PANEL_CHANNEL,
  PANEL_PREFIX,
  WelcomeArtSchema,
  WorldArtSchema,
  WorldViewSchema,
} from '../panel-api/contract.js'
import { actorPoint, drawWorld, worldShade } from './world-canvas.js'
import type { Camera, Hit, WorldArt } from './world-canvas.js'
import { WorldStage } from './world-stage.js'

export const worldCopy = (locale: Locale) => (locale === 'zh-CN' ? zh : en)
const zh = {
  title: '宅邸',
  experimental: '实验',
  enable: '开启宅邸（实验）',
  goals: '目标',
  away: '桌宠走进宅邸（实验）',
  hall: '大厅',
  kitchen: '厨房',
  gallery: '陈列室',
  bedroom: '卧室',
  floor: '楼层',
  hold: '请勿打扰',
  gate: '大门已关闭',
  more: '更多',
  storage: '储藏室',
  archive: '移入储藏室',
  restore: '搬回宅邸',
  cabinet: '收纳柜',
  overflow: '其余任务',
  follow: '回到大肥鱼所在处',
  list: '列表视图',
  canvas: '房间视图',
  overview: '楼层总览',
  room: '选择房间',
  quiet: '安静时段',
  dawn: '清晨',
  day: '白天',
  evening: '傍晚',
  night: '夜晚',
  letter: '待决定的信件',
  note: '建议便签',
  parcel: '雷达包裹',
  flicker: '持续集成失败',
  paused: '已暂停',
  locked: '授权已撤销',
  working: '执行中',
  mess: '待整理',
  neutral: '暂无进度',
  failed: '验收失败',
  wilted: '进展停滞',
  tank: '水缸',
  books: '书架',
  plant: '盆栽',
  files: '立式文件架',
  toolbox: '工具箱',
  tray: '文件托盘',
  basket: '编织收纳篮',
  lamp: '台灯',
  keepsake: '纪念摆件',
  zoomIn: '放大',
  zoomOut: '缩小',
  load: '正在读取宅邸…',
  unavailable: '暂时无法读取宅邸，请稍后再试。',
  updateError: '设置没有保存，请重试。',
  noCanvas: '画面无法加载，已切换到列表。',
  pet: '大肥鱼',
  fallback: '安装完整版可以看到她在宅邸里活动。',
  leaseError: '桌宠暂时无法走进宅邸。',
  summary: '完成总结',
  experiences: '大肥鱼的经历',
  verifiedTasks: '项任务已通过验收',
} as const
const en: Record<keyof typeof zh, string> = {
  title: 'Mansion',
  experimental: 'Experimental',
  enable: 'Enable Mansion (experimental)',
  goals: 'Goals',
  away: 'Pet visits the mansion (experimental)',
  hall: 'Hall',
  kitchen: 'Kitchen',
  gallery: 'Gallery',
  bedroom: 'Bedroom',
  floor: 'Floor',
  hold: 'Do not disturb',
  gate: 'Front gate closed',
  more: 'More',
  storage: 'Storage',
  archive: 'Move to storage',
  restore: 'Bring back',
  cabinet: 'Cabinet',
  overflow: 'More tasks',
  follow: 'Go to Da Fei Yu',
  list: 'List view',
  canvas: 'Room view',
  overview: 'Floor overview',
  room: 'Choose a room',
  quiet: 'Quiet hours',
  dawn: 'Dawn',
  day: 'Day',
  evening: 'Evening',
  night: 'Night',
  letter: 'Decision letter',
  note: 'Suggestion note',
  parcel: 'Radar parcel',
  flicker: 'CI failures',
  paused: 'Paused',
  locked: 'Access revoked',
  working: 'Running',
  mess: 'Needs attention',
  neutral: 'No progress data',
  failed: 'Verification failed',
  wilted: 'Stalled',
  tank: 'Aquarium',
  books: 'Bookshelf',
  plant: 'Plant',
  files: 'File holder',
  toolbox: 'Toolbox',
  tray: 'Letter tray',
  basket: 'Woven basket',
  lamp: 'Lamp',
  keepsake: 'Keepsake',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  load: 'Loading the mansion…',
  unavailable: 'The mansion could not load. Try again shortly.',
  updateError: 'Your setting was not saved. Try again.',
  noCanvas: 'The scene could not load. Showing the list.',
  pet: 'Da Fei Yu',
  fallback: 'Install the complete package to see her move around the mansion.',
  leaseError: 'The desktop pet could not visit the mansion.',
  summary: 'Completion summary',
  experiences: 'Da Fei Yu’s experiences',
  verifiedTasks: 'tasks passed verification',
}

async function worldCall(connection: ConnectionHandle, method: string, input: unknown, signal?: AbortSignal) {
  const reply = await connection.rpc.call(PANEL_CHANNEL, `${PANEL_PREFIX}/${method}`, input, signal)
  if (!reply.ok) throw reply.error
  return reply.value
}
export async function setWorldPreference(connection: ConnectionHandle, patch: WorldPreferencePatch) {
  return WorldPreferencesSchema.parse(await worldCall(connection, 'world-preferences', patch))
}
export function WorldSwitch({
  connection,
  locale,
  enabled,
  changed,
}: {
  connection: ConnectionHandle
  locale: Locale
  enabled: boolean | undefined
  changed: (enabled: boolean) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const text = worldCopy(locale)
  return h(
    'div',
    { className: 'whalemaid-world-switch' },
    h(
      'label',
      null,
      h('input', {
        type: 'checkbox',
        checked: enabled ?? false,
        disabled: busy || enabled === undefined,
        onChange: async (event: React.ChangeEvent<HTMLInputElement>) => {
          setBusy(true)
          setError(false)
          try {
            changed(
              (await setWorldPreference(connection, { kind: 'enabled', value: event.target.checked }))
                .enabled,
            )
          } catch {
            setError(true)
          } finally {
            setBusy(false)
          }
        },
      }),
      ' ',
      text.enable,
    ),
    error && h('p', { role: 'alert' }, text.updateError),
  )
}

const subscribeMotion = (change: () => void) => {
  const query = matchMedia('(prefers-reduced-motion: reduce)')
  query.addEventListener('change', change)
  return () => query.removeEventListener('change', change)
}
export type Exhibit = WorldSnapshot['gallery'][number]
type Navigation = { onGoal(id: string): void; onNotice(id: string): void; onExhibit(item: Exhibit): void }
const centerOn = (layout: ReturnType<typeof worldLayout>, room: string, zoom: number): Camera => {
  const location = layout.find((item) => item.id === room) ?? layout[0]!
  return { x: location.x + 178, y: location.y + 162, zoom }
}
const basicCamera = { x: 590, y: 320, zoom: 0.72 }
type ViewMode = 'room' | 'overview' | 'list'
const fixedRooms = ['hall', 'kitchen', 'gallery', 'bedroom'] as const
const roomKey = (id: string): NonNullable<Camera['room']> =>
  fixedRooms.find((room) => room === id) ?? GoalIdSchema.parse(id)
const roomZoom = ({ width, height }: { width: number; height: number }) =>
  Math.max(0.35, Math.min(2.5, width / 350, height / 286))

function flags(room: WorldRoom, text: ReturnType<typeof worldCopy>) {
  return [
    room.working && text.working,
    room.mess && text.mess,
    room.decision && text.letter,
    room.card && text.note,
    room.parcel && text.parcel,
    room.flicker && text.flicker,
    room.hold && text.hold,
    room.paused && text.paused,
    room.locked && text.locked,
  ]
    .filter(Boolean)
    .join(' · ')
}

export function MansionView({
  connection,
  locale,
  onGoal,
  onNotice,
  onExhibit,
}: { connection: ConnectionHandle; locale: Locale } & Navigation) {
  const [view, setView] = useState<ReturnType<typeof WorldViewSchema.parse>>()
  const [camera, setCamera] = useState<Camera>()
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [selected, select] = useState<string>()
  const [viewChoice, setViewChoice] = useState<ViewMode>()
  const [focused, setFocused] = useState<string>()
  const [failed, setFailed] = useState(false)
  const [canvasFailed, setCanvasFailed] = useState(false)
  const [preferenceError, setPreferenceError] = useState(false)
  const [art, setArt] = useState<WorldArt>({})
  const reduced = useSyncExternalStore(
    subscribeMotion,
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const text = useMemo(() => worldCopy(locale), [locale])
  const mode = failed || canvasFailed ? 'list' : (viewChoice ?? (reduced ? 'list' : 'room'))
  const list = mode === 'list'
  const still = useCallback(
    async () => WelcomeArtSchema.parse(await worldCall(connection, 'welcome-art', { kind: 'still' })).src,
    [connection],
  )
  const snapshot = view?.snapshot
  const layout = useMemo(() => worldLayout(snapshot?.rooms.map((room) => room.id) ?? []), [snapshot])
  const save = useCallback(
    async (patch: WorldPreferencePatch) => {
      setPreferenceError(false)
      try {
        const preferences = await setWorldPreference(connection, patch)
        setView((previous) => previous && { ...previous, preferences })
      } catch {
        setPreferenceError(true)
      }
    },
    [connection],
  )

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    const load = async () => {
      try {
        const next = WorldViewSchema.parse(await worldCall(connection, 'world', {}, controller.signal))
        if (!controller.signal.aborted) {
          setView(next)
          setFailed(false)
        }
      } catch {
        if (!controller.signal.aborted) setFailed(true)
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(() => void load(), 1400)
      }
    }
    void load()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [connection])
  useEffect(() => {
    if (list || !snapshot) return
    const controller = new AbortController()
    void worldCall(connection, 'world-art', {}, controller.signal)
      .then(async (raw) => {
        const sources = WorldArtSchema.parse(raw)
        const assets: WorldArt = {}
        await Promise.all(
          (['letter', 'bell', 'note'] as const).map(async (kind) => {
            const src = sources[kind]
            if (!src) return
            const image = new Image()
            image.src = src
            try {
              await image.decode()
              assets[kind] = image
            } catch {
              /* Drawing remains available. */
            }
          }),
        )
        if (!controller.signal.aborted) setArt(assets)
      })
      .catch(() => {})
    return () => controller.abort()
  }, [connection, list, !!snapshot])

  if (!view || !snapshot) return h('p', { role: 'status' }, failed ? text.unavailable : text.load)
  const focus = layout.some((item) => item.id === focused) ? focused! : snapshot.actor.room
  const room = mode === 'room' ? roomKey(focus) : undefined
  const saved = camera ?? view.preferences.camera
  const current =
    saved && saved.room === room
      ? saved
      : room
        ? { ...centerOn(layout, room, roomZoom(size)), room }
        : snapshot.rooms.length
          ? basicCamera
          : centerOn(layout, 'hall', 0.85)
  const move = (next: Camera, persist: boolean) => {
    setCamera(next)
    if (persist) void save({ kind: 'camera', value: next })
  }
  const zoom = (by: number) =>
    move({ ...current, zoom: Math.min(2.5, Math.max(0.35, current.zoom * by)) }, true)
  const title = (id: string) =>
    snapshot.rooms.find((item) => item.id === id)?.title ??
    text[fixedRooms.find((item) => item === id) ?? 'hall']
  const open = (hit: Hit) => {
    if (hit.kind === 'goal') onGoal(hit.id)
    else if (hit.kind === 'notice') onNotice(hit.id)
    else if (hit.kind === 'gallery' && hit.id) {
      const exhibit = snapshot.gallery.find((item) => item.id === hit.id)
      if (exhibit) onExhibit(exhibit)
    } else {
      select(hit.id)
      setViewChoice('list')
    }
  }
  return h(
    'section',
    { className: 'whalemaid-world', 'aria-label': text.title },
    h(
      'div',
      { className: 'whalemaid-world-toolbar' },
      h('strong', null, text[snapshot.time]),
      snapshot.quiet && h('span', null, text.quiet),
      snapshot.gateClosed && h('span', null, text.gate),
      h(
        'button',
        {
          type: 'button',
          onClick: () => setViewChoice('room'),
          'aria-pressed': mode === 'room',
          disabled: canvasFailed || failed,
        },
        text.canvas,
      ),
      h(
        'button',
        {
          type: 'button',
          onClick: () => setViewChoice('overview'),
          'aria-pressed': mode === 'overview',
          disabled: canvasFailed || failed,
        },
        text.overview,
      ),
      h('button', { type: 'button', onClick: () => setViewChoice('list'), 'aria-pressed': list }, text.list),
      !list &&
        h(
          'button',
          {
            type: 'button',
            onClick: () => {
              setFocused(undefined)
              if (mode === 'room')
                move(
                  {
                    ...centerOn(layout, snapshot.actor.room, roomZoom(size)),
                    room: roomKey(snapshot.actor.room),
                  },
                  true,
                )
              else move(centerOn(layout, snapshot.actor.room, current.zoom), true)
            },
          },
          text.follow,
        ),
      !list && h('button', { type: 'button', onClick: () => zoom(1.18), 'aria-label': text.zoomIn }, '+'),
      !list &&
        h('button', { type: 'button', onClick: () => zoom(1 / 1.18), 'aria-label': text.zoomOut }, '−'),
    ),
    mode === 'room' &&
      h(
        'label',
        { className: 'whalemaid-world-room-select' },
        text.room,
        ' ',
        h(
          'select',
          {
            value: focus,
            onChange: (event: React.ChangeEvent<HTMLSelectElement>) => setFocused(event.target.value),
          },
          ...Array.from({ length: Math.ceil(layout.length / 4) }, (_, floor) =>
            h(
              'optgroup',
              { key: floor, label: `${text.floor} ${floor + 1}` },
              ...layout
                .filter((item) => item.floor === floor)
                .map((item) => h('option', { key: item.id, value: item.id }, title(item.id))),
            ),
          ),
        ),
      ),
    h(
      'label',
      { className: 'whalemaid-world-option' },
      h('input', {
        type: 'checkbox',
        checked: view.preferences.petWalksIn,
        onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
          void save({ kind: 'petWalksIn', value: event.target.checked }),
      }),
      ' ',
      text.away,
    ),
    preferenceError && h('p', { role: 'alert' }, text.updateError),
    failed && h('p', { role: 'status' }, text.unavailable),
    canvasFailed && h('p', { role: 'status' }, text.noCanvas),
    list
      ? h(
          'div',
          { className: 'whalemaid-world-list' },
          h('p', null, `${text.pet} · ${title(snapshot.actor.room)}`),
          ...snapshot.rooms.map((room) =>
            h(
              'details',
              { key: room.id, open: selected === room.id || undefined },
              h('summary', null, `${room.title} · ${room.passed}/${room.taskCount}`),
              h('p', null, flags(room, text)),
              h('button', { onClick: () => onGoal(room.id) }, room.title),
              room.decision && h('button', { onClick: () => onNotice(room.decision!) }, text.letter),
              room.card && h('button', { onClick: () => onNotice(room.card!) }, text.note),
              h(
                'button',
                { onClick: () => void save({ kind: 'archive', id: room.id, value: true }) },
                text.archive,
              ),
              h(
                'ul',
                null,
                ...room.items.map((item) =>
                  h(
                    'li',
                    { key: item.id },
                    [
                      item.title,
                      text[item.kind],
                      item.state,
                      item.count
                        ? `${item.count.done}/${item.count.total}`
                        : item.ratio !== undefined
                          ? `${Math.round(item.ratio * 100)}%`
                          : item.kind !== 'keepsake' && text.neutral,
                      item.running && text.working,
                      item.failed && text.failed,
                      item.wilted && text.wilted,
                    ]
                      .filter(Boolean)
                      .join(' · '),
                  ),
                ),
              ),
              room.cabinet.length > 0 &&
                h(
                  'details',
                  { open: selected === room.id || undefined },
                  h('summary', null, `${text.cabinet} (${room.cabinet.length})`),
                  h('ul', null, ...room.cabinet.map((item) => h('li', { key: item.id }, item.title))),
                ),
            ),
          ),
          h(
            'details',
            { open: selected === '' || undefined },
            h('summary', null, `${text.gallery} (${snapshot.gallery.length})`),
            ...snapshot.gallery.map((item) =>
              h('button', { key: item.id, onClick: () => onExhibit(item) }, item.title),
            ),
          ),
        )
      : h(WorldCanvas, {
          snapshot,
          layout,
          camera: current,
          size,
          setSize,
          reduced,
          art,
          text,
          away: view.preferences.petWalksIn,
          still,
          move,
          open,
          fail: () => setCanvasFailed(true),
        }),
    h(
      'details',
      { className: 'whalemaid-world-storage' },
      h('summary', null, `${text.storage} (${snapshot.storage.length})`),
      ...snapshot.storage.map((item) =>
        h(
          'p',
          { key: item.id },
          item.title,
          ' ',
          h(
            'button',
            { onClick: () => void save({ kind: 'archive', id: item.id, value: false }) },
            text.restore,
          ),
        ),
      ),
    ),
  )
}

function WorldCanvas({
  snapshot,
  layout,
  camera,
  size,
  setSize,
  reduced,
  art,
  text,
  away,
  still,
  move,
  open,
  fail,
}: {
  snapshot: WorldSnapshot
  layout: ReturnType<typeof worldLayout>
  camera: Camera
  size: { width: number; height: number }
  setSize(size: { width: number; height: number }): void
  reduced: boolean
  art: WorldArt
  text: ReturnType<typeof worldCopy>
  away: boolean
  still: () => Promise<string | undefined>
  move(camera: Camera, persist: boolean): void
  open(hit: Hit): void
  fail(): void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const hits = useRef<Hit[]>([])
  const [hover, setHover] = useState<string>()
  const shade = useRef(worldShade(snapshot))
  const drag = useRef<{ x: number; y: number; camera: Camera; moved: boolean }>(undefined)
  useEffect(() => {
    const element = canvas.current!
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [setSize])
  useEffect(() => {
    const { width, height } = size
    if (!width || !height) return
    const element = canvas.current!,
      g = element.getContext('2d')
    if (!g) {
      fail()
      return
    }
    const ratio = Math.min(2, devicePixelRatio || 1)
    if (element.width !== Math.round(width * ratio) || element.height !== Math.round(height * ratio)) {
      element.width = Math.round(width * ratio)
      element.height = Math.round(height * ratio)
    }
    g.setTransform(ratio, 0, 0, ratio, 0, 0)
    const target = worldShade(snapshot)
    const animated =
      !reduced &&
      !snapshot.quiet &&
      snapshot.rooms.some(
        (room) =>
          (!camera.room || camera.room === room.id) &&
          (room.decision ||
            room.flicker ||
            room.mess ||
            room.items.some((item) => item.kind === 'tank' && item.running)),
      )
    let timer: ReturnType<typeof setTimeout>
    function paint() {
      if (!g) return
      shade.current =
        reduced || Math.abs(target - shade.current) < 0.012
          ? target
          : shade.current + (target - shade.current) * 0.13
      try {
        hits.current = drawWorld(
          g,
          snapshot,
          camera,
          width,
          height,
          text,
          art,
          animated ? performance.now() : 0,
          shade.current,
        )
      } catch {
        fail()
        return
      }
      if (animated || shade.current !== target) timer = setTimeout(paint, 1000 / 24)
    }
    paint()
    return () => clearTimeout(timer)
  }, [size, snapshot, camera, text, art, reduced])
  const find = (event: ReactPointerEvent<HTMLCanvasElement>, roomOnly = false) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - rect.left,
      y = event.clientY - rect.top
    return hits.current.findLast(
      (hit) =>
        (!roomOnly || hit.kind === 'goal') &&
        x >= hit.x &&
        x <= hit.x + hit.w &&
        y >= hit.y &&
        y <= hit.y + hit.h,
    )
  }
  const tooltip = snapshot.rooms.find((room) => room.id === hover && (!camera.room || camera.room === hover))
  const actor = actorPoint(layout, snapshot, camera, { x: size.width / 2, y: size.height / 2 })
  return h(
    'div',
    { className: 'whalemaid-world-scene', 'data-room': camera.room ?? '' },
    h('canvas', {
      ref: canvas,
      'aria-hidden': true,
      onPointerDown: (e: ReactPointerEvent<HTMLCanvasElement>) => {
        if (e.button !== 0) return
        drag.current = { x: e.clientX, y: e.clientY, camera, moved: false }
        e.currentTarget.setPointerCapture(e.pointerId)
      },
      onPointerMove: (e: ReactPointerEvent<HTMLCanvasElement>) => {
        const start = drag.current
        if (!start) {
          setHover(find(e, true)?.id)
          return
        }
        const x = e.clientX - start.x,
          y = e.clientY - start.y
        if (!start.moved && Math.hypot(x, y) < 5) return
        start.moved = true
        move(
          { ...start.camera, x: start.camera.x - x / camera.zoom, y: start.camera.y - y / camera.zoom },
          false,
        )
      },
      onPointerUp: (e: ReactPointerEvent<HTMLCanvasElement>) => {
        const start = drag.current
        drag.current = undefined
        if (start?.moved) move(camera, true)
        else if (start) {
          const hit = find(e)
          if (hit) open(hit)
        }
      },
      onPointerCancel: () => {
        drag.current = undefined
      },
      onPointerLeave: () => setHover(undefined),
    }),
    size.width > 0 &&
      h(WorldStage, {
        position: actor,
        actor: snapshot.actor,
        visible: !camera.room || camera.room === snapshot.actor.room,
        time: snapshot.time,
        quiet: snapshot.quiet || reduced,
        away,
        still,
        label: text.pet,
        fallback: text.fallback,
        leaseError: text.leaseError,
      }),
    tooltip &&
      h(
        'p',
        { className: 'whalemaid-world-tooltip' },
        `${tooltip.title} · ${tooltip.passed}/${tooltip.taskCount}`,
        flags(tooltip, text) && ` · ${flags(tooltip, text)}`,
      ),
  )
}
