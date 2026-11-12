// Respiración: the guided exercises, their tips and the timing of a session. Pure functions and
// data; the screens are BreathingView (the sections) and BreathingSessionView (one exercise).
// Design notes and sources: docs/respiracion.md.
//
// On purpose there is never a phase holding the breath: no 4-7-8, no box breathing. Times are
// short and comfortable by default, and each person can lower them (or raise them a little).

export type BreathCategory = 'relax' | 'sport' | 'speech'

/** Breathe in, breathe out (or speak, for the speech exercises), and an easy pause after speaking. */
export type PhaseKind = 'inhale' | 'exhale' | 'speak' | 'rest'

/**
 * How the exercise is drawn. All of them have the circle that grows and shrinks; on top:
 * - wave: rings leaving it while breathing out (pursed lips).
 * - bar: a bar that empties steadily (a continuous «sss»).
 * - steps: one dot per step while walking.
 * - count: the numbers, one a second.
 * - phrases: a short sentence to read aloud.
 */
export type BreathVisual = 'circle' | 'wave' | 'bar' | 'steps' | 'count' | 'phrases'

export interface Exercise {
  id: string
  category: BreathCategory
  title: string
  summary: string
  /** How to do it, step by step. */
  steps: string[]
  visual: BreathVisual
  /** Default seconds to breathe in and out (to speak, for phrases); a person can change them. */
  inhale: number
  exhale: number
  /** What the screen says in each phase. */
  inhaleText: string
  exhaleText: string
  /** Steps per phase, for the walking ones. */
  inhaleSteps?: number
  exhaleSteps?: number
  /** Seconds of easy breathing after each sentence (phrases). */
  rest?: number
}

export interface Category {
  id: BreathCategory
  label: string
  title: string
  intro: string
  tips: string[]
}

export const CATEGORIES: Category[] = [
  {
    id: 'relax',
    label: 'Relajarse',
    title: 'Para relajarse',
    intro: 'Respiración lenta y tranquila para soltar tensión. Sin aguantar el aire y sin forzar.',
    tips: [
      'Siéntate cómoda, con los hombros y el cuello sueltos.',
      'Toma el aire por la nariz, sin llenar los pulmones a la fuerza.',
      'Deja que se muevan la barriga y la parte baja de las costillas; los hombros, quietos.',
      'Suelta el aire sin empujar. Si los tiempos se te hacen largos, bájalos.',
      'Mejor unos minutos cada día que una sesión larga de vez en cuando.',
    ],
  },
  {
    id: 'sport',
    label: 'Deporte',
    title: 'Para el deporte',
    intro: 'Para caminar, subir cuestas o montañas y recuperar el aliento, a tu ritmo.',
    tips: [
      'Ve a un ritmo que te deje decir frases cortas. Si no puedes, baja el ritmo.',
      'En las cuestas, pasos más cortos y más lentos. No hace falta subir del tirón.',
      'Cuando más te cueste, suelta el aire con los labios fruncidos.',
      'Calienta unos minutos caminando suave antes de empezar a subir.',
      'Si te falta el aire, para, apoya las manos en los muslos con el cuerpo un poco hacia delante y respira con los labios fruncidos.',
      'Comenta con tu médico que a veces te cuesta subir montañas: no hay que dar por hecho que sea por la voz.',
    ],
  },
  {
    id: 'speech',
    label: 'Hablar',
    title: 'Para el habla',
    intro: 'Para que el aire te llegue hasta el final de la frase: coordinar la respiración con la voz.',
    tips: [
      'Toma aire con calma antes de empezar a hablar.',
      'Frases cortas, y una pausa para respirar antes de quedarte sin aire.',
      'Habla sin prisa y sin apretar la garganta. No acabes una frase «a la fuerza».',
      'Empieza la voz suave, sin golpe, como cuando dices «mmm».',
      'Bebe agua a lo largo del día.',
      'Evita gritar y carraspear: en su lugar, traga saliva o bebe un sorbo.',
      'Los ejercicios con voz, mejor revisarlos con tu logopeda.',
    ],
  },
]

