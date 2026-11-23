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
  /** Short name for the tabs. */
  label: string
  summary: string
  intro: string
  tips: string[]
  /** Seconds each stretch is held unless the person picks another time. */
  defaultHold: number
  /** The stretch whose drawing stands for the routine. */
  cover: number
  /** What the screen says at the end. */
  doneText: string
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

// ── Sitting on a chair (a break at work) and standing (after training) ──

type Pt = readonly [number, number]
const move = (p: Pt, dx: number, dy: number): Pt => [p[0] + dx, p[1] + dy]
/** The same arms, moved: the poses sitting cross-legged reused on a chair. */
const moveArms = (arms: Pose['arms'], dx: number, dy: number): Pose['arms'] =>
  arms.map((a) => ({ ...a, shoulder: move(a.shoulder, dx, dy), elbow: move(a.elbow, dx, dy), hand: move(a.hand, dx, dy) }))
const moveArrows = (arrows: Pose['arrows'], dx: number, dy: number): Pose['arrows'] =>
  (arrows ?? []).map(([a, b, c]) => [move(a, dx, dy), move(b, dx, dy), move(c, dx, dy)] as const)

/** On a chair, facing us, feet flat on the floor. */
const onChair: Pick<Pose, 'neck' | 'hip' | 'legs' | 'scene'> = {
  scene: 'chair-front',
  neck: [100, 78],
  hip: [100, 108],
  legs: [
    { hip: [92, 114], knee: [86, 122], foot: [86, 136] },
    { hip: [108, 114], knee: [114, 122], foot: [114, 136] },
  ],
}

/** On a chair seen from the side, looking right. */
const onChairSide: Pick<Pose, 'neck' | 'hip' | 'legs' | 'scene' | 'shoulders' | 'waist'> = {
  scene: 'chair-side',
  neck: [94, 78],
  hip: [92, 108],
  shoulders: 8,
  waist: 7,
  legs: [
    { hip: [92, 110], knee: [122, 111], foot: [124, 136], far: true },
    { hip: [94, 112], knee: [126, 113], foot: [128, 137] },
  ],
}

/** Standing, facing us. */
const standing: Pick<Pose, 'neck' | 'hip' | 'legs' | 'scene' | 'headNeck' | 'head'> = {
  scene: 'floor',
  neck: [100, 62],
  hip: [100, 95],
  headNeck: [100, 54],
  head: { center: [100, 42] },
  legs: [
    { hip: [93, 100], knee: [91, 119], foot: [90, 136] },
    { hip: [107, 100], knee: [109, 119], foot: [110, 136] },
  ],
}

const chairHead = { headNeck: [100, 70] as Pt, head: { center: [100, 58] as Pt } }

const deskNeckRight: Pose = {
  ...onChair,
  armsOverHead: true,
  headNeck: [96, 70],
  head: { center: [91, 59], tilt: -28 },
  arms: [
    { shoulder: [88, 82], elbow: [70, 48], hand: [101, 45] },
    { shoulder: [112, 82], elbow: [120, 98], hand: [116, 112] },
  ],
  arrows: [[[118, 37], [132, 45], [131, 59]]],
}

const deskArmAcross: Pose = { ...onChair, ...chairHead, arms: moveArms(shoulderRight.arms, 0, -7), arrows: moveArrows(shoulderRight.arrows, 0, -7) }
const deskTriceps: Pose = { ...onChair, ...chairHead, arms: moveArms(tricepsRight.arms, 0, -7), arrows: moveArrows(tricepsRight.arrows, 0, -4) }

/** Standing, bending to the right (ours: left) with the other arm over the head. */
const sideBendRight: Pose = {
  ...standing,
  neck: [90, 63],
  headNeck: [86, 55],
  head: { center: [80, 45], tilt: -22 },
  arms: [
    { shoulder: [80, 66], elbow: [76, 84], hand: [78, 102] },
    { shoulder: [100, 62], elbow: [96, 36], hand: [76, 24] },
  ],
  arrows: [[[110, 30], [96, 14], [74, 14]]],
}

/** Standing on the left leg, the right heel to the bottom (facing right: the right side is the far one). */
function quad(right: boolean): Pose {
  return {
    scene: 'floor',
    neck: [100, 64],
    hip: [100, 96],
    shoulders: 8,
    waist: 7,
    headNeck: [102, 55],
    head: { center: [104, 44], face: 'right' },
    arms: [
      { shoulder: [98, 68], elbow: [88, 86], hand: [78, 102], far: !right },
      { shoulder: [102, 68], elbow: [114, 80], hand: [124, 90], far: right },
    ],
    legs: [
      { hip: [98, 98], knee: [94, 121], foot: [76, 104], far: !right },
      { hip: [102, 98], knee: [104, 118], foot: [104, 136], far: right },
    ],
    arrows: [[[62, 120], [56, 104], [64, 92]]],
  }
}

