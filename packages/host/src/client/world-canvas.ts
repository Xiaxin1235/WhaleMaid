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

// One warm, cohesive palette: cream walls, blue wainscot (her maid colors), honey wood.
const C = {
  floor: '#e9bd8c',
  slabLeft: '#b58a6a',
  slabRight: '#9d7459',
  wallLeft: '#eee2d3',
  wallRight: '#f8efe3',
  stripeLeft: '#e5d6c4',
  stripeRight: '#f1e5d5',
  wainLeft: '#97acd3',
  wainRight: '#b4c5e6',
  trim: '#fffaf3',
  trimShade: '#e6d8c7',
  wood: '#a8724f',
  woodDark: '#865639',
  woodTop: '#cf9a6c',
  woodLine: '#e8b98a',
}
const mix = (a: string, b: string, t: number) => {
  const n = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const [x, y] = [n(a), n(b)]
  return `rgb(${x.map((v, i) => Math.round(v + (y[i]! - v) * t)).join(' ')})`
}
/** An axis-aligned box on the room grid: top, left-front (v + dv) and right-front (u + du) faces. */
function box(
  g: Brush,
  u: number,
  v: number,
  z: number,
  du: number,
  dv: number,
  h: number,
  top: string,
  left: string,
  right: string,
  edge = '#5e46563a',
) {
  poly(
    g,
    [iso(u, v + dv, z), iso(u + du, v + dv, z), iso(u + du, v + dv, z + h), iso(u, v + dv, z + h)],
    left,
    edge,
  )
  poly(
    g,
    [iso(u + du, v, z), iso(u + du, v + dv, z), iso(u + du, v + dv, z + h), iso(u + du, v, z + h)],
    right,
    edge,
  )
  poly(
    g,
    [iso(u, v, z + h), iso(u + du, v, z + h), iso(u + du, v + dv, z + h), iso(u, v + dv, z + h)],
    top,
    edge,
  )
}
const shadowAt = (g: Brush, u: number, v: number, rx: number, ry: number, alpha = 0.18) => {
  const [x, y] = iso(u, v)
  dot(g, x, y, rx, ry, `rgba(74,50,62,${alpha})`)
}

function shell(g: Brush, depth: number, closed: boolean, shade: number, evening = false) {
  const corner = iso(0, 0),
    east = iso(depth, 0),
    south = iso(depth, depth),
    west = iso(0, depth)
  const down = ([x, y]: Point): Point => [x, y + 12]
  dot(g, 178, 244, 168, 50, '#3b2e4a14')
  poly(g, [west, south, down(south), down(west)], C.slabLeft)
  poly(g, [south, east, down(east), down(south)], C.slabRight)
  line(g, west, south, '#fff3df66', 1.5)
  line(g, south, east, '#fff3df44', 1.5)
  // Floor: honey planks with a gentle sheen.
  poly(g, [corner, east, south, west], C.floor)
  for (let i = 1; i < depth * 3; i++) {
    const u = i / 3
    if (i % 2) poly(g, [iso(u - 1 / 3, 0), iso(u, 0), iso(u, depth), iso(u - 1 / 3, depth)], '#fff1d81f')
    line(g, iso(u, 0), iso(u, depth), '#b9875c55')
    const v = (((i * 7) % 5) + 0.6) * (depth / 5.4)
    line(g, iso(u - 1 / 3, v), iso(u, v), '#b9875c44')
  }
  // Walls: cream with soft stripes, slightly darker away from the window.
  const wall = (points: Point[], fill: string, from: string, to: string) => {
    poly(g, points, fill)
    const light = g.createLinearGradient(points[0]![0], 0, points[1]![0], 0)
    light.addColorStop(0, from)
    light.addColorStop(1, to)
    g.fillStyle = light
    g.beginPath()
    points.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
    g.closePath()
    g.fill()
  }
  wall([west, corner, iso(0, 0, 106), iso(0, depth, 106)], C.wallLeft, '#6a52620a', '#6a526224')
  wall([corner, east, iso(depth, 0, 106), iso(0, 0, 106)], C.wallRight, '#6a526218', '#fff8ee00')
  for (let i = 0.3; i < depth; i += 0.38) {
    line(g, iso(i, 0, 36), iso(i, 0, 102), C.stripeRight, 2)
    line(g, iso(0, i, 36), iso(0, i, 102), C.stripeLeft, 2)
  }
  // Blue wainscot with panels, chair rail, baseboard and crown molding.
  poly(g, [corner, west, iso(0, depth, 34), iso(0, 0, 34)], C.wainLeft)
  poly(g, [corner, east, iso(depth, 0, 34), iso(0, 0, 34)], C.wainRight)
  for (let i = 0.42; i + 0.44 < depth; i += 0.62) {
    poly(
      g,
      [iso(0, i, 9), iso(0, i + 0.44, 9), iso(0, i + 0.44, 29), iso(0, i, 29)],
      '#ffffff12',
      '#ffffff66',
    )
    poly(
      g,
      [iso(i, 0, 9), iso(i + 0.44, 0, 9), iso(i + 0.44, 0, 29), iso(i, 0, 29)],
      '#ffffff14',
      '#ffffff80',
    )
  }
  for (const [z, width] of [
    [34, 3],
    [104, 4],
  ] as const) {
    line(g, iso(0, depth, z), iso(0, 0, z), C.trim, width)
    line(g, iso(0, 0, z), iso(depth, 0, z), C.trim, width)
  }
  poly(g, [corner, west, iso(0, depth, 6), iso(0, 0, 6)], C.trimShade)
  poly(g, [corner, east, iso(depth, 0, 6), iso(0, 0, 6)], C.trim)
  line(g, corner, iso(0, 0, 106), '#6a526226', 1.5)
  // Contact shadow where the floor meets the walls.
  for (let k = 0; k < 4; k++) {
    const d = 0.08 + k * 0.09
    poly(
      g,
      [iso(0, 0), iso(depth, 0), iso(depth, d), iso(d, d), iso(d, depth), iso(0, depth)],
      `rgba(90,60,70,${0.07 - k * 0.015})`,
    )
  }
  drawWindow(g, depth, closed, shade, evening)
  drawWallDecor(g, depth)
  drawRug(g, depth)
}

