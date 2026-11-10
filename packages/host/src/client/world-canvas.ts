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
  poly(g, [west, south, down(south), down(west)], '#72556a')
  poly(g, [south, east, down(east), down(south)], '#8b6472')
  poly(g, [corner, east, south, west], '#d8aa8b', '#a47772')
  for (let i = 1; i < depth * 3; i++) {
    const u = i / 3
    if (i % 3 === 1)
      poly(g, [iso(u - 1 / 3, 0), iso(u, 0), iso(u, depth), iso(u - 1 / 3, depth)], '#fff2d633')
    line(g, iso(u, 0), iso(u, depth), '#90665356')
    const v = (((i % 4) + 1) * depth) / 5
    line(g, iso(u - 1 / 3, v), iso(u, v), '#966f6b6b')
  }
  poly(g, [corner, west, iso(0, depth, 106), iso(0, 0, 106)], '#aaa2c2', '#8a7f9e')
  poly(g, [corner, east, iso(depth, 0, 106), iso(0, 0, 106)], '#d4c5d7', '#a995ad')
  for (let i = 0.25; i < depth; i += 0.42) {
    line(g, iso(i, 0, 28), iso(i, 0, 104), '#fff4f353', 1.5)
    line(g, iso(0, i, 28), iso(0, i, 104), '#ede0f34b', 1.5)
  }
  poly(g, [corner, west, iso(0, depth, 26), iso(0, 0, 26)], '#9186a6')
  poly(g, [corner, east, iso(depth, 0, 26), iso(0, 0, 26)], '#afa0b7')
  for (let i = 0.55; i < depth; i += 0.56) {
    line(g, iso(i, 0, 5), iso(i, 0, 24), '#8a769b66')
    line(g, iso(0, i, 5), iso(0, i, 24), '#6f638266')
  }
  for (const z of [4, 26, 103]) {
    line(g, iso(0, depth, z), iso(0, 0, z), '#e5d4de', 2)
    line(g, iso(0, 0, z), iso(depth, 0, z), '#fae9e2', 2)
  }
  drawWindow(g, depth, closed, shade)
  drawRug(g, depth)
}

function drawWindow(g: Brush, depth: number, closed: boolean, shade: number) {
  const a = depth * 0.27,
    b = depth * 0.71,
    mid = (a + b) / 2
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
  pane(a - 0.1, b + 0.1, 35, 89, '#8e778e')
  pane(a, b, 37, 86, '#dac7db')
  g.save()
  g.clip()
  g.fillStyle = sky
  g.fillRect(170, 55, 140, 140)
  g.restore()
  line(g, iso(a - 0.14, 0, 37), iso(b + 0.14, 0, 37), '#fff1ea', 4)
  line(g, iso(mid, 0, 37), iso(mid, 0, 86), '#f6edf1', 2)
  line(g, iso(a, 0, 61), iso(b, 0, 61), '#f6edf1', 2)
  line(g, iso(a - 0.35, 0, 94), iso(b + 0.35, 0, 94), '#ae8866', 2.5)
  for (const [edge, direction] of [
    [a, 1],
    [b, -1],
  ] as const) {
    const curtain = (offset: number, z: number) => iso(edge + direction * offset, 0, z)
    const reach = closed ? (b - a) / 2 : 0.42
    poly(
      g,
      [
        curtain(-0.24, 92),
        curtain(reach, 92),
        curtain(closed ? reach : 0.08, 56),
        curtain(reach, 31),
        curtain(-0.28, 31),
      ],
      direction > 0 ? '#77709b' : '#8f7fa8',
      '#716689',
    )
    line(g, curtain(-0.08, 90), curtain(-0.13, 33), '#c6b4cb85', 2)
    if (!closed) line(g, curtain(-0.25, 55), curtain(0.13, 55), '#eacb91', 2)
  }
}