/** Facing right, one leg straight ahead on its heel, bending forward from the hips. */
function hamstring(right: boolean): Pose {
  // Facing right we see the right side: the right leg is the near one.
  return {
    scene: 'floor',
    neck: [124, 76],
    hip: [96, 96],
    shoulders: 8,
    waist: 7,
    headNeck: [130, 71],
    head: { center: [138, 64], face: 'right', tilt: 16 },
    arms: [
      { shoulder: [122, 79], elbow: [124, 96], hand: [126, 112], far: true },
      { shoulder: [120, 80], elbow: [120, 98], hand: [122, 114] },
    ],
    legs: [
      { hip: [96, 98], knee: [122, 116], foot: [146, 134], far: !right },
      { hip: [94, 98], knee: [86, 118], foot: [88, 136], far: right },
    ],
    arrows: [[[150, 92], [156, 80], [150, 70]]],
  }
}

const standingNeckRight: Pose = {
  ...standing,
  armsOverHead: true,
  headNeck: [96, 54],
  head: { center: [91, 44], tilt: -28 },
  arms: [
    { shoulder: [88, 66], elbow: [70, 32], hand: [101, 30] },
    { shoulder: [112, 66], elbow: [116, 84], hand: [118, 100] },
  ],
  arrows: [[[118, 22], [132, 30], [131, 44]]],
}

/** Legs wide apart, bending down: to the middle, or towards the right leg (ours: left). */
function wideFold(toRight: boolean | null): Pose {
  const dx = toRight === null ? 0 : -18
  return {
    scene: 'floor',
    hip: [100, 88],
    neck: [100 + dx, 112],
    headNeck: [100 + dx * 1.3, 119],
    head: { center: [100 + dx * 1.4, 126], tilt: 180 - dx * 1.5 },
    arms: [
      { shoulder: [92 + dx, 110], elbow: [88 + dx * 1.3, 122], hand: [86 + dx * 1.2, 134] },
      { shoulder: [108 + dx, 110], elbow: [112 + dx * 1.3, 122], hand: [114 + dx * 1.6, 134] },
    ],
    legs: [
      { hip: [92, 92], knee: [76, 114], foot: [62, 136] },
      { hip: [108, 92], knee: [124, 114], foot: [138, 136] },
    ],
    arrows: toRight === null ? [[[148, 80], [156, 96], [150, 110]]] : [[[60, 86], [50, 98], [54, 112]]],
  }
}

/** Side lunge to the right (ours: left): that knee bent, the other leg straight out. */
const sideLungeRight: Pose = {
  scene: 'floor',
  neck: [96, 74],
  hip: [100, 104],
  headNeck: [95, 66],
  head: { center: [94, 54], tilt: -6 },
  arms: [
    { shoulder: [84, 78], elbow: [78, 94], hand: [76, 108] },
    { shoulder: [108, 78], elbow: [100, 94], hand: [90, 110] },
  ],
  legs: [
    { hip: [93, 108], knee: [68, 114], foot: [64, 136] },
    { hip: [107, 108], knee: [128, 122], foot: [150, 136] },
  ],
  arrows: [[[126, 98], [140, 100], [150, 112]]],
}