function drawWallDecor(g: Brush, depth: number) {
  // A small framed landscape on the left wall and a round clock beside the window.
  const at = (v: number, z: number) => iso(0, v, z)
  const v0 = depth * 0.1,
    v1 = depth * 0.1 + 0.95
  poly(g, [at(v0, 58), at(v1, 58), at(v1, 88), at(v0, 88)], '#c79a6e', '#8d6248')
  poly(g, [at(v0 + 0.1, 62), at(v1 - 0.1, 62), at(v1 - 0.1, 84), at(v0 + 0.1, 84)], '#dbe7f2')
  poly(g, [at(v0 + 0.1, 62), at(v0 + 0.55, 74), at(v1 - 0.1, 66), at(v1 - 0.1, 62)], '#9cc49a')
  const [sx, sy] = at(v0 + 0.7, 79)
  dot(g, sx, sy, 3, 2.4, '#f6d48b')
  const [cx, cy] = iso(depth * 0.12, 0, 72)
  dot(g, cx, cy, 9.5, 11, '#a8724f')
  dot(g, cx, cy, 7.5, 9, '#fffaf0')
  line(g, [cx, cy], [cx, cy - 6], '#5a4450', 1.5)
  line(g, [cx, cy], [cx + 4, cy + 1], '#5a4450', 1.5)
}

function drawWindow(g: Brush, depth: number, closed: boolean, shade: number, evening: boolean) {
  const a = depth * 0.27,
    b = depth * 0.71,
    mid = (a + b) / 2
  const pane = (left: number, right: number, bottom: number, top: number, fill: string, edge?: string) =>
    poly(g, [iso(left, 0, bottom), iso(right, 0, bottom), iso(right, 0, top), iso(left, 0, top)], fill, edge)
  // Sunlight (or moonlight) falling through the window onto the floor.
  if (!closed)
    poly(
      g,
      [iso(a + 0.15, 0.25), iso(b + 0.1, 0.25), iso(b + 1.2, 2.25), iso(a + 1.1, 2.25)],
      shade > 0.6
        ? 'rgba(190,205,255,0.1)'
        : evening
          ? 'rgba(255,190,130,0.3)'
          : `rgba(255,244,214,${0.42 * (1 - shade)})`,
    )
  pane(a - 0.12, b + 0.12, 33, 90, C.trim, '#cdbba8')
  const sky = g.createLinearGradient(0, iso(a, 0, 88)[1], 0, iso(a, 0, 38)[1])
  sky.addColorStop(0, evening ? '#e59a8c' : mix('#9fc6ee', '#27305e', shade))
  sky.addColorStop(1, evening ? '#fbc98f' : mix('#fde9d6', '#5b5784', shade))
  pane(a, b, 37, 86, '#ffffff')
  g.save()
  g.clip()
  g.fillStyle = sky
  g.fillRect(100, 0, 220, 220)
  if (shade > 0.6) {
    const [mx, my] = iso(a + (b - a) * 0.72, 0, 76)
    dot(g, mx, my, 5, 5, '#fff6d6')
    for (const [du, dz] of [
      [0.2, 80],
      [0.45, 70],
      [0.6, 82],
    ] as const) {
      const [x, y] = iso(a + (b - a) * du, 0, dz)
      dot(g, x, y, 0.9, 0.9, '#ffffff')
    }
  } else {
    const [hx, hy] = iso(a + (b - a) * 0.35, 0, 52)
    dot(g, hx, hy, 18, 5, '#ffffff55')
  }
  g.restore()
  line(g, iso(mid, 0, 37), iso(mid, 0, 86), C.trim, 2.5)
  line(g, iso(a, 0, 61), iso(b, 0, 61), C.trim, 2.5)
  line(g, iso(a - 0.2, 0, 35), iso(b + 0.2, 0, 35), '#f6ece0', 4)
  line(g, iso(a - 0.4, 0, 95), iso(b + 0.4, 0, 95), C.wood, 2.5)
  for (const [edge, direction] of [
    [a, 1],
    [b, -1],
  ] as const) {
    const curtain = (offset: number, z: number) => iso(edge + direction * offset, 0, z)
    const reach = closed ? (b - a) / 2 + 0.02 : 0.38
    poly(
      g,
      [
        curtain(-0.26, 94),
        curtain(reach, 94),
        curtain(closed ? reach : 0.06, 58),
        curtain(reach * 0.9, 30),
        curtain(-0.3, 30),
      ],
      direction > 0 ? '#f2c3cf' : '#f6d0d9',
      '#d9a2b2',
    )
    line(g, curtain(-0.1, 92), curtain(-0.14, 32), '#ffffff70', 2)
    if (!closed) line(g, curtain(-0.28, 58), curtain(0.12, 58), '#c9a26a', 2.5)
  }
}