export const EXERCISES: Exercise[] = [
  // ── Relajarse ──
  {
    id: 'tranquila',
    category: 'relax',
    title: 'Respiración tranquila',
    summary: 'Con la barriga, despacio y sin esfuerzo.',
    steps: [
      'Siéntate cómoda, con la espalda apoyada y los hombros sueltos.',
      'Pon una mano en la barriga si te ayuda a notarla.',
      'Toma el aire por la nariz mientras crece el círculo, sin llenarte del todo.',
      'Suéltalo sin empujar mientras se hace pequeño.',
    ],
    visual: 'circle',
    inhale: 3,
    exhale: 4,
    inhaleText: 'Toma aire por la nariz',
    exhaleText: 'Suéltalo sin empujar',
  },
  {
    id: 'labios',
    category: 'relax',
    title: 'Labios fruncidos',
    summary: 'Soltar el aire despacio, como si enfriaras una bebida.',
    steps: [
      'Toma el aire suavemente por la nariz.',
      'Frunce un poco los labios, como para soplar a una sopa caliente.',
      'Suelta el aire despacio por los labios, sin soplar fuerte.',
      'No intentes alargarlo al máximo: que sea cómodo.',
    ],
    visual: 'wave',
    inhale: 3,
    exhale: 5,
    inhaleText: 'Toma aire por la nariz',
    exhaleText: 'Suelta por los labios, despacio',
  },
  {
    id: 'desconectar',
    category: 'relax',
    title: 'Para desconectar',
    summary: 'Un poco más lenta, para antes de dormir o después de un día largo.',
    steps: [
      'Túmbate o siéntate, como estés más a gusto.',
      'Toma el aire por la nariz sin prisa.',
      'Suéltalo un poco más despacio de lo que lo tomas.',
      'Si te cuesta llegar, baja los tiempos: no se trata de aguantar.',
    ],
    visual: 'circle',
    inhale: 4,
    exhale: 6,
    inhaleText: 'Toma aire sin prisa',
    exhaleText: 'Suelta despacio',
  },
  // ── Deporte ──
  {
    id: 'caminar',
    category: 'sport',
    title: 'Caminar con ritmo',
    summary: 'Dos pasos tomando aire, cuatro soltándolo.',
    steps: [
      'Camina a un paso cómodo.',
      'Toma el aire por la nariz durante dos pasos.',
      'Suéltalo con los labios fruncidos durante cuatro pasos.',
      'Ajusta los segundos a tu paso: cada punto es un paso.',
    ],
    visual: 'steps',
    inhale: 2,
    exhale: 4,
    inhaleSteps: 2,
    exhaleSteps: 4,
    inhaleText: 'Toma aire',
    exhaleText: 'Suelta con los labios fruncidos',
  },
  {
    id: 'cuestas',
    category: 'sport',
    title: 'Subir cuestas',
    summary: 'Pasos cortos: dos tomando aire, tres soltándolo.',
    steps: [
      'Acorta el paso y baja el ritmo antes de empezar a subir.',
      'Toma el aire durante dos pasos.',
      'Suéltalo con los labios fruncidos durante tres pasos, en el momento de más esfuerzo.',
      'Si te falta el aire, para un momento: no pasa nada.',
    ],
    visual: 'steps',
    inhale: 2,
    exhale: 3,
    inhaleSteps: 2,
    exhaleSteps: 3,
    inhaleText: 'Toma aire',
    exhaleText: 'Suelta con los labios fruncidos',
  },
  {
    id: 'recuperar',
    category: 'sport',
    title: 'Recuperar el aliento',
    summary: 'Para cuando te has quedado sin aire después de un esfuerzo.',
    steps: [
      'Para y apoya las manos en los muslos, con el cuerpo un poco hacia delante, o siéntate.',
      'Suelta los hombros.',
      'Toma el aire por la nariz, corto y tranquilo.',
      'Suéltalo con los labios fruncidos, el doble de largo, sin empujar.',
    ],
    visual: 'wave',
    inhale: 2,
    exhale: 4,
    inhaleText: 'Toma aire por la nariz',
    exhaleText: 'Suelta por los labios fruncidos',
  },
  // ── Hablar ──
  {
    id: 'sss',
    category: 'speech',
    title: 'Aire continuo con «sss»',
    summary: 'Soltar el aire de forma suave y continua, sin voz.',
    steps: [
      'Toma el aire tranquila, por la nariz.',
      'Suéltalo haciendo una «sss» suave (o una «fff»), sin voz.',
      'Que suene igual de principio a fin, sin sacar el aire de golpe.',
      'Para antes de quedarte sin aire: no hace falta vaciar los pulmones.',
    ],
    visual: 'bar',
    inhale: 3,
    exhale: 4,
    inhaleText: 'Toma aire',
    exhaleText: 'Sssss… suave y continua',
  },
  {
    id: 'contar',
    category: 'speech',
    title: 'Contar sin prisa',
    summary: 'Contar en voz baja, un número por segundo, con el aire de una vez.',
    steps: [
      'Toma el aire tranquila.',
      'Cuenta en voz baja, sin forzar, siguiendo los números: uno por segundo.',
      'Deja de contar en cuanto notes que vas justa de aire.',
      'Vuelve a tomar aire y empieza otra vez desde el uno.',
    ],
    visual: 'count',
    inhale: 3,
    exhale: 4,
    inhaleText: 'Toma aire',
    exhaleText: 'Cuenta en voz baja',
  },
  {
    id: 'frases',
    category: 'speech',
    title: 'Frases cortas',
    summary: 'Tomar aire, decir una frase corta y descansar.',
    steps: [
      'Toma el aire con calma mientras crece el círculo.',
      'Lee la frase en voz alta, tranquila y con la voz suave.',
      'Descansa respirando normal antes de la siguiente.',
      'Si te sobra aire, prueba con frases un poco más largas.',
    ],
    visual: 'phrases',
    inhale: 3,
    exhale: 4,
    rest: 2,
    inhaleText: 'Toma aire',
    exhaleText: 'Ahora dilo en voz alta',
  },
]

