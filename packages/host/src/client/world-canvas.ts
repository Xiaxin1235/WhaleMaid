import { worldLayout } from '@whalemaid/core'
import type { WorldPreferences, WorldProp, WorldRoom, WorldSnapshot } from '@whalemaid/core'

export type Camera = NonNullable<WorldPreferences['camera']>
export type Hit = {
  x: number
  y: number
  w: number
  h: number
  id: string
  kind: 'goal' | 'notice' | 'gallery' | 'cabinet'
}
export type WorldArt = Partial<Record<'bell' | 'letter' | 'note', HTMLImageElement>>
type Point = readonly [number, number]
type Brush = CanvasRenderingContext2D
export type WorldLabels = {
  hall: string
  kitchen: string
  gallery: string
  bedroom: string
  floor: string
  hold: string
  gate: string
  more: string
}

const iso = (u: number, v: number, z = 0): Point => [178 + (u - v) * 25, 146 + (u + v) * 12.5 - z]
const poly = (g: Brush, points: Point[], color: string, outline?: string) => {
  g.beginPath()
  points.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
  g.closePath()
  g.fillStyle = color
  g.fill()
  if (outline) {
    g.strokeStyle = outline
    g.stroke()
  }
}
const rect = (g: Brush, x: number, y: number, w: number, h: number, color: string, radius = 3) => {
  g.beginPath()
  g.roundRect(x, y, w, h, radius)
  g.fillStyle = color
  g.fill()
}
const line = (g: Brush, a: Point, b: Point, color: string, width = 1) => {
  g.beginPath()
  g.moveTo(...a)
  g.lineTo(...b)
  g.strokeStyle = color
  g.lineWidth = width
  g.stroke()
  g.lineWidth = 1
}
const dot = (g: Brush, x: number, y: number, rx: number, ry: number, color: string) => {
  g.beginPath()
  g.ellipse(x, y, rx, ry, 0, 0, 2 * Math.PI)
  g.fillStyle = color
  g.fill()
}
const print = (g: Brush, value: string, x: number, y: number, color: string, size = 13, max?: number) => {
  g.font = `600 ${size}px system-ui, sans-serif`
  g.fillStyle = color
  g.textAlign = 'center'
  if (max) {
    const letters = Array.from(value)
    while (
      letters.length > 1 &&
      g.measureText(letters.join('') + (letters.length < Array.from(value).length ? '…' : '')).width > max
    )
      letters.pop()
    if (letters.length < Array.from(value).length) value = letters.join('') + '…'
  }
  g.fillText(value, x, y)
}