function drawRug(g: Brush, depth: number) {
  // An oval rug in her blue and white.
  const center = depth * 0.55
  const ring = (r: number) =>
    Array.from({ length: 36 }, (_, i) => {
      const t = (i / 36) * Math.PI * 2
      return iso(center + Math.cos(t) * r, center + Math.sin(t) * r * 0.82, 1)
    })
  poly(g, ring(depth * 0.27), '#7f97c9')
  poly(g, ring(depth * 0.25), '#f7f2ea')
  poly(g, ring(depth * 0.21), '#a9bce0')
  poly(g, ring(depth * 0.12), '#c9d6ee')
}

function drawDoor(g: Brush, depth: number) {
  const center = depth * 0.65
  const left = center - 0.55,
    right = center + 0.55
  const panel = (a: number, b: number, bottom: number, top: number, fill: string, edge?: string) =>
    poly(g, [iso(0, a, bottom), iso(0, b, bottom), iso(0, b, top), iso(0, a, top)], fill, edge)
  panel(left - 0.1, right + 0.1, 0, 75, C.trim, '#d8c7b4')
  panel(left, right, 0, 71, C.wood, C.woodDark)
  panel(left + 0.14, right - 0.14, 38, 65, '#bb8460', '#d29d74')
  panel(left + 0.14, right - 0.14, 8, 30, '#bb8460', '#d29d74')
  const [x, y] = iso(0, left + 0.2, 34)
  dot(g, x, y, 2.4, 2.4, '#f2cd7c')
}

type Wall = 'left' | 'right'
const wallView =
  ([u, v]: Point, wall: Wall) =>
  (along: number, outward: number, z = 0) =>
    wall === 'left' ? iso(u + outward, v + along, z) : iso(u + along, v + outward, z)

function drawCabinet(g: Brush, at: Point, wall: Wall, books?: WorldProp) {
  const view = wallView(at, wall)
  const half = books ? 0.7 : 0.64
  const height = books ? 45 : 15
  const front = (a: number, b: number, low: number, high: number, fill: string, edge?: string) =>
    poly(g, [view(a, 0.32, low), view(b, 0.32, low), view(b, 0.32, high), view(a, 0.32, high)], fill, edge)
  poly(
    g,
    [view(half, -0.32), view(half, 0.32), view(half, 0.32, height), view(half, -0.32, height)],
    C.woodDark,
    '#6e452d',
  )
  front(-half, half, 0, height, C.wood, C.woodDark)
  poly(
    g,
    [
      view(-half, -0.32, height),
      view(half, -0.32, height),
      view(half, 0.32, height),
      view(-half, 0.32, height),
    ],
    C.woodTop,
    C.woodDark,
  )
  if (!books) {
    front(-0.44, 0.44, 3, 12, '#bb8460', C.woodDark)
    line(g, view(-0.13, 0.32, 7.5), view(0.13, 0.32, 7.5), '#e4bf85', 1.6)
    return
  }
  for (let row = 0; row < 2; row++) {
    const base = 4 + row * 20
    front(-0.59, 0.59, base, base + 16, '#7b4e34', C.woodDark)
    line(g, view(-0.61, 0.32, base), view(0.61, 0.32, base), '#d8ad91', 1.7)
    if (books.ratio !== undefined)
      for (let n = 0; n < 5 && n + row * 5 < Math.ceil(books.ratio * 10); n++) {
        const spine = -0.52 + n * 0.21
        front(spine, spine + 0.17, base + 1, base + 13, ['#6f8fc7', '#f0c27d', '#e59aa9', '#8cc3a6'][n % 4]!)
        line(g, view(spine + 0.03, 0.32, base + 10), view(spine + 0.14, 0.32, base + 10), '#f6ddad')
      }
  }
}

function drawTank(g: Brush, item: WorldProp, at: Point, wall: Wall, elapsed: number) {
  const view = wallView(at, wall)
  const face = (low: number, high: number, glass: string, side: string, edge?: string) => {
    poly(
      g,
      [view(0.59, -0.27, low), view(0.59, 0.27, low), view(0.59, 0.27, high), view(0.59, -0.27, high)],
      side,
      edge,
    )
    poly(
      g,
      [view(-0.59, 0.27, low), view(0.59, 0.27, low), view(0.59, 0.27, high), view(-0.59, 0.27, high)],
      glass,
      edge,
    )
  }
  face(15, 44, '#d8e6e8', '#aac2ca', '#77959f')
  if (item.ratio !== undefined && item.ratio > 0) {
    const water = 16 + item.ratio * 25
    face(16, water, item.failed ? '#958b7b' : '#619ca7', item.failed ? '#7d756d' : '#50828e')
    line(g, view(-0.59, 0.27, water), view(0.59, 0.27, water), item.failed ? '#c9b6a1' : '#bee0e0')
  }
  poly(
    g,
    [view(-0.59, -0.27, 44), view(0.59, -0.27, 44), view(0.59, 0.27, 44), view(-0.59, 0.27, 44)],
    '#c9e2e6',
    '#77959f',
  )
  line(g, view(-0.47, 0.27, 40), view(-0.47, 0.27, 29), '#f3fcfa', 1.5)
  if (item.running)
    for (let i = 0; i < 3; i++)
      dot(g, ...view(-0.28 + i * 0.23, 0.27, 17 + ((elapsed / 75 + i * 8) % 22)), 1.5, 1.5, '#fffefabf')
}

