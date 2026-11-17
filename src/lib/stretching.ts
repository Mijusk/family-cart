// Estiramientos: the routines, their stretches (with the pose each one is drawn in) and the timing
// of a guided session. Pure functions and data; the screens are StretchingView (the routine and
// its stretches) and StretchingSessionView (following it). Design notes: docs/estiramientos.md.

import type { Leg, Pose } from './stretchFigure.ts'

export interface Stretch {
  id: string
  title: string
  /** How to do it, in one or two short sentences. */
  how: string
  pose: Pose
  /** Held twice as long as the others (the last one of the morning routine). */
  long?: boolean
}

export interface Routine {
  id: string
  title: string
  summary: string
  intro: string
  tips: string[]
  stretches: Stretch[]
}

// ── The poses ────────────────────────────────────────────────
// Sitting cross-legged facing us, lying on the back (head on the left) and so on: the shared
// pieces first, then each stretch only changes what moves.

const crossLegged: Pick<Pose, 'neck' | 'hip' | 'legs'> = {
  neck: [100, 84],
  hip: [100, 117],
  legs: [
    { hip: [108, 124], knee: [142, 129], foot: [94, 136], far: true },
    { hip: [92, 124], knee: [58, 129], foot: [106, 136] },
  ],
}

/** Sitting cross-legged seen from the side, looking right, hands on the knees. */
const sittingSide: Pick<Pose, 'neck' | 'hip' | 'legs' | 'shoulders' | 'waist'> = {
  neck: [96, 87],
  hip: [92, 120],
  shoulders: 9,
  waist: 8,
  legs: [
    { hip: [92, 124], knee: [130, 121], foot: [116, 134], far: true },
    { hip: [96, 126], knee: [138, 127], foot: [108, 136] },
  ],
}

/** On the back, head on the left: the near side is the right one. */
const lying: Pick<Pose, 'neck' | 'hip' | 'head' | 'headNeck' | 'shoulders' | 'waist' | 'legsOverBody'> = {
  neck: [60, 128],
  hip: [106, 128],
  headNeck: [52, 127],
  head: { center: [45, 124], face: 'right', tilt: -88 },
  shoulders: 8,
  waist: 7,
  legsOverBody: true,
}

const straightLeg = (far: boolean): Leg =>
  far ? { hip: [108, 131], knee: [148, 133], foot: [184, 132], far } : { hip: [106, 130], knee: [146, 132], foot: [184, 133] }

const kneeUp = (far: boolean): Leg =>
  far ? { hip: [108, 124], knee: [97, 93], foot: [125, 98], far } : { hip: [106, 124], knee: [92, 92], foot: [120, 96] }

const hugArms: Pose['arms'] = [
  { shoulder: [66, 124], elbow: [78, 108], hand: [94, 99], far: true },
  { shoulder: [64, 126], elbow: [80, 112], hand: [97, 103] },
]

/** Facing left, a long step: hands on the floor either side of the front foot. */
function lunge(rightForward: boolean): Pose {
  // Facing left we see the left side, so the right leg is the far one.
  return {
    neck: [74, 94],
    hip: [112, 108],
    headNeck: [66, 91],
    head: { center: [56, 86], face: 'left', tilt: 8 },
    shoulders: 8,
    waist: 7,
    arms: [
      { shoulder: [80, 96], elbow: [88, 114], hand: [92, 134], far: true },
      { shoulder: [78, 98], elbow: [74, 116], hand: [70, 134] },
    ],
    legs: [
      { hip: [110, 108], knee: [80, 104], foot: [78, 135], far: rightForward },
      { hip: [114, 110], knee: [148, 124], foot: [182, 134], far: !rightForward },
    ],
    arrows: [[[124, 80], [132, 92], [124, 100]]],
  }
}

const neckRight: Pose = {
  ...crossLegged,
  armsOverHead: true,
  headNeck: [96, 76],
  head: { center: [91, 66], tilt: -28 },
  arms: [
    { shoulder: [88, 88], elbow: [70, 54], hand: [101, 52] },
    { shoulder: [112, 88], elbow: [121, 107], hand: [126, 125] },
  ],
  arrows: [[[118, 44], [132, 52], [131, 66]]],
}

const tricepsRight: Pose = {
  ...crossLegged,
  headNeck: [100, 76],
  head: { center: [100, 64] },
  arms: [
    { shoulder: [88, 87], elbow: [88, 38], hand: [104, 58] },
    { shoulder: [112, 87], elbow: [126, 60], hand: [95, 38] },
  ],
  arrows: [[[80, 22], [98, 12], [114, 20]]],
}