/**
 * Sentences for «Frases cortas»: everyday ones, without hard words, and starting with a soft sound
 * (m, n, l, ll) so the voice starts without a blow. Short: 4–6 syllables; longer: 8–11.
 */
export const PHRASES: Record<'short' | 'long', string[]> = {
  short: [
    'Mañana nos vemos.',
    'Me lo llevo.',
    'Luego lo miro.',
    'Nos vamos ya.',
    'Mira la luna.',
    'Lo hago yo.',
    'Me gusta mucho.',
    'Nadie lo sabe.',
    'Llámame luego.',
    'Mamá ya viene.',
    'Lleva el abrigo.',
    'No me lo creo.',
  ],
  long: [
    'Mañana me levanto temprano.',
    'Luego vamos a comprar el pan.',
    'Me apetece un café con leche.',
    'Nos vemos a las nueve en la plaza.',
    'La lavadora ya ha terminado.',
    'Mira qué bonito está el jardín.',
    'Llevo las llaves en el bolso.',
    'Necesito una manta para el sofá.',
    'Mi hermano llega el lunes.',
    'Le mando un mensaje a la abuela.',
  ],
}

export const SAFETY = {
  /** Always on screen during an exercise. */
  stop: 'Si notas mareo, ahogo o malestar, para y respira con normalidad.',
  general:
    'Son orientaciones generales: no sustituyen la valoración ni el tratamiento de un logopeda. Con nódulos en las cuerdas vocales, los ejercicios con voz conviene adaptarlos con un profesional.',
  noHolding: 'Aquí nunca se aguanta el aire. No fuerces ni intentes alargar los tiempos al máximo.',
  alarm:
    'Si hay dificultad para respirar intensa o repentina, no se puede hablar por falta de aire, dolor en el pecho, desmayo o labios azulados, hay que buscar atención médica urgente (112).',
  whom: [
    { who: 'Otorrinolaringólogo', what: 'para el seguimiento de los nódulos y las cuerdas vocales.' },
    { who: 'Logopeda especializado en voz', what: 'para la técnica vocal y coordinar la respiración con el habla.' },
    { who: 'Médico de cabecera', what: 'para comentar que a veces cuesta subir montañas.' },
  ],
}