function shell(g: Brush, depth: number, closed: boolean, shade: number) {
  const corner = iso(0, 0),
    east = iso(depth, 0),
    south = iso(depth, depth),
    west = iso(0, depth)
  const down = ([x, y]: Point): Point => [x, y + 12]
  dot(g, 178, 240, 162, 52, '#26365616')
  poly(g, [west, south, down(south), down(west)], '#776986')
  poly(g, [south, east, down(east), down(south)], '#98829b')
  poly(g, [corner, east, south, west], '#dbad8f', '#ae8089')
  for (let i = 1; i < depth * 3; i++) {
    const u = i / 3
    if (u >= depth) break
    line(g, iso(u, 0), iso(u, depth), i % 3 ? '#9165552c' : '#af7f70')
    const v = (((i % 4) + 1) * depth) / 5
    line(g, iso(u - 1 / 3, v), iso(u, v), '#966f6b6b')
  }
  poly(g, [corner, west, iso(0, depth, 106), iso(0, 0, 106)], '#b5a7d3', '#8e80ac')
  poly(g, [corner, east, iso(depth, 0, 106), iso(0, 0, 106)], '#d9c7de', '#a894b3')
  for (let i = 0.3; i < depth; i += 0.32) {
    line(g, iso(i, 0, 10), iso(i, 0, 105), '#fff4f355', 2)
    line(g, iso(0, i, 10), iso(0, i, 105), '#e0cceb55', 2)
  }
  for (const z of [3, 8, 103]) {
    line(g, iso(0, depth, z), iso(0, 0, z), '#f4dfed', 3)
    line(g, iso(0, 0, z), iso(depth, 0, z), '#f4dfed', 3)
  }
  const a = depth * 0.27,
    b = depth * 0.71
  const pane = (left: number, right: number, bottom: number, top: number, fill: string) =>
    poly(
      g,
      [iso(left, 0, bottom), iso(right, 0, bottom), iso(right, 0, top), iso(left, 0, top)],
      fill,
      '#f6edf1',
    )
  const sky = g.createLinearGradient(200, 76, 236, 145)
  sky.addColorStop(
    0,
    `rgb(${Math.round(157 - shade * 93)} ${Math.round(188 - shade * 111)} ${Math.round(222 - shade * 92)})`,
  )
  sky.addColorStop(
    1,
    `rgb(${Math.round(255 - shade * 87)} ${Math.round(224 - shade * 101)} ${Math.round(214 - shade * 44)})`,
  )
  poly(g, [iso(a, 0, 37), iso(b, 0, 37), iso(b, 0, 86), iso(a, 0, 86)], '#dac7db')
  g.save()
  g.clip()
  g.fillStyle = sky
  g.fillRect(170, 55, 140, 140)
  g.restore()
  line(g, iso(a, 0, 37), iso(b, 0, 37), '#fff1ea', 4)
  line(g, iso((a + b) / 2, 0, 37), iso((a + b) / 2, 0, 86), '#f6edf1', 2)
  line(g, iso(a, 0, 61), iso(b, 0, 61), '#f6edf1', 2)
  pane(a - 0.15, a + (closed ? (b - a) / 2 : 0.27), 31, 90, '#997ca5')
  pane(b - (closed ? (b - a) / 2 : 0.27), b + 0.15, 31, 90, '#b093b4')
  const rug: Point[] = [
    [0.33, 0.33],
    [0.76, 0.33],
    [0.76, 0.78],
    [0.33, 0.78],
  ].map(([u, v]) => iso(u! * depth, v! * depth))
  poly(g, rug, '#9c84ae', '#f2d3da')
  poly(
    g,
    [
      [0.38, 0.38],
      [0.71, 0.38],
      [0.71, 0.73],
      [0.38, 0.73],
    ].map(([u, v]) => iso(u! * depth, v! * depth)),
    '#b99ab9',
    '#d9b4cd',
  )
  const [rugX, rugY] = iso(depth * 0.55, depth * 0.56)
  dot(g, rugX, rugY, 19, 8, '#e3bed0')
  dot(g, rugX, rugY, 9, 4, '#fae4de')
}