const shoulderRight: Pose = {
  ...crossLegged,
  headNeck: [100, 76],
  head: { center: [100, 64] },
  arms: [
    { shoulder: [88, 89], elbow: [108, 93], hand: [132, 91] },
    { shoulder: [112, 89], elbow: [126, 108], hand: [110, 96] },
  ],
  arrows: [[[104, 76], [124, 68], [142, 76]]],
}

export const ROUTINES: Routine[] = [
  {
    id: 'despertar',
    title: 'Al despertar',
    summary: '18 estiramientos suaves para empezar el día',
    intro:
      'Para soltar el cuerpo por la mañana: cuello, espalda, hombros, caderas y piernas. Sentado, tumbado y de rodillas, sobre una esterilla o una alfombra.',
    tips: [
      'Hazla en una esterilla o una alfombra, con ropa cómoda.',
      'Entra en cada estiramiento despacio y quédate quieto: sin rebotes.',
      'Estira hasta notar tensión, nunca dolor.',
      'Respira con calma todo el rato, sin aguantar el aire.',
      'Fíjate en el músculo que estiras y suelta lo que no trabaja: hombros, mandíbula, manos.',
      'Mejor unos minutos cada día: en un mes notarás más elasticidad.',
    ],
    stretches: [
      {
        id: 'cuello-derecha',
        title: 'Cuello hacia la derecha',
        how: 'Con la mano derecha, lleva la cabeza hacia el hombro derecho, sin tirar. El otro hombro, abajo.',
        pose: neckRight,
      },
      {
        id: 'cuello-izquierda',
        title: 'Cuello hacia la izquierda',
        how: 'Con la mano izquierda, lleva la cabeza hacia el hombro izquierdo, sin tirar. El otro hombro, abajo.',
        pose: { ...neckRight, mirror: true },
      },
      {
        id: 'cuello-atras',
        title: 'Cuello hacia atrás',
        how: 'Mira al techo despacio, con la boca cerrada y las manos en las rodillas. Sin forzar.',
        pose: {
          ...sittingSide,
          headNeck: [99, 78],
          head: { center: [103, 66], face: 'right', tilt: -32 },
          arms: [
            { shoulder: [94, 92], elbow: [108, 106], hand: [126, 114], far: true },
            { shoulder: [98, 92], elbow: [112, 110], hand: [132, 120] },
          ],
          arrows: [[[122, 54], [120, 38], [102, 40]]],
        },
      },
      {
        id: 'cuello-adelante',
        title: 'Cuello hacia delante',
        how: 'Baja la barbilla hacia el pecho despacio. Si quieres un poco más, apoya las manos en la nuca, sin tirar.',
        pose: {
          ...sittingSide,
          headNeck: [100, 80],
          head: { center: [107, 72], face: 'right', tilt: 38 },
          arms: [
            { shoulder: [94, 92], elbow: [108, 106], hand: [126, 114], far: true },
            { shoulder: [98, 92], elbow: [112, 110], hand: [132, 120] },
          ],
          arrows: [[[128, 58], [134, 72], [126, 84]]],
        },
      },
      {
        id: 'rodilla-derecha',
        title: 'Rodilla derecha al pecho',
        how: 'Boca arriba, abraza la rodilla derecha y acércala al pecho. La otra pierna, estirada y relajada.',
        pose: { ...lying, arms: hugArms, legs: [straightLeg(true), kneeUp(false)], arrows: [[[120, 74], [104, 64], [88, 76]]] },
      },
      {
        id: 'rodilla-izquierda',
        title: 'Rodilla izquierda al pecho',
        how: 'Ahora la izquierda: abrázala y acércala al pecho, con la derecha estirada.',
        pose: { ...lying, arms: hugArms, legs: [kneeUp(true), straightLeg(false)], arrows: [[[124, 76], [108, 64], [92, 76]]] },
      },
      {
        id: 'rodillas',
        title: 'Las dos rodillas al pecho',
        how: 'Abraza las dos rodillas y acércalas al pecho, con la espalda apoyada en el suelo.',
        pose: { ...lying, arms: hugArms, legs: [kneeUp(true), kneeUp(false)], arrows: [[[124, 74], [108, 62], [92, 74]]] },
      },
      {
        id: 'mariposa',
        title: 'Mariposa',
        how: 'Sentado, junta las plantas de los pies y cógelos con las manos. Deja caer las rodillas, sin empujarlas.',
        pose: {
          neck: [100, 84],
          hip: [100, 117],
          headNeck: [100, 76],
          head: { center: [100, 64] },
          arms: [
            { shoulder: [88, 88], elbow: [82, 108], hand: [94, 128] },
            { shoulder: [112, 88], elbow: [118, 108], hand: [106, 128] },
          ],
          legs: [
            { hip: [92, 124], knee: [54, 122], foot: [95, 134] },
            { hip: [108, 124], knee: [146, 122], foot: [105, 134] },
          ],
          arrows: [
            [[42, 104], [34, 112], [38, 124]],
            [[158, 104], [166, 112], [162, 124]],
          ],
        },
      },
      {
        id: 'brazos-arriba',
        title: 'Brazos arriba',
        how: 'Estira los brazos por encima de la cabeza, como si quisieras tocar el techo. Hombros lejos de las orejas.',
        pose: {
          ...crossLegged,
          headNeck: [100, 76],
          head: { center: [100, 64] },
          arms: [
            { shoulder: [88, 86], elbow: [85, 58], hand: [94, 30] },
            { shoulder: [112, 86], elbow: [115, 58], hand: [106, 30] },
          ],
          arrows: [[[134, 70], [136, 52], [134, 34]]],
        },
      },
      {
        id: 'triceps-derecho',
        title: 'Dorsal y tríceps derecho',
        how: 'Dobla el brazo derecho detrás de la cabeza. Con la mano izquierda, empuja suave el codo hacia la izquierda.',
        pose: tricepsRight,
      },
      {
        id: 'triceps-izquierdo',
        title: 'Dorsal y tríceps izquierdo',
        how: 'Ahora el izquierdo detrás de la cabeza; la mano derecha empuja suave el codo.',
        pose: { ...tricepsRight, mirror: true },
      },
      {
        id: 'hombro-derecho',
        title: 'Hombro derecho',
        how: 'Cruza el brazo derecho estirado por delante del pecho y acércalo con el antebrazo izquierdo.',
        pose: shoulderRight,
      },
      {
        id: 'hombro-izquierdo',
        title: 'Hombro izquierdo',
        how: 'Ahora el brazo izquierdo por delante del pecho, sujeto con el antebrazo derecho.',
        pose: { ...shoulderRight, mirror: true },
      },
      {
        id: 'nino',
        title: 'Postura del niño',
        how: 'De rodillas, siéntate sobre los talones y baja el pecho hacia el suelo con los brazos estirados al frente.',
        pose: {
          neck: [92, 123],
          hip: [138, 118],
          headNeck: [84, 126],
          head: { center: [74, 127], face: 'left', tilt: -62 },
          shoulders: 8,
          waist: 8,
          arms: [
            { shoulder: [96, 120], elbow: [70, 126], hand: [44, 131], far: true },
            { shoulder: [94, 123], elbow: [68, 129], hand: [42, 134] },
          ],
          legs: [
            { hip: [140, 118], knee: [114, 132], foot: [152, 134], far: true },
            { hip: [138, 121], knee: [110, 134], foot: [150, 136] },
          ],
          arrows: [[[96, 100], [70, 90], [46, 108]]],
        },
      },
      {
        id: 'cobra',
        title: 'Cobra',
        how: 'Boca abajo, manos bajo los hombros. Estira los brazos poco a poco sin despegar la cadera, solo hasta donde sea cómodo.',
        pose: {
          neck: [66, 94],
          hip: [116, 127],
          headNeck: [62, 86],
          head: { center: [57, 77], face: 'left', tilt: 30 },
          shoulders: 8,
          waist: 7,
          arms: [
            { shoulder: [72, 100], elbow: [74, 118], hand: [72, 133], far: true },
            { shoulder: [70, 98], elbow: [68, 118], hand: [66, 133] },
          ],
          legs: [
            { hip: [118, 130], knee: [150, 133], foot: [184, 132], far: true },
            { hip: [116, 130], knee: [150, 134], foot: [186, 134] },
          ],
          arrows: [[[86, 66], [76, 50], [58, 50]]],
        },
      },
      {
        id: 'zancada-derecha',
        title: 'Zancada, pierna derecha delante',
        how: 'Pierna derecha doblada delante, entre las manos, y la izquierda estirada atrás. Baja la cadera despacio.',
        pose: lunge(true),
      },
      {
        id: 'zancada-izquierda',
        title: 'Zancada, pierna izquierda delante',
        how: 'Cambia: la izquierda delante y la derecha estirada atrás. Baja la cadera despacio.',
        pose: lunge(false),
      },
      {
        id: 'sumo',
        title: 'Sentadilla sumo',
        how: 'Piernas muy abiertas y puntas hacia fuera. Baja la cadera con los codos por dentro de las rodillas y las manos al frente en el suelo.',
        long: true,
        pose: {
          neck: [100, 84],
          hip: [100, 111],
          headNeck: [100, 76],
          head: { center: [100, 65] },
          arms: [
            { shoulder: [88, 88], elbow: [84, 110], hand: [90, 133] },
            { shoulder: [112, 88], elbow: [116, 110], hand: [110, 133] },
          ],
          legs: [
            { hip: [91, 114], knee: [60, 104], foot: [64, 135] },
            { hip: [109, 114], knee: [140, 104], foot: [136, 135] },
          ],
          arrows: [
            [[54, 86], [42, 88], [38, 98]],
            [[146, 86], [158, 88], [162, 98]],
          ],
        },
      },
    ],
  },
]