function propMeter(g: Brush, item: WorldProp, x: number, y: number) {
  if (item.failed || item.wilted) dot(g, x + 17, y + 2, 3.2, 3.2, item.failed ? '#ae515e' : '#bc884d')
  if (item.ratio !== undefined) {
    rect(g, x - 15, y + 6, 30, 3, '#f4ded8', 1)
    if (item.ratio > 0) rect(g, x - 15, y + 6, 30 * item.ratio, 3, '#497e82', 1)
  }
}

function furniture(g: Brush, item: WorldProp, x: number, y: number) {
  dot(g, x, y + 4, 19, 6.5, 'rgba(74,50,62,0.16)')
  const ratio = item.ratio
  if (item.kind === 'plant') {
    const height = 6 + 31 * (ratio ?? 0)
    const tip = y - 8 - height
    const lean = item.wilted ? 8 : 0
    const leaf = item.wilted ? '#a78167' : ratio === undefined ? '#8f9188' : '#6a9b80'
    line(g, [x, y - 9], [x + lean, tip], item.wilted ? '#96705a' : '#497460', 1.5)
    dot(g, x + lean - 6, tip + 5, 7.5, 3.8, leaf)
    dot(g, x + lean + 5, tip + 1, 6, 3.4, leaf)
    line(g, [x + lean - 10, tip + 5], [x + lean - 3, tip + 7], '#f0e8ba68')
    line(g, [x + lean + 2, tip + 3], [x + lean + 8, tip + 1], '#f0e8ba68')
    poly(
      g,
      [
        [x - 11, y - 11],
        [x + 11, y - 11],
        [x + 7, y + 2],
        [x - 7, y + 2],
      ],
      '#769295',
      '#556f78',
    )
    line(g, [x - 8, y - 4], [x + 8, y - 4], '#ded1ad', 2)
    dot(g, x, y - 11, 11, 3.6, '#b9c7b6')
    dot(g, x, y - 11, 8.5, 2.1, '#78655b')
  } else if (item.kind === 'lamp') {
    if (item.running) {
      const halo = g.createRadialGradient(x, y - 19, 1, x, y - 19, 41)
      halo.addColorStop(0, '#ffd7828c')
      halo.addColorStop(1, '#ffd78200')
      g.fillStyle = halo
      g.fillRect(x - 42, y - 62, 84, 84)
    }
    dot(g, x, y, 10, 3, '#87675d')
    line(g, [x, y], [x, y - 29], '#a78459', 2.5)
    line(g, [x - 1, y - 3], [x - 1, y - 18], '#d9b680')
    poly(
      g,
      [
        [x - 7, y - 34],
        [x + 7, y - 34],
        [x + 14, y - 18],
        [x - 14, y - 18],
      ],
      item.running ? '#ffe2a1' : '#d9c6b6',
      '#ae8f7a',
    )
    for (const pleat of [-1, 0, 1]) line(g, [x + pleat * 4, y - 33], [x + pleat * 8, y - 19], '#f7e1bc')
    dot(g, x, y - 18, 13, 2, item.running ? '#fff3c3' : '#a7877b')
  } else if (item.kind === 'files') {
    rect(g, x - 15, y - 27, 30, 25, '#667d8b', 2)
    rect(g, x - 11, y - 33, 19, 19, '#f1e1c7', 1)
    rect(g, x - 9, y - 36, 17, 19, '#a8889a', 1)
    rect(g, x - 5, y - 29, 16, 17, '#e5c49c', 1)
    poly(
      g,
      [
        [x - 15, y - 18],
        [x + 15, y - 18],
        [x + 13, y],
        [x - 13, y],
      ],
      '#5d7789',
      '#495e72',
    )
    rect(g, x - 6, y - 13, 12, 6, '#cfa87b', 1)
    line(g, [x - 3, y - 10], [x + 3, y - 10], '#7b6267')
  } else if (item.kind === 'toolbox') {
    rect(g, x - 7, y - 27, 14, 8, '#7a5b5a', 3)
    rect(g, x - 4, y - 25, 8, 4, '#c09a78', 1)
    rect(g, x - 18, y - 21, 36, 21, '#a17369', 3)
    rect(g, x - 18, y - 21, 36, 7, '#b88b78', 2)
    line(g, [x - 17, y - 13], [x + 17, y - 13], '#795853')
    for (const latch of [-10, 10]) rect(g, x + latch - 2, y - 16, 4, 6, '#e2b979', 1)
  } else if (item.kind === 'tray') {
    rect(g, x - 18, y - 14, 36, 15, '#825f69', 3)
    rect(g, x - 15, y - 12, 30, 10, '#b28677', 2)
    rect(g, x - 12, y - 16, 22, 11, '#d6b18c', 1)
    rect(g, x - 10, y - 18, 20, 11, '#f0ddc1', 1)
    for (const row of [-15, -12]) line(g, [x - 7, y + row], [x + 6, y + row], '#c09e87')
    line(g, [x - 16, y - 3], [x + 16, y - 3], '#c99f84', 2)
  } else if (item.kind === 'basket') {
    poly(
      g,
      [
        [x - 17, y - 14],
        [x + 17, y - 14],
        [x + 13, y],
        [x - 13, y],
      ],
      '#b68b65',
      '#927059',
    )
    dot(g, x, y - 14, 17, 5.5, '#805f55')
    rect(g, x - 12, y - 17, 17, 7, '#dbd7d4', 2)
    line(g, [x - 7, y - 17], [x - 7, y - 11], '#8192a9', 2)
    for (const row of [-10, -6, -2]) line(g, [x - 13, y + row], [x + 13, y + row], '#e4c396')
  } else if (item.kind === 'keepsake') {
    rect(g, x - 14, y - 5, 28, 7, C.woodDark)
    line(g, [x - 11, y - 3], [x + 11, y - 3], C.woodLine)
    poly(
      g,
      [
        [x - 8, y - 11],
        [x - 15, y - 20],
        [x - 9, y - 19],
        [x - 5, y - 13],
      ],
      '#92b6bc',
    )
    dot(g, x + 2, y - 11, 11, 6, '#b9cfd0')
    dot(g, x + 7, y - 13, 1, 1, '#566477')
    line(g, [x + 1, y - 20], [x + 1, y - 24], '#bacdd0')
    dot(g, x + 4, y - 24, 1.4, 1.1, '#e0ece8')
  }
  propMeter(g, item, x, y)
}