export const exerciseById = (id: string): Exercise | undefined => EXERCISES.find((e) => e.id === id)
export const categoryById = (id: string): Category | undefined => CATEGORIES.find((c) => c.id === id)
export const exercisesOf = (category: BreathCategory): Exercise[] => EXERCISES.filter((e) => e.category === category)

// ── Settings (kept on the device) ──────────────────────────────────────────

export interface BreathSettings {
  inhale: number
  exhale: number
  /** Length of the session in minutes. */
  minutes: number
  /** Sentences for «Frases cortas». */
  phrases: 'short' | 'long'
}

export const MINUTES = [1, 2, 3, 5]
/** Seconds a phase can last: never very long, as nothing is to be forced. */
export const INHALE_RANGE = [1.5, 6] as const
export const EXHALE_RANGE = [2, 8] as const
export const STEP = 0.5

export function defaultSettings(e: Exercise): BreathSettings {
  return { inhale: e.inhale, exhale: e.exhale, minutes: 2, phrases: 'short' }
}

const clamp = (n: number, [min, max]: readonly [number, number]) => Math.min(max, Math.max(min, n))
const toStep = (n: number) => Math.round(n / STEP) * STEP

/** Settings read back from storage, made safe (missing, broken or out of range → the defaults). */
export function cleanSettings(e: Exercise, raw: unknown): BreathSettings {
  const base = defaultSettings(e)
  if (!raw || typeof raw !== 'object') return base
  const r = raw as Partial<Record<keyof BreathSettings, unknown>>
  const num = (v: unknown, fallback: number, range: readonly [number, number]) =>
    typeof v === 'number' && Number.isFinite(v) ? clamp(toStep(v), range) : fallback
  return {
    inhale: num(r.inhale, base.inhale, INHALE_RANGE),
    exhale: num(r.exhale, base.exhale, EXHALE_RANGE),
    minutes: typeof r.minutes === 'number' && MINUTES.includes(r.minutes) ? r.minutes : base.minutes,
    phrases: r.phrases === 'long' ? 'long' : 'short',
  }
}

/** One step up or down of a phase's seconds, within its range. */
export function nudge(seconds: number, by: 1 | -1, range: readonly [number, number]): number {
  return clamp(toStep(seconds + by * STEP), range)
}

// ── Timing of a session ────────────────────────────────────────────────────

export interface Phase {
  kind: PhaseKind
  seconds: number
}

/** One round of the exercise: in, out (or speak), and for the sentences a short rest. */
export function roundOf(e: Exercise, s: Pick<BreathSettings, 'inhale' | 'exhale'>): Phase[] {
  if (e.visual === 'phrases') {
    return [
      { kind: 'inhale', seconds: s.inhale },
      { kind: 'speak', seconds: s.exhale },
      { kind: 'rest', seconds: e.rest ?? 2 },
    ]
  }
  return [
    { kind: 'inhale', seconds: s.inhale },
    { kind: 'exhale', seconds: s.exhale },
  ]
}

export const roundLength = (round: Phase[]) => round.reduce((sum, p) => sum + p.seconds, 0)

/** How many rounds fit in the session: at least one, and the last one is always finished. */
export function roundsIn(round: Phase[], minutes: number): number {
  return Math.max(1, Math.round((minutes * 60) / roundLength(round)))
}