export const SAFETY = {
  general: 'Estos estiramientos son suaves y para todo el mundo, pero no sustituyen al médico ni al fisio.',
  gentle: 'Estira hasta notar tensión, nunca dolor, y sin rebotes. Respira con calma: no aguantes el aire.',
  ask: 'Si tienes una lesión, dolor de espalda o de cuello, o estás embarazada, pregunta antes a tu médico o fisio cuáles te convienen.',
  stop: 'Si algo duele, marea u hormiguea, para y descansa.',
}

export const routineById = (id: string): Routine | undefined => ROUTINES.find((r) => r.id === id)

// ── Settings, per routine, on the device ─────────────────────

/** Seconds to hold each stretch (the long ones, twice that). */
export const HOLD_CHOICES = [10, 15, 20, 30] as const
export const DEFAULT_HOLD = 15
/** Seconds between stretches to change position, seeing the next one. */
export const CHANGE_SECONDS = 3
/** «Prepárate» before the first one. */
export const LEAD_IN = 3

export function cleanHold(raw: unknown): number {
  const n = typeof raw === 'object' && raw ? (raw as { hold?: unknown }).hold : raw
  return HOLD_CHOICES.includes(n as (typeof HOLD_CHOICES)[number]) ? (n as number) : DEFAULT_HOLD
}