const sharedDesk: Point = [3.65, 1.42]
const roomDepth = (room?: WorldRoom) => (room?.slots === 4 ? 4.9 : room?.slots === 6 ? 5.35 : 5.85)
const projectDesk = (depth: number): Point => [depth * 0.7, depth * 0.7]

function drawRoomFurniture(g: Brush, room: WorldRoom, depth: number, elapsed: number) {
  const deskPlace = projectDesk(depth)
  const pieces = room.items.slice(0, room.slots)
  const take = (kinds: readonly WorldProp['kind'][]) => {
    const index = pieces.findIndex(({ kind }) => kinds.includes(kind))
    return index < 0 ? undefined : pieces.splice(index, 1)[0]
  }
  const lamp = take(['lamp'])
  const papers = take(['tray']) ?? take(['files'])
  const sites: { at: Point; wall?: Wall; kinds: readonly WorldProp['kind'][] }[] = [
    { at: [0.55, depth * 0.29], wall: 'left', kinds: ['books'] },
    { at: [2.11, 0.55], wall: 'right', kinds: ['tank'] },
    { at: [0.58, depth - 0.68], wall: 'left', kinds: ['toolbox', 'basket'] },
    { at: [depth - 0.48, 1.81], kinds: ['basket', 'toolbox'] },
    { at: [0.53, 0.47], wall: 'right', kinds: ['plant'] },
    { at: [0.58, depth * 0.65 - 1.03], wall: 'left', kinds: ['keepsake'] },
    { at: [depth - 0.72, 0.54], wall: 'right', kinds: ['files', 'tray'] },
    { at: [3.42, 0.54], wall: 'right', kinds: [] },
  ]
  const preferred = sites.map(({ kinds }) => take(kinds))
  const placements = sites.map(({ at, wall }, i) => ({ at, wall, piece: preferred[i] ?? pieces.shift() }))
  placements.push({ at: deskPlace, wall: undefined, piece: undefined })
  placements.sort((a, b) => a.at[0] + a.at[1] - b.at[0] - b.at[1])
  for (const { at, wall, piece } of placements) {
    if (at === deskPlace) {
      desk(g, ...at, lamp, papers)
      pouf(g, at[0] - 0.65, at[1] + 1.25)
      continue
    }
    if (!piece) continue
    if (
      piece.kind === 'books' ||
      piece.kind === 'tank' ||
      piece.kind === 'files' ||
      piece.kind === 'keepsake'
    ) {
      const center: Point =
        wall === 'left'
          ? [0.35, Math.max(0.72, at[1])]
          : wall === 'right'
            ? [Math.max(0.72, at[0]), 0.35]
            : at
      const face = wall ?? 'right'
      drawCabinet(g, center, face, piece.kind === 'books' ? piece : undefined)
      if (piece.kind === 'tank') drawTank(g, piece, center, face, elapsed)
      if (piece.kind === 'books' || piece.kind === 'tank') propMeter(g, piece, ...iso(...center))
      else furniture(g, piece, ...iso(...center, 15))
    } else furniture(g, piece, ...iso(...at))
  }
}

/** A round cushioned pouf beside the desk; the pet sits on it while working. */
function pouf(g: Brush, u: number, v: number) {
  const [x, y] = iso(u, v)
  dot(g, x, y + 3, 19, 7, 'rgba(74,50,62,0.18)')
  g.beginPath()
  g.ellipse(x, y - 1, 16, 7, 0, 0, Math.PI)
  g.lineTo(x - 16, y - 12)
  g.ellipse(x, y - 12, 16, 7, 0, Math.PI, 0, true)
  g.closePath()
  g.fillStyle = '#e48ea4'
  g.fill()
  dot(g, x, y - 12, 16, 7, '#f5b4c4')
  dot(g, x, y - 12.5, 3, 1.5, '#d97b93')
  line(g, [x - 15, y - 6], [x + 15, y - 6], '#f7c7d3', 1.5)
}