export interface Moment {
  /** 0-based round. */
  round: number
  phase: Phase
  /** 0 to 1 through the phase. */
  progress: number
  /** Whole seconds left in the phase, counting down to 1. */
  secondsLeft: number
}

/** Where a session is after `elapsed` seconds; null once it is over. */
export function momentAt(round: Phase[], rounds: number, elapsed: number): Moment | null {
  const length = roundLength(round)
  if (elapsed < 0) elapsed = 0
  if (elapsed >= length * rounds) return null
  const index = Math.floor(elapsed / length)
  let t = elapsed - index * length
  for (const phase of round) {
    if (t < phase.seconds) {
      return { round: index, phase, progress: t / phase.seconds, secondsLeft: Math.ceil(phase.seconds - t) }
    }
    t -= phase.seconds
  }
  // Floating point at the very end of a round.
  const last = round[round.length - 1]!
  return { round: index, phase: last, progress: 1, secondsLeft: 1 }
}

/**
 * How big the circle is (0 to 1) at a moment: it grows while breathing in, shrinks while breathing
 * out or speaking, and stays small while resting. Eased, so it starts and ends softly.
 */
export function circleSize(m: Pick<Moment, 'phase' | 'progress'>): number {
  const eased = (1 - Math.cos(Math.PI * m.progress)) / 2
  switch (m.phase.kind) {
    case 'inhale':
      return eased
    case 'exhale':
    case 'speak':
      return 1 - eased
    case 'rest':
      return 0
  }
}

/** Which dot (step) is lit, 0-based, in a phase of `steps` steps. */
export function stepAt(progress: number, steps: number): number {
  return Math.min(steps - 1, Math.floor(progress * steps))
}

/** The number to say, 1-based, one a second, while counting. */
export function countAt(m: Pick<Moment, 'phase' | 'progress'>): number {
  return Math.min(Math.ceil(m.phase.seconds), Math.floor(m.progress * m.phase.seconds) + 1)
}

/** The sentence for a round: the list in order, starting at a different one each session. */
export function phraseFor(list: string[], round: number, start = 0): string {
  return list[(start + round) % list.length]!
}

// ── What the chosen times are good for ─────────────────────────────────────

export interface TimingHint {
  /** `care`: a nudge to lower the times or change them (never alarming). */
  tone: 'info' | 'care'
  text: string
}

/** Above this, a round is long for anyone: it relaxes a lot, but it is hard to keep up. */
const VERY_SLOW = 12

/**
 * The small assistant under the times: what this combination is good for, said as the person
 * changes it. Relax and sport look at the whole breath (seconds in + out, breaths a minute) and at
 * whether breathing out is longer than in; speech looks at how long the air has to last while
 * speaking. Up to two hints, the main one first. Design notes: docs/respiracion.md §4.
 */
export function timingHints(e: Exercise, s: Pick<BreathSettings, 'inhale' | 'exhale'>): TimingHint[] {
  const { inhale, exhale } = s
  if (e.category === 'speech') return speechHints(e, inhale, exhale)

  const cycle = inhale + exhale
  const perMinute = Math.round(60 / cycle)
  const hints: TimingHint[] = []

  if (exhale < inhale) {
    hints.push({
      tone: 'care',
      text: 'Sueltas el aire más deprisa de lo que lo tomas: así el cuerpo se activa más que se relaja. Para calmarte, que soltar dure un poco más que tomar aire.',
    })
  } else if (cycle >= VERY_SLOW) {
    hints.push({
      tone: 'care',
      text: `Muy lenta, unas ${perMinute} respiraciones por minuto: relaja mucho, pero cuesta mantenerla. Si te entran ganas de tomar aire antes de tiempo o notas mareo, baja los tiempos: aquí no se trata de aguantar.`,
    })
  } else if (e.category === 'relax') {
    hints.push(relaxHint(cycle, perMinute))
    if (exhale === inhale) {
      hints.push({ tone: 'info', text: 'Tomas y sueltas el mismo tiempo: equilibrado, bueno para centrarte. Para relajarte más, alarga un poco el soltar.' })
    }
  } else if (e.visual === 'steps') {
    hints.push(walkingHint(cycle))
  } else {
    hints.push(recoverHint(cycle))
  }
  return hints
}

