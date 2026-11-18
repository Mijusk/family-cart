// The drawings of Estiramientos: one flat, friendly figure built from its joints, so all the
// stretches share the same character and style. Pure: a pose in, an SVG string out (only numbers
// and fixed colours go into it, so v-html is safe). Design notes: docs/estiramientos.md.
//
// Coordinates are on a 200×160 board; the mat is at y = `floor`. Each limb lists its joints from
// the body outwards; `far` limbs are the ones on the other side of the body, drawn darker and behind.

export type Point = readonly [number, number]

export interface Arm {
  shoulder: Point
  elbow: Point
  hand: Point
  far?: boolean
}

export interface Leg {
  hip: Point
  knee: Point
  foot: Point
  far?: boolean
}

export interface Head {
  center: Point
  /** Degrees, clockwise. */
  tilt?: number
  /** Facing us, or in profile looking left or right. */
  face?: 'front' | 'left' | 'right'
}

/** A dotted arrow showing where the stretch goes: from, a control point to curve it, to. */
export type Arrow = readonly [Point, Point, Point]

export interface Pose {
  neck: Point
  hip: Point
  /** Where the neck meets the head. */
  headNeck: Point
  head: Head
  arms: Arm[]
  legs: Leg[]
  arrows?: Arrow[]
  /** Half widths of the body at the shoulders and the waist (narrower in profile). */
  shoulders?: number
  waist?: number
  /** Draw the near arms over the head (a hand pulling it), the near legs over the body (knees to chest). */
  armsOverHead?: boolean
  legsOverBody?: boolean
  /** Flip it left to right: the same stretch on the other side. */
  mirror?: boolean
  /** What is under the figure: a mat (default), just the floor, or a chair seen from the front or the side. */
  scene?: Scene
}

export type Scene = 'mat' | 'floor' | 'chair-front' | 'chair-side'

export const FLOOR = 140

export const FIGURE_COLORS = {
  skin: '#f1c09b',
  skinFar: '#dca47f',
  cheek: '#eb9f86',
  mouth: '#a65a43',
  hair: '#3b2a20',
  top: '#3a6b52',
  topFar: '#2b5240',
  legs: '#3c4a43',
  legsFar: '#2a3530',
  mat: '#f7ebd0',
  matEdge: '#e6be6a',
  arrow: '#d9a441',
  board: '#eef3ea',
  floor: '#d9e1d3',
  chair: '#c9a77c',
  chairDark: '#a9865a',
} as const

const C = FIGURE_COLORS

const n1 = (v: number) => Math.round(v * 10) / 10
const pts = (list: readonly Point[]) => list.map((p) => `${n1(p[0])},${n1(p[1])}`).join(' ')

function line(a: Point, b: Point, width: number, color: string): string {
  return `<line x1="${n1(a[0])}" y1="${n1(a[1])}" x2="${n1(b[0])}" y2="${n1(b[1])}" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`
}

function polyline(list: readonly Point[], width: number, color: string): string {
  return `<polyline points="${pts(list)}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`
}

function dot(c: Point, r: number, color: string): string {
  return `<circle cx="${n1(c[0])}" cy="${n1(c[1])}" r="${r}" fill="${color}"/>`
}

/** The body: wider at the shoulders, narrower at the waist, with rounded corners. */
function torso(neck: Point, hip: Point, shoulders: number, waist: number): string {
  const dx = hip[0] - neck[0]
  const dy = hip[1] - neck[1]
  const len = Math.hypot(dx, dy) || 1
  const px = -dy / len
  const py = dx / len
  const ux = dx / len
  const uy = dy / len
  const at = (along: number, across: number): Point => [neck[0] + ux * along + px * across, neck[1] + uy * along + py * across]
  const outline = [at(0, shoulders), at(len * 0.55, waist + 1), at(len, waist), at(len, -waist), at(len * 0.55, -waist - 1), at(0, -shoulders)]
  return `<polygon points="${pts(outline)}" fill="${C.top}" stroke="${C.top}" stroke-width="8" stroke-linejoin="round"/>`
}

function headSvg(h: Head): string {
  const [x, y] = h.center
  const r = 12
  const face = h.face ?? 'front'
  let g = `<circle r="${r}" fill="${C.skin}"/>`
  if (face === 'front') {
    g +=
      `<path d="M-12.4 1 C-14 -10 -7 -15.4 0.4 -15.2 C8 -15 14 -10 12.4 1 C11.6 -3 10 -5.6 7.6 -6.6 C4 -3.6 -1.8 -3.6 -5.4 -6.8 C-8.6 -5.4 -11 -3 -12.4 1Z" fill="${C.hair}"/>` +
      `<path d="M-6.4 1.6 q2.1 1.9 4.2 0 M2.2 1.6 q2.1 1.9 4.2 0" stroke="${C.hair}" stroke-width="1.6" fill="none" stroke-linecap="round"/>` +
      `<circle cx="-7.2" cy="5.6" r="2" fill="${C.cheek}" opacity=".5"/><circle cx="7.2" cy="5.6" r="2" fill="${C.cheek}" opacity=".5"/>` +
      `<path d="M-2.8 7.4 q2.8 2.4 5.6 0" stroke="${C.mouth}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`
  } else {
    const side =
      `<circle cx="11.6" cy="2.5" r="2.4" fill="${C.skin}"/>` +
      `<path d="M11.4 -3.6 C10 -12.4 -2 -16.6 -9.4 -10.8 C-13.6 -7.4 -14 0 -11.6 5.4 C-10 9 -7.2 11 -5 11.6 C-5.6 7 -5.2 3.4 -2.8 0.6 C0.6 -3.4 6.6 -3.2 11.4 -3.6Z" fill="${C.hair}"/>` +
      `<circle cx="-1" cy="2.6" r="2.8" fill="${C.skinFar}"/>` +
      `<path d="M4.6 1.6 q2 1.7 4 0" stroke="${C.hair}" stroke-width="1.6" fill="none" stroke-linecap="round"/>` +
      `<circle cx="6" cy="6.4" r="2" fill="${C.cheek}" opacity=".5"/>` +
      `<path d="M8.4 8.8 q1.8 0.9 3 -0.4" stroke="${C.mouth}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`
    g += face === 'left' ? `<g transform="scale(-1 1)">${side}</g>` : side
  }
  return `<g transform="translate(${n1(x)} ${n1(y)}) rotate(${h.tilt ?? 0})">${g}</g>`
}