function desk(g: Brush, u: number, v: number, lamp?: WorldProp, papers?: WorldProp) {
  const corner = (du: number, dv: number, z = 0) => iso(u + du, v + dv, z)
  const [x, y] = iso(u, v)
  dot(g, x, y + 5, 36, 12, 'rgba(74,50,62,0.16)')
  const corners: Point[] = [
    [-0.78, -0.5],
    [0.78, -0.5],
    [0.78, 0.5],
    [-0.78, 0.5],
  ]
  for (const [du, dv] of corners) {
    line(g, corner(du, dv), corner(du, dv, 33), C.woodDark, 3.5)
    line(g, corner(du, dv, 30), corner(du, dv, 33), C.wood, 3.5)
  }
  const top = corners.map(([du, dv]) => corner(du, dv, 37))
  const rim = corners.map(([du, dv]) => corner(du, dv, 32))
  poly(g, [top[1]!, top[2]!, rim[2]!, rim[1]!], C.wood)
  poly(g, [top[2]!, top[3]!, rim[3]!, rim[2]!], C.woodDark)
  poly(
    g,
    [corner(-0.53, 0.49, 32), corner(0.52, 0.49, 32), corner(0.52, 0.49, 22), corner(-0.53, 0.49, 22)],
    '#bb8460',
    C.woodDark,
  )
  line(g, corner(-0.12, 0.5, 27), corner(0.12, 0.5, 27), '#f2cd7c', 2)
  poly(g, top, C.woodTop, C.woodDark)
  line(g, corner(-0.74, -0.45, 38), corner(0.74, -0.45, 38), C.woodLine)
  line(g, corner(-0.74, 0.45, 38), corner(0.74, 0.45, 38), C.woodLine)
  if (!papers) {
    poly(
      g,
      [corner(-0.54, -0.14, 38), corner(0.15, -0.14, 38), corner(0.15, 0.29, 38), corner(-0.54, 0.29, 38)],
      '#fff3df',
    )
    for (const row of [-0.04, 0.07, 0.18]) line(g, corner(-0.41, row, 38), corner(0.04, row, 38), '#b59c92')
  }
  if (!lamp) {
    const [cupX, cupY] = corner(0.43, -0.13, 38)
    dot(g, cupX, cupY, 6.2, 3, '#f7ead2')
    dot(g, cupX + 3.3, cupY - 3.2, 2.6, 2.4, '#d8e7df')
    rect(g, cupX - 3.6, cupY - 6, 7.4, 6, '#b5ccc7', 2)
    dot(g, cupX, cupY - 6, 3.6, 1.7, '#e9efe0')
    dot(g, cupX, cupY - 5.6, 2.4, 1, '#8b6555')
  }
  for (const [piece, at] of [
    [papers, corner(-0.37, 0.06, 37)],
    [lamp, corner(0.39, -0.2, 37)],
  ] as const) {
    if (!piece) continue
    g.save()
    g.translate(...at)
    g.scale(0.62, 0.62)
    furniture(g, piece, 0, 0)
    g.restore()
  }
}

function hall(g: Brush) {
  // A tall plant in the corner.
  const [cx, cy] = iso(0.55, 0.55)
  dot(g, cx, cy + 3, 15, 5, 'rgba(74,50,62,0.18)')
  poly(
    g,
    [
      [cx - 11, cy - 16],
      [cx + 11, cy - 16],
      [cx + 8, cy + 1],
      [cx - 8, cy + 1],
    ],
    '#e9e1d4',
    '#c9bba8',
  )
  for (const [dx, dy, r] of [
    [-8, -34, 9],
    [7, -40, 10],
    [-2, -52, 9],
    [9, -26, 7],
    [-10, -22, 7],
  ] as const)
    dot(g, cx + dx, cy + dy, r, r * 0.6, '#6fa883')
  for (const [dx, dy] of [
    [-6, -36],
    [5, -43],
    [0, -54],
  ] as const)
    dot(g, cx + dx, cy + dy, 3.5, 1.6, '#98c9a4')
  shadowAt(g, 0.95, 2.55, 46, 16)
  // Sofa against the left wall.
  box(g, 0.25, 1.5, 0, 1.1, 2.2, 13, '#9fb3dc', '#7f96c8', '#8fa6d3')
  box(g, 0.25, 1.5, 13, 0.32, 2.2, 22, '#b2c4e6', '#8aa0cf', '#9db2dc')
  box(g, 0.25, 1.32, 0, 1.1, 0.24, 24, '#b2c4e6', '#7f96c8', '#9db2dc')
  box(g, 0.25, 3.7, 0, 1.1, 0.24, 24, '#b2c4e6', '#7f96c8', '#9db2dc')
  for (const v of [1.65, 2.65]) box(g, 0.62, v, 13, 0.62, 0.9, 5, '#f7f2ea', '#e2d9cc', '#ece4d8')
  const [px, py] = iso(0.75, 2.2, 22)
  dot(g, px, py, 8, 6, '#f2c3cf')
  // Round coffee table with a teapot.
  shadowAt(g, 3.35, 1.75, 30, 11)
  const [tx, ty] = iso(3.35, 1.75)
  line(g, [tx, ty], [tx, ty - 16], C.woodDark, 4)
  dot(g, tx, ty - 17, 26, 11, C.wood)
  dot(g, tx, ty - 19, 26, 11, C.woodTop)
  dot(g, tx - 6, ty - 22, 6, 4, '#ffffff')
  dot(g, tx - 6, ty - 25, 4, 3, '#dfe9f6')
  dot(g, tx + 9, ty - 21, 4, 2, '#f7ead2')
}