function drawRug(g: Brush, depth: number) {
  const at = (u: number, v: number) => iso(u * depth, v * depth, 1)
  const patch = (a: number, b: number, c: number, d: number, color: string, edge: string) =>
    poly(g, [at(a, b), at(c, b), at(c, d), at(a, d)], color, edge)
  patch(0.33, 0.33, 0.77, 0.79, '#766488', '#f2d3bd')
  patch(0.36, 0.36, 0.74, 0.76, '#a18ba6', '#dcbfa9')
  patch(0.39, 0.39, 0.71, 0.73, '#af96ac', '#d0aec0')
  poly(g, [at(0.55, 0.43), at(0.67, 0.56), at(0.55, 0.69), at(0.43, 0.56)], '#caabb7', '#e6cbbf')
  const [x, y] = at(0.55, 0.56)
  dot(g, x, y, 9, 4, '#f0d8c2')
  for (let u = 0.35; u < 0.77; u += 0.035) line(g, at(u, 0.79), at(u, 0.808), '#ecd5ba')
}

function drawDoor(g: Brush, depth: number) {
  const center = depth * 0.65
  const left = center - 0.55,
    right = center + 0.55
  const panel = (a: number, b: number, bottom: number, top: number, fill: string, edge: string) =>
    poly(g, [iso(0, a, bottom), iso(0, b, bottom), iso(0, b, top), iso(0, a, top)], fill, edge)
  panel(left - 0.08, right + 0.08, 0, 73, '#e3cab8', '#af8c93')
  panel(left, right, 0, 70, '#926f7c', '#765965')
  panel(left + 0.13, right - 0.13, 36, 64, '#a9818b', '#c29aa0')
  panel(left + 0.13, right - 0.13, 7, 25, '#a6818b', '#c29aa0')
  const [x, y] = iso(0, left + 0.18, 31)
  dot(g, x, y, 2, 3.2, '#775965')
  dot(g, x + 0.55, y - 0.4, 1.8, 1.8, '#e3bc7e')
}