function furniture(g: Brush, item: WorldProp, x: number, y: number, elapsed: number) {
  dot(g, x, y + 4, 20, 7, '#473e5736')
  const ratio = item.ratio
  if (item.kind === 'tank') {
    rect(g, x - 19, y - 35, 38, 34, '#d7edf1', 5)
    if (ratio !== undefined)
      rect(g, x - 16, y - 3 - ratio * 28, 32, Math.max(2, ratio * 28), item.failed ? '#8f897f' : '#64b1bf', 2)
    line(g, [x - 14, y - 30], [x - 7, y - 30], '#fffefa', 2)
    if (item.running)
      for (let i = 0; i < 3; i++)
        dot(g, x - 9 + i * 7, y - 4 - ((elapsed / 75 + i * 8) % 24), 2, 2, '#fffefa')
    rect(g, x - 20, y - 4, 40, 6, '#827890')
  } else if (item.kind === 'books') {
    rect(g, x - 18, y - 42, 36, 44, '#936a73')
    for (let row = 0; row < 2; row++) {
      rect(g, x - 15, y - 39 + row * 20, 30, 16, '#d4ac98', 1)
      if (ratio !== undefined)
        for (let n = 0; n < 5; n++) {
          if (n + row * 5 >= Math.ceil(ratio * 10)) break
          rect(g, x - 14 + n * 6, y - 37 + row * 20, 5, 14, ['#719da9', '#f1d6a4', '#b77a9d'][n % 3]!, 1)
        }
    }
  } else if (item.kind === 'plant') {
    const height = 6 + 31 * (ratio ?? 0)
    const tip = y - 8 - height
    line(g, [x, y - 8], [x + (item.wilted ? 10 : 0), tip], item.wilted ? '#96705a' : '#517e70', 2)
    const leaf = item.wilted ? '#b48c67' : ratio === undefined ? '#96938c' : '#7aa486'
    dot(g, x - 6, tip + 5, 8, 4, leaf)
    dot(g, x + 6, tip + 2, 7, 4, leaf)
    poly(
      g,
      [
        [x - 12, y - 11],
        [x + 12, y - 11],
        [x + 8, y + 2],
        [x - 8, y + 2],
      ],
      '#b67473',
    )
    dot(g, x, y - 11, 12, 3, '#775b5a')
  } else if (item.kind === 'lamp') {
    if (item.running) {
      const halo = g.createRadialGradient(x, y - 19, 1, x, y - 19, 41)
      halo.addColorStop(0, '#ffd7828c')
      halo.addColorStop(1, '#ffd78200')
      g.fillStyle = halo
      g.fillRect(x - 42, y - 62, 84, 84)
    }
    line(g, [x, y], [x, y - 27], '#956d60', 3)
    poly(
      g,
      [
        [x - 7, y - 32],
        [x + 7, y - 32],
        [x + 15, y - 17],
        [x - 15, y - 17],
      ],
      item.running ? '#ffe3a3' : '#b6a6ab',
    )
    dot(g, x, y, 10, 3, '#976e75')
  } else {
    rect(g, x - 12, y - 5, 24, 7, '#845d6f')
    dot(g, x, y - 13, 10, 9, '#dfaeb5')
    dot(g, x - 7, y - 21, 4, 4, '#dfaeb5')
    dot(g, x + 7, y - 21, 4, 4, '#dfaeb5')
    dot(g, x - 3, y - 15, 1.4, 1.4, '#654866')
    dot(g, x + 3, y - 15, 1.4, 1.4, '#654866')
  }
  if (item.failed) dot(g, x + 13, y - 29, 4, 4, '#ae515e')
  if (ratio !== undefined) {
    rect(g, x - 15, y + 6, 30, 3, '#f4ded8', 1)
    if (ratio > 0) rect(g, x - 15, y + 6, 30 * ratio, 3, '#497e82', 1)
  }
}

const propPlaces: Point[] = [
  [0.15, 0.29],
  [0.31, 0.15],
  [0.17, 0.52],
  [0.53, 0.17],
  [0.22, 0.76],
  [0.76, 0.22],
  [0.51, 0.84],
  [0.84, 0.51],
]
const shadeFor = { dawn: 0.24, day: 0, evening: 0.39, night: 0.77 }
export const worldShade = (world: WorldSnapshot) =>
  world.quiet ? Math.max(0.6, shadeFor[world.time]) : shadeFor[world.time]
export function actorPoint(
  layout: ReturnType<typeof worldLayout>,
  actor: WorldSnapshot['actor'],
  camera: Camera,
  offset: { x: number; y: number },
) {
  const room = layout.find((r) => r.id === actor.room) ?? layout[0]!
  return {
    x: (room.x + (actor.door ? 263 : 178) - camera.x) * camera.zoom + offset.x,
    y: (room.y + (actor.door ? 256 : 221) - camera.y) * camera.zoom + offset.y,
    scale: camera.zoom,
  }
}