export const ROUTINES: Routine[] = [
  {
    id: 'despertar',
    label: 'Al despertar',
    defaultHold: 15,
    cover: 8,
    doneText: '¡Bien hecho! Cuerpo despierto. Bebe un poco de agua y a por el día.',
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
  {
    id: 'trabajo',
    label: 'Pausa en el trabajo',
    title: 'Pausa en el trabajo',
    summary: '12 estiramientos en la silla y de pie, en menos de 3 minutos',
    intro:
      'Para las horas sentado delante del ordenador: cuello, hombros, brazos, muñecas, espalda y piernas. Casi todo en la silla; los últimos, de pie junto a la mesa.',
    defaultHold: 10,
    cover: 0,
    doneText: 'Listo. Antes de volver a lo tuyo, mira un momento a lo lejos para descansar la vista.',
    tips: [
      'Hazla cada hora u hora y media: mejor pausas cortas a menudo que una larga al final del día.',
      'Siéntate en el borde de la silla, con la espalda recta y los pies apoyados en el suelo.',
      'Movimientos suaves y progresivos, sin tirones ni rebotes.',
      'Suelta los hombros y la mandíbula; respira con calma todo el rato.',
      'Para los de pie, apóyate en la mesa o en el respaldo si lo necesitas.',
      'Aprovecha para levantarte, beber agua y mirar lejos de la pantalla.',
    ],
    stretches: [
      {
        id: 'mesa-cuello-derecha',
        title: 'Cuello hacia la derecha',
        how: 'Sentado y con la espalda recta, lleva la cabeza hacia el hombro derecho; la mano ayuda sin tirar.',
        pose: deskNeckRight,
      },
      {
        id: 'mesa-cuello-izquierda',
        title: 'Cuello hacia la izquierda',
        how: 'Ahora hacia el hombro izquierdo, con la mano izquierda. El hombro derecho, abajo y suelto.',
        pose: { ...deskNeckRight, mirror: true },
      },
      {
        id: 'mesa-hombros',
        title: 'Círculos con los hombros',
        how: 'Haz círculos amplios y lentos con los dos hombros, hacia atrás. Los brazos, sueltos.',
        pose: {
          ...onChair,
          ...chairHead,
          arms: [
            { shoulder: [88, 80], elbow: [84, 96], hand: [88, 110] },
            { shoulder: [112, 80], elbow: [116, 96], hand: [112, 110] },
          ],
          arrows: [
            [[70, 84], [62, 64], [80, 62]],
            [[130, 84], [138, 64], [120, 62]],
          ],
        },
      },
      {
        id: 'mesa-brazo-derecho',
        title: 'Hombro derecho',
        how: 'Cruza el brazo derecho estirado por delante del pecho y acércalo con el antebrazo izquierdo.',
        pose: deskArmAcross,
      },
      {
        id: 'mesa-brazo-izquierdo',
        title: 'Hombro izquierdo',
        how: 'Ahora el brazo izquierdo por delante del pecho, sujeto con el antebrazo derecho.',
        pose: { ...deskArmAcross, mirror: true },
      },
      {
        id: 'mesa-triceps-derecho',
        title: 'Tríceps derecho',
        how: 'Dobla el brazo derecho detrás de la cabeza, con el codo hacia el techo, y empújalo suave con la otra mano.',
        pose: deskTriceps,
      },
      {
        id: 'mesa-triceps-izquierdo',
        title: 'Tríceps izquierdo',
        how: 'Ahora el izquierdo detrás de la cabeza; la mano derecha empuja suave el codo.',
        pose: { ...deskTriceps, mirror: true },
      },
      {
        id: 'mesa-munecas',
        title: 'Muñecas',
        how: 'Estira un brazo al frente con la palma hacia fuera y tira suave de los dedos hacia ti. A mitad, cambia de mano.',
        long: true,
        pose: {
          ...onChairSide,
          headNeck: [97, 70],
          head: { center: [100, 58], face: 'right' },
          arms: [
            { shoulder: [96, 82], elbow: [112, 94], hand: [130, 84], far: true },
            { shoulder: [98, 82], elbow: [118, 82], hand: [138, 81] },
          ],
          arrows: [[[150, 66], [154, 78], [146, 86]]],
        },
      },
      {
        id: 'mesa-espalda',
        title: 'Espalda alta',
        how: 'Entrelaza las manos, estira los brazos al frente y redondea la espalda, como abrazando un balón.',
        pose: {
          ...onChairSide,
          neck: [100, 80],
          headNeck: [104, 74],
          head: { center: [110, 66], face: 'right', tilt: 22 },
          arms: [
            { shoulder: [102, 84], elbow: [122, 86], hand: [140, 88], far: true },
            { shoulder: [104, 85], elbow: [124, 87], hand: [142, 89] },
          ],
          arrows: [[[84, 62], [78, 76], [84, 90]]],
        },
      },
      {
        id: 'mesa-lateral-derecha',
        title: 'De pie: costado izquierdo',
        how: 'De pie, sube el brazo izquierdo e inclínate despacio hacia la derecha, sin girar el cuerpo.',
        pose: sideBendRight,
      },
      {
        id: 'mesa-lateral-izquierda',
        title: 'De pie: costado derecho',
        how: 'Ahora sube el brazo derecho e inclínate hacia la izquierda.',
        pose: { ...sideBendRight, mirror: true },
      },
      {
        id: 'mesa-cuadriceps',
        title: 'De pie: muslos',
        how: 'Coge un pie por detrás y acerca el talón al glúteo, con las rodillas juntas. A mitad, cambia de pierna. Apóyate en la mesa si lo necesitas.',
        long: true,
        pose: quad(true),
      },
    ],
  },
  {
    id: 'entreno',
    label: 'Después de entrenar',
    title: 'Después de entrenar',
    summary: '12 estiramientos de pie para piernas, espalda y cuello, en unos 3 minutos y medio',
    intro:
      'Para terminar cualquier entrenamiento: estira isquiotibiales, aductores, cuádriceps, espalda y cuello mientras recuperas el aliento. Todos de pie, sin esterilla.',
    defaultHold: 15,
    cover: 0,
    doneText: '¡Buen entrenamiento! Bebe agua y date una ducha tranquila.',
    tips: [
      'Hazla nada más terminar, con el cuerpo aún caliente.',
      'Respira hondo y despacio: ayuda a soltar el músculo y a recuperar el aliento.',
      'Estira hasta notar tensión, nunca dolor, y sin rebotes.',
      'Si te mareas al bajar la cabeza, sube despacio y haz ese estiramiento con menos recorrido.',
      'Si un músculo ha trabajado mucho, dale el tiempo más largo.',
    ],
    stretches: [
      {
        id: 'entreno-abierto-centro',
        title: 'Piernas abiertas, al centro',
        how: 'Abre bien las piernas y baja el tronco hacia el suelo entre ellas, con la espalda larga.',
        pose: wideFold(null),
      },
      {
        id: 'entreno-abierto-derecha',
        title: 'Piernas abiertas, a la derecha',
        how: 'Con las piernas abiertas, lleva el tronco y las manos hacia el pie derecho.',
        pose: wideFold(true),
      },
      {
        id: 'entreno-abierto-izquierda',
        title: 'Piernas abiertas, a la izquierda',
        how: 'Ahora hacia el pie izquierdo, sin doblar las rodillas.',
        pose: { ...wideFold(true), mirror: true },
      },
      {
        id: 'entreno-lateral-derecha',
        title: 'Zancada lateral a la derecha',
        how: 'Dobla la rodilla derecha y baja la cadera hacia ese lado; la pierna izquierda, estirada. Estira la cara interna del muslo.',
        pose: sideLungeRight,
      },
      {
        id: 'entreno-lateral-izquierda',
        title: 'Zancada lateral a la izquierda',
        how: 'Ahora dobla la izquierda y estira la derecha.',
        pose: { ...sideLungeRight, mirror: true },
      },
      {
        id: 'entreno-isquio-derecho',
        title: 'Detrás del muslo derecho',
        how: 'Adelanta la pierna derecha estirada, apoyada en el talón, dobla un poco la otra y lleva la cadera hacia atrás con la espalda recta.',
        pose: hamstring(true),
      },
      {
        id: 'entreno-isquio-izquierdo',
        title: 'Detrás del muslo izquierdo',
        how: 'Ahora la pierna izquierda delante, sobre el talón. Espalda recta, sin redondearla.',
        pose: hamstring(false),
      },
      {
        id: 'entreno-colgar',
        title: 'Espalda colgando',
        how: 'Con las rodillas un poco dobladas, deja caer el tronco y los brazos hacia el suelo. Sube despacio, vértebra a vértebra.',
        pose: {
          scene: 'floor',
          neck: [114, 110],
          hip: [100, 86],
          shoulders: 8,
          waist: 7,
          headNeck: [117, 117],
          head: { center: [120, 124], face: 'right', tilt: 100 },
          arms: [
            { shoulder: [112, 108], elbow: [110, 122], hand: [108, 134], far: true },
            { shoulder: [114, 110], elbow: [113, 123], hand: [112, 135] },
          ],
          legs: [
            { hip: [100, 90], knee: [106, 112], foot: [100, 136], far: true },
            { hip: [100, 92], knee: [108, 114], foot: [102, 137] },
          ],
          arrows: [[[76, 84], [70, 100], [78, 114]]],
        },
      },
      {
        id: 'entreno-cuadriceps-derecho',
        title: 'Muslo derecho',
        how: 'De pie sobre la pierna izquierda, coge el pie derecho y acerca el talón al glúteo, con las rodillas juntas.',
        pose: quad(true),
      },
      {
        id: 'entreno-cuadriceps-izquierdo',
        title: 'Muslo izquierdo',
        how: 'Ahora el pie izquierdo al glúteo. Si te cuesta el equilibrio, apóyate en una pared.',
        pose: quad(false),
      },
      {
        id: 'entreno-cuello-derecha',
        title: 'Cuello hacia la derecha',
        how: 'De pie, lleva la cabeza hacia el hombro derecho con la mano derecha, sin tirar.',
        pose: standingNeckRight,
      },
      {
        id: 'entreno-cuello-izquierda',
        title: 'Cuello hacia la izquierda',
        how: 'Ahora hacia el hombro izquierdo. Respira hondo y suelta los hombros.',
        pose: { ...standingNeckRight, mirror: true },
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

export function cleanHold(raw: unknown, fallback = DEFAULT_HOLD): number {
  const n = typeof raw === 'object' && raw ? (raw as { hold?: unknown }).hold : raw
  return HOLD_CHOICES.includes(n as (typeof HOLD_CHOICES)[number]) ? (n as number) : fallback
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