function furniture(g: Brush, item: WorldProp, x: number, y: number, elapsed: number) {
  dot(g, x, y + 4, 20, 7, '#473e5736')
  const ratio = item.ratio
  if (item.kind === 'tank') {
    rect(g, x - 20, y - 36, 40, 34, '#77959f', 4)
    rect(g, x - 18, y - 34, 36, 30, '#d8e6e8', 2)
    if (ratio !== undefined) {
      const surface = y - 5 - ratio * 27
      rect(g, x - 17, surface, 34, Math.max(2, ratio * 27), item.failed ? '#958b7b' : '#619ca7', 2)
      line(g, [x - 15, surface + 1], [x + 15, surface + 1], item.failed ? '#c9b6a1' : '#bee0e0')
    }
    poly(
      g,
      [
        [x + 10, y - 33],
        [x + 16, y - 33],
        [x + 4, y - 7],
        [x, y - 7],
      ],
      '#f2ffff52',
    )
    line(g, [x - 15, y - 30], [x - 15, y - 19], '#f3fcfa', 1.5)
    if (item.running)
      for (let i = 0; i < 3; i++)
        dot(g, x - 9 + i * 7, y - 5 - ((elapsed / 75 + i * 8) % 24), 1.6, 1.6, '#fffefabf')
    rect(g, x - 21, y - 5, 42, 7, '#755461')
    line(g, [x - 19, y - 3], [x + 19, y - 3], '#c79a74')
  } else if (item.kind === 'books') {
    rect(g, x - 19, y - 43, 38, 43, '#7d5965')
    poly(
      g,
      [
        [x + 19, y - 43],
        [x + 24, y - 47],
        [x + 24, y - 5],
        [x + 19, y],
      ],
      '#5c485b',
    )
    poly(
      g,
      [
        [x - 19, y - 43],
        [x - 14, y - 47],
        [x + 24, y - 47],
        [x + 19, y - 43],
      ],
      '#aa827b',
    )
    for (let row = 0; row < 2; row++) {
      const shelf = y - 40 + row * 19
      rect(g, x - 16, shelf, 32, 16, '#b98c7b', 1)
      line(g, [x - 16, shelf + 16], [x + 16, shelf + 16], '#deb899', 1.5)
      if (ratio !== undefined)
        for (let n = 0; n < 5; n++) {
          if (n + row * 5 >= Math.ceil(ratio * 10)) break
          const spine = x - 14 + n * 6
          rect(g, spine, shelf + 3, 5, 13, ['#567987', '#e0b585', '#a5758f'][n % 3]!, 1)
          line(g, [spine + 1, shelf + 6], [spine + 4, shelf + 6], '#f6ddad')
        }
    }
  } else if (item.kind === 'plant') {
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
  } else {
    rect(g, x - 14, y - 5, 28, 7, '#725761')
    line(g, [x - 11, y - 3], [x + 11, y - 3], '#bd906d')
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
  if (item.failed || item.wilted) dot(g, x + 17, y + 2, 3.2, 3.2, item.failed ? '#ae515e' : '#bc884d')
  if (ratio !== undefined) {
    rect(g, x - 15, y + 6, 30, 3, '#f4ded8', 1)
    if (ratio > 0) rect(g, x - 15, y + 6, 30 * ratio, 3, '#497e82', 1)
  }
}

const deskPlace: Point = [3.65, 1.42]
const workSeat = iso(deskPlace[0] - 0.65, deskPlace[1] + 1.25)

function drawRoomFurniture(g: Brush, room: WorldRoom, depth: number, elapsed: number) {
  const pieces = room.items.slice(0, room.slots)
  const take = (kinds: readonly WorldProp['kind'][]) => {
    const index = pieces.findIndex(({ kind }) => kinds.includes(kind))
    return index < 0 ? undefined : pieces.splice(index, 1)[0]
  }
  const lamp = take(['lamp'])
  const papers = take(['tray']) ?? take(['files'])
  const sites: { at: Point; kinds: readonly WorldProp['kind'][] }[] = [
    { at: [0.55, depth * 0.29], kinds: ['books'] },
    { at: [2.11, 0.55], kinds: ['tank'] },
    { at: [0.58, depth - 0.53], kinds: ['toolbox', 'basket'] },
    { at: [depth - 0.48, 1.81], kinds: ['basket', 'toolbox'] },
    { at: [0.53, 0.47], kinds: ['plant'] },
    { at: [0.58, depth * 0.65 - 1.03], kinds: ['keepsake'] },
    { at: [depth - 0.65, 0.54], kinds: ['files', 'tray'] },
    { at: [3.42, 0.54], kinds: [] },
  ]
  const preferred = sites.map(({ kinds }) => take(kinds))
  const placements = sites.map(({ at }, i) => ({ at, piece: preferred[i] ?? pieces.shift() }))
  placements.push({ at: deskPlace, piece: undefined })
  placements.sort((a, b) => a.at[0] + a.at[1] - b.at[0] - b.at[1])
  for (const { at, piece } of placements) {
    if (at === deskPlace) {
      desk(g, ...at, elapsed, lamp, papers)
      continue
    }
    if (!piece) continue
    const [x, y] = iso(...at)
    if (piece.kind === 'tank' || piece.kind === 'files' || piece.kind === 'keepsake') {
      rect(g, x - 14, y - 12, 28, 13, '#795a67', 2)
      rect(g, x - 17, y - 14, 34, 4, '#bd937e', 1)
      line(g, [x - 4, y - 6], [x + 4, y - 6], '#d6ae78', 1.5)
      furniture(g, piece, x, y - 13, elapsed)
    } else furniture(g, piece, x, y, elapsed)
  }
}

function desk(g: Brush, u: number, v: number, elapsed: number, lamp?: WorldProp, papers?: WorldProp) {
  const corner = (du: number, dv: number, z = 0) => iso(u + du, v + dv, z)
  const [x, y] = iso(u, v)
  dot(g, x, y + 5, 34, 11, '#72527240')
  const corners: Point[] = [
    [-0.78, -0.5],
    [0.78, -0.5],
    [0.78, 0.5],
    [-0.78, 0.5],
  ]
  for (const [du, dv] of corners) {
    line(g, corner(du, dv), corner(du, dv, 33), '#78525d', 3.5)
    line(g, corner(du, dv), corner(du, dv, 4), '#c1966d', 2.5)
  }
  const top = corners.map(([du, dv]) => corner(du, dv, 37))
  const rim = corners.map(([du, dv]) => corner(du, dv, 32))
  poly(g, [top[1]!, top[2]!, rim[2]!, rim[1]!], '#9c6970')
  poly(g, [top[2]!, top[3]!, rim[3]!, rim[2]!], '#79545f')
  poly(
    g,
    [corner(-0.53, 0.49, 32), corner(0.52, 0.49, 32), corner(0.52, 0.49, 22), corner(-0.53, 0.49, 22)],
    '#94636c',
    '#75525d',
  )
  line(g, corner(-0.12, 0.5, 27), corner(0.12, 0.5, 27), '#e2b878', 2)
  poly(g, top, '#d1a181', '#a27173')
  line(g, corner(-0.74, -0.45, 38), corner(0.74, -0.45, 38), '#e8b997')
  line(g, corner(-0.74, 0.45, 38), corner(0.74, 0.45, 38), '#e8b997')
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
    furniture(g, piece, 0, 0, elapsed)
    g.restore()
  }
}

