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

/** «3 s», «2,5 s». */
export function secondsText(n: number): string {
  return `${String(n).replace('.', ',')} s`
}

// ── The assistant: what the chosen times are good for ──────────────────────

/** good: fine as it is; info: worth knowing; care: easy to overdo, said gently. */
export type AdviceTone = 'good' | 'info' | 'care'

export interface Advice {
  tone: AdviceTone
  title: string
  text: string
}

/** Breaths a minute with these times (one round: in, out and the rest after a sentence). */
export function breathsPerMinute(e: Exercise, s: Pick<BreathSettings, 'inhale' | 'exhale'>): number {
  return 60 / roundLength(roundOf(e, s))
}

/**
 * A comment on the times chosen, as they change: what that combination is good for, and a gentle
 * warning when it asks too much (long breaths out, sentences that run out of air). Never pushes
 * to make them longer: the guide asks for comfort over seconds.
 */
export function timingAdvice(e: Exercise, s: Pick<BreathSettings, 'inhale' | 'exhale'>): Advice {
  const perMinute = Math.round(breathsPerMinute(e, s))
  const outFaster = s.exhale < s.inhale

  if (e.visual === 'phrases') {
    if (s.exhale >= 5.5) {
      return {
        tone: 'care',
        title: 'Frases largas',
        text: 'Es justo cuando más fácil es quedarse sin aire. Con nódulos, mejor parar a respirar antes de apurarlo: si llegas justa, baja el tiempo.',
      }
    }
    if (s.inhale >= 4.5) {
      return {
        tone: 'info',
        title: 'Mucho rato tomando aire',
        text: 'Para hablar no hace falta llenarse: una toma tranquila de 2 o 3 segundos basta y la voz sale más suelta.',
      }
    }
    if (s.exhale <= 3) {
      return {
        tone: 'good',
        title: 'Para empezar',
        text: 'Frases muy cortas: te sobra aire y la voz no se cansa. Perfecto para los primeros días o si hoy notas la voz cansada.',
      }
    }
    return {
      tone: 'good',
      title: 'Como al hablar en casa',
      text: 'Una frase corta o media con una toma de aire: lo que más se usa en una conversación normal.',
    }
  }

  if (e.visual === 'bar' || e.visual === 'count') {
    if (s.exhale >= 6.5) {
      return {
        tone: 'care',
        title: 'Salida muy larga',
        text: 'Sostener el aire tanto rato es exigente. No compitas por durar más: importa que salga igual de principio a fin, sin apretar.',
      }
    }
    if (s.exhale <= 3) {
      return {
        tone: 'info',
        title: 'Salida corta',
        text: 'Buena para empezar o para días de voz cansada. Cuando te resulte fácil, prueba medio segundo más.',
      }
    }
    return {
      tone: 'good',
      title: 'Duración cómoda',
      text: 'Lo justo para practicar un aire continuo sin quedarte vacía: así se aprende a administrarlo al hablar.',
    }
  }

  if (e.visual === 'steps') {
    const perStep = s.exhale / (e.exhaleSteps ?? 4)
    if (outFaster) {
      return {
        tone: 'care',
        title: 'Sueltas más rápido que tomas',
        text: 'Al hacer esfuerzo conviene lo contrario: soltar el aire más despacio, con los labios fruncidos, para no ahogarte en la subida.',
      }
    }
    if (perStep < 0.75) {
      return {
        tone: 'info',
        title: 'Paso rápido',
        text: 'Para caminar ligero o subir con energía. Si te cuesta seguirlo o te falta el aire, alarga los tiempos y baja el ritmo.',
      }
    }
    if (perStep > 1.25) {
      return {
        tone: 'good',
        title: 'Paso lento',
        text: 'Ideal para cuestas empinadas, para el principio de una subida o para volver a coger el ritmo después de parar.',
      }
    }
    return {
      tone: 'good',
      title: 'Paso de paseo',
      text: 'Un paso por segundo, más o menos: cómodo para caminar un rato largo sin que te falte el aire.',
    }
  }

  // Getting your breath back after an effort: short is fine, the point is breathing out slowly.
  if (e.category === 'sport' && !outFaster && s.exhale < 7) {
    return perMinute >= 9
      ? {
          tone: 'good',
          title: 'Justo después del esfuerzo',
          text: `Unas ${perMinute} respiraciones por minuto: lo cómodo cuando aún jadeas. Según te calmes, puedes alargar un poco.`,
        }
      : {
          tone: 'good',
          title: 'Para terminar de recuperarte',
          text: `Unas ${perMinute} respiraciones por minuto: ritmo lento, para cuando ya has cogido aire y quieres volver a la calma.`,
        }
  }

  // Circle and pursed lips: relaxing.
  if (outFaster) {
    return {
      tone: 'info',
      title: 'Activa más que relaja',
      text: 'Sueltas el aire más rápido de lo que lo tomas. Para calmarte, suéltalo igual de largo o un poco más.',
    }
  }
  if (s.exhale >= 7 || s.exhale / s.inhale >= 2.5) {
    return {
      tone: 'care',
      title: 'Relaja mucho, sin forzar',
      text: 'Soltar el aire tanto rato calma mucho, pero no hace falta llegar al máximo. Si notas que te falta el aire o te mareas, acórtalo.',
    }
  }
  if (perMinute < 6) {
    return {
      tone: 'care',
      title: 'Muy lento',
      text: `Unas ${perMinute} respiraciones por minuto: relaja mucho, pero no es para todos. Si te resulta incómodo, vuelve a tiempos más cortos.`,
    }
  }
  if (perMinute <= 8) {
    return {
      tone: 'good',
      title: 'Para relajarte mucho',
      text: `Unas ${perMinute} respiraciones por minuto: un ritmo lento que baja las pulsaciones. Muy bueno antes de dormir o después de un día largo.`,
    }
  }
  if (perMinute <= 12) {
    return {
      tone: 'good',
      title: 'Para relajarte a diario',
      text: `Unas ${perMinute} respiraciones por minuto: tranquilo y sin esfuerzo. Bueno para practicar cada día o cuando estás nerviosa.`,
    }
  }
  return {
    tone: 'info',
    title: 'Ritmo ágil',
    text: `Unas ${perMinute} respiraciones por minuto, casi como respirar normal: sirve para aprender la técnica o recuperar el aliento. Para relajarte más, alarga poco a poco.`,
  }
}