function kitchen(g: Brush, depth: number) {
  // Counter under the window with a sink and a kettle.
  const end = depth - 0.3
  box(g, 0.9, 0.1, 0, end - 0.9, 0.75, 28, '#f7f1e8', '#e6dccd', '#efe6d9')
  box(g, 0.88, 0.08, 28, end - 0.86, 0.8, 3, C.woodTop, C.wood, C.wood)
  for (let u = 1.15; u < end - 0.3; u += 0.62) {
    const [x, y] = iso(u + 0.25, 0.85, 14)
    rect(g, x - 2, y - 1, 6, 2, '#c9a26a', 1)
  }
  const [sx, sy] = iso(depth * 0.5, 0.45, 31)
  dot(g, sx, sy, 13, 5, '#c7d3df')
  dot(g, sx, sy, 10, 3.6, '#9eb3c6')
  line(g, iso(depth * 0.5, 0.12, 31), iso(depth * 0.5, 0.12, 42), '#b8c4cf', 2.5)
  const [kx, ky] = iso(end - 0.55, 0.45, 31)
  dot(g, kx, ky - 6, 7, 7, '#e48ea4')
  rect(g, kx - 3, ky - 15, 6, 3, '#c96f86', 1)
  // Stove on the left wall.
  box(g, 0.1, 1.0, 0, 0.8, 1.15, 28, '#5b6378', '#474e61', '#525a6e')
  for (const v of [1.25, 1.75]) {
    const [bx, by] = iso(0.5, v + 0.05, 28)
    dot(g, bx, by, 7, 3, '#363b4a')
    dot(g, bx, by, 4, 1.8, '#e07a5f')
  }
  // Open shelf with jars.
  const shelf = [iso(0, 2.6, 66), iso(0, 3.8, 66), iso(0.3, 3.8, 66), iso(0.3, 2.6, 66)]
  poly(g, shelf, C.woodTop, C.woodDark)
  for (const [v, c] of [
    [2.8, '#f0c27d'],
    [3.15, '#8cc3a6'],
    [3.5, '#e59aa9'],
  ] as const) {
    const [jx, jy] = iso(0.15, v, 66)
    rect(g, jx - 5, jy - 12, 10, 12, c, 3)
    rect(g, jx - 5, jy - 14, 10, 3, '#fffaf3', 1)
  }
  // Small table with two stools.
  shadowAt(g, 2.9, 2.9, 30, 11)
  const [tx, ty] = iso(2.9, 2.9)
  line(g, [tx, ty], [tx, ty - 18], C.woodDark, 4)
  dot(g, tx, ty - 19, 24, 10, C.wood)
  dot(g, tx, ty - 21, 24, 10, '#f7f2ea')
  dot(g, tx - 4, ty - 23, 5, 2.4, '#f0c27d')
  for (const [u, v] of [
    [2.1, 3.6],
    [3.6, 2.2],
  ] as const) {
    const [x, y] = iso(u, v)
    line(g, [x, y], [x, y - 11], C.woodDark, 3)
    dot(g, x, y - 12, 10, 4, '#e48ea4')
  }
}

function bed(g: Brush) {
  const point = (u: number, v: number, height: number) => iso(2.55 + u, 1 + v, height)
  const bedding = (from: number, to: number, z: number, color: string, edge: string) =>
    poly(g, [point(from, 0, z), point(to, 0, z), point(to, 1.55, z), point(from, 1.55, z)], color, edge)
  poly(g, [point(0, 0, 0), point(2.65, 0, 0), point(2.65, 1.55, 0), point(0, 1.55, 0)], '#4d384b30')
  poly(g, [point(0, 1.55, 2), point(2.65, 1.55, 2), point(2.65, 1.55, 20), point(0, 1.55, 20)], C.wood)
  poly(g, [point(2.65, 0, 2), point(2.65, 1.55, 2), point(2.65, 1.55, 20), point(2.65, 0, 20)], C.woodDark)
  bedding(0, 2.65, 20, '#f0dfd2', '#ae929c')
  poly(g, [point(0, 0, 19), point(0, 1.55, 19), point(0, 1.55, 43), point(0, 0, 43)], C.wood, C.woodDark)
  line(g, point(0, 0.18, 38), point(0, 1.38, 38), '#d0a88f', 2)
  bedding(0.93, 2.56, 22, '#9fb3dc', '#7f96c8')
  for (const stitch of [1.15, 1.48, 1.82, 2.15, 2.48])
    line(g, point(stitch, 0.09, 23), point(stitch, 1.44, 23), '#c9d6ee')
  const [x, y] = point(0.44, 0.77, 24)
  dot(g, x, y, 16, 7, '#fff4e9')
  // Nightstand with a lamp beside the head of the bed.
  box(g, 2.6, 2.75, 0, 0.7, 0.7, 22, C.woodTop, C.wood, C.woodDark)
  const [lx, ly] = iso(2.95, 3.1, 22)
  line(g, [lx, ly], [lx, ly - 12], '#c9a26a', 2)
  poly(
    g,
    [
      [lx - 6, ly - 20],
      [lx + 6, ly - 20],
      [lx + 9, ly - 11],
      [lx - 9, ly - 11],
    ],
    '#ffe2a1',
    '#d9b47a',
  )
  box(g, 0.12, 2.9, 0, 0.75, 1.5, 70, C.woodTop, C.wood, C.woodDark)
  line(g, iso(0.87, 3.65, 6), iso(0.87, 3.65, 66), '#6e452d', 1.5)
  for (const v of [3.5, 3.8]) {
    const [hx, hy] = iso(0.87, v, 36)
    dot(g, hx, hy, 1.6, 2.4, '#f2cd7c')
  }
}