function relaxHint(cycle: number, perMinute: number): TimingHint {
  if (cycle < 5) {
    return {
      tone: 'info',
      text: `Ritmo corto, unas ${perMinute} respiraciones por minuto: parecido a como respiras sin pensar. Va bien para empezar o para un par de minutos rápidos; para relajarte más, ve alargando poco a poco el soltar.`,
    }
  }
  if (cycle < 9) {
    return {
      tone: 'info',
      text: `Ritmo tranquilo, unas ${perMinute} respiraciones por minuto: bueno para el día a día y para bajar la tensión sin esfuerzo.`,
    }
  }
  return {
    tone: 'info',
    text: `Ritmo lento, unas ${perMinute} respiraciones por minuto: el que más relaja. Ideal antes de dormir o después de un día largo.`,
  }
}

function walkingHint(cycle: number): TimingHint {
  if (cycle < 5) {
    return {
      tone: 'info',
      text: 'Ritmo rápido: va bien cuando más aprieta el esfuerzo, como en lo más empinado de una cuesta. Si puedes, alarga un poco el soltar.',
    }
  }
  if (cycle < 8.5) {
    return {
      tone: 'info',
      text: 'Ritmo cómodo para caminar o subir a buen paso: el aire entra corto y sale largo, que es lo que más ayuda a no ahogarse.',
    }
  }
  return {
    tone: 'info',
    text: 'Ritmo lento para ir andando: va bien paseando suave o en llano. Subiendo, seguramente te pida tiempos más cortos.',
  }
}

function recoverHint(cycle: number): TimingHint {
  if (cycle < 5) {
    return {
      tone: 'info',
      text: 'Respiración corta: normal al principio, cuando aún te falta el aire. Según te vayas calmando, alarga poco a poco el soltar.',
    }
  }
  if (cycle < 9) {
    return {
      tone: 'info',
      text: 'Buena para recuperarte: aire corto por la nariz y largo por los labios fruncidos. Cuando respires bien, puedes seguir.',
    }
  }
  return {
    tone: 'info',
    text: 'Esto ya es una respiración lenta, de relajarse. Si todavía te falta el aire, mejor tiempos más cortos.',
  }
}

function speechHints(e: Exercise, inhale: number, exhale: number): TimingHint[] {
  const what = e.visual === 'bar' ? 'la «sss»' : e.visual === 'count' ? 'contar' : 'hablar'
  const hints: TimingHint[] = []
  if (exhale <= 3) {
    hints.push({
      tone: 'info',
      text: `Poco aire para ${what}: va bien para empezar o los días en que la voz está cansada. Equivale a una frase muy corta.`,
    })
  } else if (exhale <= 5) {
    hints.push({
      tone: 'info',
      text: `Un tramo cómodo para ${what}, como el de una frase corta del día a día. Es el que más se usa al hablar.`,
    })
  } else if (exhale <= 6.5) {
    hints.push({
      tone: 'info',
      text: `Un tramo largo para ${what}: entrena a que el aire te llegue a frases más largas. Para antes de quedarte justa de aire.`,
    })
  } else {
    hints.push({
      tone: 'care',
      text: `Muy largo para ${what} con un solo aire: con nódulos no conviene apurar el aire hasta el final. Mejor tramos más cortos y tomar aire más a menudo.`,
    })
  }
  if (inhale >= 4.5) {
    hints.push({
      tone: 'info',
      text: 'En una conversación casi nunca hay tiempo para tomar aire tanto rato: practica también con 2 o 3 segundos.',
    })
  }
  return hints
}

/** «3 s», «2,5 s». */
export function secondsText(n: number): string {
  return `${String(n).replace('.', ',')} s`
}