function armSvg(a: Arm): string {
  const skin = a.far ? C.skinFar : C.skin
  return line(a.elbow, a.hand, 8.5, skin) + dot(a.hand, 4.8, skin) + line(a.shoulder, a.elbow, 10.5, a.far ? C.topFar : C.top)
}

function legSvg(l: Leg): string {
  return polyline([l.hip, l.knee, l.foot], l.far ? 13.5 : 15, l.far ? C.legsFar : C.legs) + dot(l.foot, 5.2, l.far ? C.skinFar : C.skin)
}

/** The dotted arrow and its head, pointing along the last stretch of the curve. */
function arrowSvg([from, via, to]: Arrow): string {
  const d = `M${n1(from[0])} ${n1(from[1])} Q${n1(via[0])} ${n1(via[1])} ${n1(to[0])} ${n1(to[1])}`
  const dx = to[0] - via[0]
  const dy = to[1] - via[1]
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const tip: Point = [to[0] + ux * 5, to[1] + uy * 5]
  const left: Point = [to[0] - uy * 4.5, to[1] + ux * 4.5]
  const right: Point = [to[0] + uy * 4.5, to[1] - ux * 4.5]
  return (
    `<path d="${d}" fill="none" stroke="${C.arrow}" stroke-width="3" stroke-linecap="round" stroke-dasharray="0.1 6"/>` +
    `<polygon points="${pts([tip, left, right])}" fill="${C.arrow}" stroke="${C.arrow}" stroke-width="1.5" stroke-linejoin="round"/>`
  )
}

/** The mat, the floor or the chair, drawn behind the figure. */
function sceneSvg(scene: Scene): string {
  const floor = `<rect x="12" y="${FLOOR}" width="176" height="4" rx="2" fill="${C.floor}"/>`
  switch (scene) {
    case 'floor':
      return floor
    case 'chair-front':
      return (
        floor +
        line([80, 118], [80, FLOOR], 4, C.chairDark) +
        line([120, 118], [120, FLOOR], 4, C.chairDark) +
        `<rect x="79" y="58" width="42" height="52" rx="8" fill="${C.chair}"/>` +
        `<rect x="72" y="110" width="56" height="9" rx="4" fill="${C.chairDark}"/>`
      )
    case 'chair-side':
      return (
        floor +
        line([82, 118], [82, FLOOR], 4, C.chairDark) +
        line([118, 118], [118, FLOOR], 4, C.chairDark) +
        `<rect x="74" y="60" width="9" height="56" rx="4" fill="${C.chair}"/>` +
        `<rect x="74" y="110" width="50" height="9" rx="4" fill="${C.chairDark}"/>`
      )
    default:
      return `<rect x="12" y="${FLOOR}" width="176" height="7" rx="3.5" fill="${C.mat}" stroke="${C.matEdge}" stroke-width="1.5"/>`
  }
}

/** The whole drawing, board and mat included, as an SVG document. */
export function figureSvg(p: Pose, title = ''): string {
  const out: string[] = []
  const near = <T extends { far?: boolean }>(x: T) => !x.far
  const far = <T extends { far?: boolean }>(x: T) => !!x.far
  const shoulders = p.shoulders ?? 13
  const waist = p.waist ?? 10

  out.push(sceneSvg(p.scene ?? 'mat'))
  p.arms.filter(far).forEach((a) => out.push(armSvg(a)))
  p.legs.filter(far).forEach((l) => out.push(legSvg(l)))
  out.push(line(p.neck, p.headNeck, 8, C.skinFar))
  if (!p.legsOverBody) p.legs.filter(near).forEach((l) => out.push(legSvg(l)))
  out.push(torso(p.neck, p.hip, shoulders, waist))
  out.push(dot(p.hip, waist + 3, C.legs))
  if (p.legsOverBody) p.legs.filter(near).forEach((l) => out.push(legSvg(l)))
  if (p.armsOverHead) {
    out.push(headSvg(p.head))
    p.arms.filter(near).forEach((a) => out.push(armSvg(a)))
  } else {
    p.arms.filter(near).forEach((a) => out.push(armSvg(a)))
    out.push(headSvg(p.head))
  }
  ;(p.arrows ?? []).forEach((a) => out.push(arrowSvg(a)))

  const body = p.mirror ? `<g transform="translate(200 0) scale(-1 1)">${out.join('')}</g>` : out.join('')
  const label = title ? ` role="img" aria-label="${title.replace(/[<>&"]/g, '')}"` : ' aria-hidden="true"'
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 160"${label}><rect width="200" height="160" rx="16" fill="${C.board}"/>${body}</svg>`
}