const shadeFor = { dawn: 0.24, day: 0, evening: 0.39, night: 0.77 }
export const worldShade = (world: WorldSnapshot) =>
  world.quiet ? Math.max(0.6, shadeFor[world.time]) : shadeFor[world.time]
export function actorPoint(
  layout: ReturnType<typeof worldLayout>,
  world: WorldSnapshot,
  camera: Camera,
  offset: { x: number; y: number },
) {
  const { actor } = world
  const room = layout.find((r) => r.id === actor.room) ?? layout[0]!
  const project = world.rooms.find((r) => r.id === actor.room)
  const [u, v] = project ? projectDesk(roomDepth(project)) : sharedDesk
  const [x, y] = actor.door
    ? [263, 256]
    : actor.motion === 'sit-work'
      ? iso(u - 0.65, v + 1.25, 14)
      : actor.motion === 'sleep' && actor.room === 'bedroom'
        ? iso(3.4, 1.8, 22)
        : [178, 221]
  return {
    x: (room.x + x - camera.x) * camera.zoom + offset.x,
    y: (room.y + y - camera.y) * camera.zoom + offset.y,
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
  const evening = world.time === 'evening' ? 1 : 0
  const dusk = evening ? shade * 0.35 : shade
  background.addColorStop(0, mix(evening ? '#f4c3a3' : '#e7eefb', '#1e2547', dusk))
  background.addColorStop(1, mix(evening ? '#fde3cf' : '#fbf2e9', '#3a3a62', dusk))
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
    const depth = roomDepth(room)
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
    shell(g, depth, !!room?.paused || (id === 'hall' && world.gateClosed), shade, world.time === 'evening')
    if (room) {
      tag(28, 47, 300, 247, 'goal', id)
      drawDoor(g, depth)
      drawRoomFurniture(g, room, depth, elapsed)
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
          i % 2 ? '#fff6e8' : '#c8b8a6',
        )
        if (elapsed) dot(g, dx + Math.sin(i + elapsed / 450) * 4, dy - 11, 2, 1, '#f9e6ce')
      }
    } else {
      if (id === 'bedroom') bed(g)
      if (id === 'hall') hall(g)
      if (id === 'kitchen') kitchen(g, depth)
      if (id === 'gallery') {
        dot(g, 176, 222, 86, 14, 'rgba(74,50,62,0.16)')
        rect(g, 106, 208, 7, 11, C.woodDark)
        rect(g, 240, 208, 7, 11, C.woodDark)
        rect(g, 100, 157, 153, 58, C.wood, 6)
        rect(g, 105, 161, 143, 47, C.woodTop, 4)
        rect(g, 109, 165, 135, 38, '#eef3fb', 3)
        rect(g, 109, 165, 135, 12, '#ffffff99', 3)
        line(g, [109, 199], [244, 199], C.woodLine, 2)
        world.gallery.slice(0, 6).forEach((item, index) => {
          const cx = 119 + 22 * index
          dot(g, cx, 184, 7, 9, '#bb8d60')
          dot(g, cx, 183.5, 5.2, 6.5, '#e9c78e')
          dot(g, cx - 1.2, 182, 1.8, 2.7, '#fae3a9')
          rect(g, cx - 6, 193, 12, 4, '#856370')
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
        world.time === 'evening' ? `rgba(245,140,90,${glow * 0.3})` : `rgba(20,28,72,${glow})`,
      )
    if (room?.working) {
      const [lightX, lightY] = iso(...projectDesk(depth), 20)
      const light = g.createRadialGradient(lightX, lightY, 4, lightX, lightY, 90)
      light.addColorStop(0, `rgba(255,214,130,${0.25 + shade * 0.35})`)
      light.addColorStop(1, '#ffd98400')
      g.fillStyle = light
      g.fillRect(lightX - 90, lightY - 90, 180, 180)
    }
    if (room?.flicker && elapsed)
      dot(g, 214, 126, 10, 8, Math.floor(elapsed / 600) % 2 ? '#e9bf6c' : '#f5d29c55')
    const title = room?.title ?? labels[id as 'hall' | 'bedroom' | 'gallery' | 'kitchen']
    const chip = room ? `${room.passed}/${room.taskCount}` : ''
    rect(g, 96, 279, 164, 24, 'rgba(74,50,62,0.12)', 12)
    rect(g, 96, 276, 164, 24, '#fffaf3', 12)
    if (chip) {
      rect(g, 216, 280, 38, 16, room?.working ? '#b4c5e6' : '#f1e5d5', 8)
      print(g, chip, 235, 292, '#4f5f8a', 10)
    }
    print(g, title, chip ? 158 : 178, 293, '#5a4450', 12, chip ? 112 : 150)
    if (room) {
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
        rect(g, 45, 207, 39, 30, '#795969')
        rect(g, 49, 210, 31, 10, '#9a6f76', 1)
        rect(g, 49, 223, 31, 10, '#9a6f76', 1)
        line(g, [60, 228], [69, 228], '#dcb67e', 2)
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