export const holdOf = (s: Stretch, hold: number) => (s.long ? hold * 2 : hold)

// ── The session ──────────────────────────────────────────────

export type SegmentKind = 'ready' | 'change' | 'hold'

export interface Segment {
  kind: SegmentKind
  /** The stretch being held, or the one coming up (ready, change). */
  index: number
  start: number
  seconds: number
}

/** Prepárate, then each stretch held, with a short change between them. */
export function planOf(stretches: Stretch[], hold: number): Segment[] {
  const segments: Segment[] = []
  let t = 0
  stretches.forEach((s, i) => {
    const before: Segment = i === 0 ? { kind: 'ready', index: 0, start: t, seconds: LEAD_IN } : { kind: 'change', index: i, start: t, seconds: CHANGE_SECONDS }
    segments.push(before)
    t += before.seconds
    const seconds = holdOf(s, hold)
    segments.push({ kind: 'hold', index: i, start: t, seconds })
    t += seconds
  })
  return segments
}

export const planLength = (plan: Segment[]) => {
  const last = plan[plan.length - 1]
  return last ? last.start + last.seconds : 0
}

export interface Moment {
  segment: Segment
  /** 0 → 1 through the segment. */
  progress: number
  /** Whole seconds left in the segment, as the countdown shows them (never 0 while running). */
  secondsLeft: number
}

/** Where the session is `elapsed` seconds after «Empezar»; null once it has ended. */
export function momentAt(plan: Segment[], elapsed: number): Moment | null {
  if (elapsed < 0) elapsed = 0
  for (const segment of plan) {
    const into = elapsed - segment.start
    if (into < segment.seconds) {
      return { segment, progress: into / segment.seconds, secondsLeft: Math.max(1, Math.ceil(segment.seconds - into)) }
    }
  }
  return null
}

/** Where «Saltar» goes: the start of holding the next stretch (no change in between); null = the end. */
export function nextStart(plan: Segment[], elapsed: number): number | null {
  const now = momentAt(plan, elapsed)
  if (!now) return null
  // Getting ready or changing: straight to holding that stretch. Holding: on to the next one.
  const target = now.segment.kind === 'hold' ? now.segment.index + 1 : now.segment.index
  return plan.find((s) => s.kind === 'hold' && s.index === target)?.start ?? null
}

/** Where «Anterior» goes: back to the start of this stretch, or the one before if it has just begun. */
export function previousStart(plan: Segment[], elapsed: number): number {
  const now = momentAt(plan, elapsed)
  if (!now) {
    const last = [...plan].reverse().find((s) => s.kind === 'hold')
    return last?.start ?? 0
  }
  const holdNow = plan.find((s) => s.kind === 'hold' && s.index === now.segment.index)!
  const justBegun = now.segment.kind !== 'hold' || elapsed - holdNow.start < 2
  const index = justBegun ? Math.max(0, now.segment.index - 1) : now.segment.index
  return plan.find((s) => s.kind === 'hold' && s.index === index)!.start
}

/** «5 min 20 s», for the whole routine. */
export function durationText(seconds: number): string {
  const total = Math.round(seconds)
  const min = Math.floor(total / 60)
  const sec = total % 60
  if (!min) return `${sec} s`
  return sec ? `${min} min ${sec} s` : `${min} min`
}