export function drawWorld(
  g: Brush,
  world: WorldSnapshot,
  camera: Camera,
  width: number,
  height: number,
  labels: WorldLabels,
  art: WorldArt,
  elapsed: number,
  shade: number,
): Hit[] {
  const background = g.createLinearGradient(0, 0, 0, height)
  background.addColorStop(
    0,
    `rgb(${Math.round(226 - shade * 160)} ${Math.round(223 - shade * 163)} ${Math.round(245 - shade * 148)})`,
  )
  background.addColorStop(
    1,
    `rgb(${Math.round(251 - shade * 170)} ${Math.round(234 - shade * 165)} ${Math.round(228 - shade * 122)})`,
  )
  g.fillStyle = background
  g.fillRect(0, 0, width, height)
  const hits: Hit[] = []
  const offset = { x: width / 2, y: height / 2 }
  g.save()
  g.translate(offset.x, offset.y)
  g.scale(camera.zoom, camera.zoom)
  g.translate(-camera.x, -camera.y)
  const place = worldLayout(world.rooms.map((room) => room.id))
  const byId = new Map<string, WorldRoom>(world.rooms.map((room) => [room.id, room]))
  for (const { id, floor, x, y } of place) {
    if (camera.room && camera.room !== id) continue
    const px = (x - camera.x) * camera.zoom + offset.x,
      py = (y - camera.y) * camera.zoom + offset.y
    if (px > width || px + 365 * camera.zoom < 0 || py > height || py + 310 * camera.zoom < 0) continue
    const room = byId.get(id)
    const depth = room?.slots === 4 ? 4.9 : room?.slots === 6 ? 5.35 : 5.85
    const tag = (localX: number, localY: number, w: number, h: number, kind: Hit['kind'], id: string) =>
      hits.push({
        x: px + localX * camera.zoom,
        y: py + localY * camera.zoom,
        w: w * camera.zoom,
        h: h * camera.zoom,
        kind,
        id,
      })
    g.save()
    g.translate(x, y)
    if (x === 0 && !camera.room) {
      rect(g, 24, 8, 86, 23, '#fff5e9b6', 11)
      print(g, `${labels.floor} ${floor + 1}`, 67, 24, '#645174', 11)
    }
    shell(g, depth, !!room?.paused || (id === 'hall' && world.gateClosed), shade)
    if (room) {
      tag(28, 47, 300, 247, 'goal', id)
      const door = [
        iso(0, depth * 0.47),
        iso(0, depth * 0.82),
        iso(0, depth * 0.82, 67),
        iso(0, depth * 0.47, 67),
      ]
      poly(g, door, '#a97782', '#f3d8dc')
      const [knobX, knobY] = iso(0, depth * 0.55, 31)
      dot(g, knobX, knobY, 3, 3, '#f3cb83')
      room.items
        .slice(0, room.slots)
        .map((item, index) => ({ item, at: propPlaces[index]! }))
        .sort((a, b) => a.at[0] + a.at[1] - b.at[0] - b.at[1])
        .forEach(({ item, at }) => furniture(g, item, ...iso(at[0] * depth, at[1] * depth), elapsed))
      for (let i = 0; i < room.mess * 2; i++) {
        const [dx, dy] = iso(depth * (0.37 + i * 0.072), depth * (0.75 - (i % 3) * 0.12))
        poly(
          g,
          [
            [dx - 8, dy],
            [dx + 4, dy - 5],
            [dx + 11, dy],
            [dx, dy + 5],
          ],
          i % 2 ? '#efd3b9' : '#a884aa',
        )
        if (elapsed) dot(g, dx + Math.sin(i + elapsed / 450) * 4, dy - 11, 2, 1, '#f9e6ce')
      }
    } else {
      const [fx, fy] = iso(3.9, 1.4)
      if (id === 'bedroom') {
        rect(g, fx - 31, fy - 23, 63, 34, '#815d79', 9)
        rect(g, fx - 28, fy - 21, 58, 23, '#dbc1de', 8)
        rect(g, fx + 8, fy - 19, 19, 16, '#f8e1e9', 6)
      }
      if (id === 'hall' || id === 'kitchen') {
        dot(g, fx, fy + 10, 32, 11, '#72527240')
        rect(g, fx - 23, fy - 18, 46, 22, '#926972', 8)
        dot(g, fx, fy - 17, 25, 10, '#d7a58f')
        dot(g, fx - 7, fy - 19, 6, 4, '#f2ded3')
        dot(g, fx + 9, fy - 14, 7, 4, '#f7e4e0')
      }
      if (id === 'gallery') {
        rect(g, 100, 157, 153, 58, '#936b7c', 9)
        rect(g, 107, 163, 139, 45, '#dfbca9', 6)
        world.gallery.slice(0, 6).forEach((item, index) => {
          const cx = 119 + 22 * index
          dot(g, cx, 185, 7, 9, '#efc680')
          rect(g, cx - 6, 193, 12, 4, '#8c6470')
          tag(cx - 10, 169, 21, 33, 'gallery', item.id)
        })
        if (world.gallery.length > 6) {
          print(g, `+${world.gallery.length - 6}`, 176, 230, '#3b2946')
          tag(139, 215, 72, 23, 'gallery', '')
        }
      }
    }
    const glow = room?.working ? shade * 0.2 : shade * 0.4 + (room?.paused ? 0.1 : 0)
    if (glow > 0)
      poly(
        g,
        [
          iso(0, depth, 106),
          iso(0, 0, 106),
          iso(depth, 0, 106),
          iso(depth, 0),
          iso(depth, depth),
          iso(0, depth),
        ],
        `rgba(32,31,73,${glow})`,
      )
    if (room?.working) {
      const light = g.createRadialGradient(178, 201, 4, 178, 201, 72)
      light.addColorStop(0, '#ffd98448')
      light.addColorStop(1, '#ffd98400')
      g.fillStyle = light
      g.fillRect(106, 129, 144, 144)
    }
    if (room?.flicker && elapsed)
      dot(g, 214, 126, 10, 8, Math.floor(elapsed / 600) % 2 ? '#e9bf6c' : '#f5d29c55')
    rect(g, 101, 276, 154, 23, '#fff0eb', 10)
    const title = room?.title ?? labels[id as 'hall' | 'bedroom' | 'gallery' | 'kitchen']
    print(g, title, 178, 292, '#594160', 12, 140)
    if (room) {
      print(g, `${room.passed}/${room.taskCount}`, 178, 269, '#462f4b', 11)
      if (room.hold) {
        rect(g, 107, 76, 117, 21, '#f2d0b4', 6)
        print(g, labels.hold, 165, 90, '#724347', 11, 106)
        dot(g, 229, 232, 8, 4, '#705673')
        dot(g, 239, 224, 7, 4, '#705673')
      }
      if (room.locked) {
        rect(g, 260, 221, 18, 14, '#846477')
        dot(g, 269, 219, 7, 6, '#af858c')
        rect(g, 263, 219, 12, 4, '#e0b786')
      }
      if (room.parcel) {
        rect(g, 272, 241, 25, 19, '#d29f70')
        line(g, [284, 242], [284, 259], '#f9e1b1', 3)
      }
      if (room.decision) {
        const drift = elapsed ? Math.sin(elapsed / 220) * 2 : 0
        if (art.bell) g.drawImage(art.bell, 245 + drift, 162, 19, 22)
        else {
          dot(g, 255 + drift, 175, 7, 8, '#ebc284')
          rect(g, 249 + drift, 178, 13, 3, '#d3a266', 1)
        }
        if (art.letter) g.drawImage(art.letter, 239, 187, 32, 25)
        else {
          rect(g, 239, 187, 32, 23, '#fff4e7')
          poly(
            g,
            [
              [239, 188],
              [255, 201],
              [271, 188],
            ],
            '#f2d7c9',
          )
          dot(g, 255, 200, 3, 3, '#a15c81')
        }
        tag(236, 182, 38, 31, 'notice', room.decision)
      }
      if (room.card) {
        if (art.note) g.drawImage(art.note, 76, 164, 32, 31)
        else {
          rect(g, 75, 163, 35, 34, '#a97872')
          rect(g, 83, 167, 21, 25, '#f7e6ac', 2)
          dot(g, 92, 170, 2, 2, '#b97b92')
          line(g, [86, 177], [100, 177], '#b59976')
          line(g, [86, 181], [98, 181], '#b59976')
        }
        tag(72, 159, 40, 42, 'notice', room.card)
      }
      const extra = room.cabinet.length + Math.max(0, room.items.length - room.slots)
      if (extra) {
        rect(g, 45, 207, 39, 30, '#a4717a')
        line(g, [49, 221], [80, 221], '#f3c5b1', 2)
        print(g, `+${extra}`, 64, 218, '#fff0db', 10)
        tag(41, 202, 47, 40, 'cabinet', id)
      }
    }
    if (id === 'hall' && world.gateClosed) {
      rect(g, 136, 163, 84, 61, '#8d687c', 7)
      for (let x = 146; x < 215; x += 10) line(g, [x, 170], [x, 220], '#f0c3ae', 2)
      rect(g, 112, 174, 132, 27, '#e7c4ad')
      print(g, labels.gate, 178, 192, '#6a404d', 12, 125)
    }
    g.restore()
  }
  g.restore()
  return hits
}