function bed(g: Brush) {
  const point = (u: number, v: number, height: number) => iso(2.55 + u, 1 + v, height)
  const bedding = (from: number, to: number, z: number, color: string, edge: string) =>
    poly(g, [point(from, 0, z), point(to, 0, z), point(to, 1.55, z), point(from, 1.55, z)], color, edge)
  poly(g, [point(0, 0, 0), point(2.65, 0, 0), point(2.65, 1.55, 0), point(0, 1.55, 0)], '#4d384b30')
  poly(g, [point(0, 1.55, 2), point(2.65, 1.55, 2), point(2.65, 1.55, 20), point(0, 1.55, 20)], '#785b70')
  poly(g, [point(2.65, 0, 2), point(2.65, 1.55, 2), point(2.65, 1.55, 20), point(2.65, 0, 20)], '#a1818c')
  bedding(0, 2.65, 20, '#f0dfd2', '#ae929c')
  poly(g, [point(0, 0, 19), point(0, 1.55, 19), point(0, 1.55, 43), point(0, 0, 43)], '#876779', '#6a566d')
  line(g, point(0, 0.18, 38), point(0, 1.38, 38), '#d0a88f', 2)
  bedding(0.93, 2.56, 22, '#9ca4bc', '#7883a0')
  for (const stitch of [1.15, 1.48, 1.82, 2.15, 2.48])
    line(g, point(stitch, 0.09, 23), point(stitch, 1.44, 23), '#c0bdce')
  const [x, y] = point(0.44, 0.77, 24)
  dot(g, x, y, 16, 7, '#fff4e9')
}

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
  const [x, y] = actor.door ? [263, 256] : actor.motion === 'sit-work' ? workSeat : [178, 221]
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
          i % 2 ? '#efd3b9' : '#a884aa',
        )
        if (elapsed) dot(g, dx + Math.sin(i + elapsed / 450) * 4, dy - 11, 2, 1, '#f9e6ce')
      }
    } else {
      if (id === 'bedroom') bed(g)
      if (id === 'hall' || id === 'kitchen') desk(g, ...deskPlace, elapsed)
      if (id === 'gallery') {
        rect(g, 106, 208, 7, 11, '#7b5565')
        rect(g, 240, 208, 7, 11, '#7b5565')
        rect(g, 100, 157, 153, 58, '#815d6f', 6)
        rect(g, 105, 161, 143, 47, '#c99d7e', 4)
        rect(g, 109, 165, 135, 38, '#cdb2ac', 3)
        line(g, [109, 199], [244, 199], '#e8c1a1', 2)
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
        `rgba(32,31,73,${glow})`,
      )
    if (room?.working) {
      const [lightX, lightY] = iso(...deskPlace, 20)
      const light = g.createRadialGradient(lightX, lightY, 4, lightX, lightY, 72)
      light.addColorStop(0, '#ffd98448')
      light.addColorStop(1, '#ffd98400')
      g.fillStyle = light
      g.fillRect(lightX - 72, lightY - 72, 144, 144)
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
