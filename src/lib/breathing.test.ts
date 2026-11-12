import { describe, expect, it } from 'vitest'
import {
  CATEGORIES,
  breathsPerMinute,
  timingAdvice,
  EXERCISES,
  PHRASES,
  circleSize,
  cleanSettings,
  countAt,
  exerciseById,
  momentAt,
  nudge,
  phraseFor,
  roundLength,
  roundOf,
  roundsIn,
  secondsText,
  stepAt,
  EXHALE_RANGE,
  INHALE_RANGE,
} from './breathing'

const calm = exerciseById('tranquila')!
const phrases = exerciseById('frases')!

describe('exercises', () => {
  it('every category has exercises and every exercise a known category, unique ids', () => {
    for (const c of CATEGORIES) expect(EXERCISES.some((e) => e.category === c.id)).toBe(true)
    expect(new Set(EXERCISES.map((e) => e.id)).size).toBe(EXERCISES.length)
  })

  it('never hold the breath: rounds are only in, out, speak and rest', () => {
    for (const e of EXERCISES) {
      expect(roundOf(e, e).map((p) => p.kind).every((k) => k !== ('hold' as string))).toBe(true)
      expect(e.inhale).toBeGreaterThanOrEqual(INHALE_RANGE[0])
      expect(e.inhale).toBeLessThanOrEqual(INHALE_RANGE[1])
      expect(e.exhale).toBeGreaterThanOrEqual(EXHALE_RANGE[0])
      expect(e.exhale).toBeLessThanOrEqual(EXHALE_RANGE[1])
    }
  })

  it('sentences start with a soft sound', () => {
    for (const p of [...PHRASES.short, ...PHRASES.long]) expect(p).toMatch(/^(M|N|L)/)
  })
})

describe('settings', () => {
  it('fall back to the defaults when missing or broken', () => {
    expect(cleanSettings(calm, null)).toEqual({ inhale: 3, exhale: 4, minutes: 2, phrases: 'short' })
    expect(cleanSettings(calm, { inhale: 'x', minutes: 7, phrases: 'huge' })).toEqual({ inhale: 3, exhale: 4, minutes: 2, phrases: 'short' })
  })

  it('stay within range, in half seconds', () => {
    expect(cleanSettings(calm, { inhale: 20, exhale: 0.2, minutes: 5, phrases: 'long' })).toEqual({
      inhale: 6,
      exhale: 2,
      minutes: 5,
      phrases: 'long',
    })
    expect(cleanSettings(calm, { inhale: 3.3 }).inhale).toBe(3.5)
  })

  it('nudge by half a second, never past the range', () => {
    expect(nudge(3, 1, INHALE_RANGE)).toBe(3.5)
    expect(nudge(6, 1, INHALE_RANGE)).toBe(6)
    expect(nudge(2, -1, EXHALE_RANGE)).toBe(2)
  })
})

describe('timing', () => {
  it('a round is in and out; with sentences, in, speak and rest', () => {
    expect(roundOf(calm, { inhale: 3, exhale: 4 })).toEqual([
      { kind: 'inhale', seconds: 3 },
      { kind: 'exhale', seconds: 4 },
    ])
    expect(roundOf(phrases, { inhale: 3, exhale: 4 }).map((p) => p.kind)).toEqual(['inhale', 'speak', 'rest'])
  })

  it('fits whole rounds in the minutes asked for', () => {
    const round = roundOf(calm, { inhale: 3, exhale: 4 })
    expect(roundLength(round)).toBe(7)
    expect(roundsIn(round, 1)).toBe(9)
    expect(roundsIn(roundOf(calm, { inhale: 6, exhale: 8 }), 0.1)).toBe(1)
  })

  it('knows the phase, its progress and the seconds left', () => {
    const round = roundOf(calm, { inhale: 3, exhale: 4 })
    expect(momentAt(round, 2, 0)).toEqual({ round: 0, phase: round[0], progress: 0, secondsLeft: 3 })
    expect(momentAt(round, 2, 1.5)).toMatchObject({ round: 0, phase: { kind: 'inhale' }, progress: 0.5, secondsLeft: 2 })
    expect(momentAt(round, 2, 5)).toMatchObject({ round: 0, phase: { kind: 'exhale' }, progress: 0.5, secondsLeft: 2 })
    expect(momentAt(round, 2, 7)).toMatchObject({ round: 1, phase: { kind: 'inhale' }, progress: 0 })
    expect(momentAt(round, 2, 14)).toBeNull()
  })

  it('the circle grows breathing in and shrinks breathing out, softly', () => {
    const inhale = { kind: 'inhale' as const, seconds: 3 }
    const exhale = { kind: 'exhale' as const, seconds: 4 }
    expect(circleSize({ phase: inhale, progress: 0 })).toBe(0)
    expect(circleSize({ phase: inhale, progress: 0.5 })).toBeCloseTo(0.5)
    expect(circleSize({ phase: inhale, progress: 1 })).toBeCloseTo(1)
    expect(circleSize({ phase: exhale, progress: 0 })).toBe(1)
    expect(circleSize({ phase: exhale, progress: 0.1 })).toBeGreaterThan(0.9)
    expect(circleSize({ phase: { kind: 'rest', seconds: 2 }, progress: 0.5 })).toBe(0)
  })

  it('lights one dot per step and says one number a second', () => {
    expect([0, 0.3, 0.5, 0.99].map((p) => stepAt(p, 4))).toEqual([0, 1, 2, 3])
    expect(stepAt(1, 4)).toBe(3)
    const out = { kind: 'exhale' as const, seconds: 4 }
    expect([0, 0.24, 0.25, 0.9].map((progress) => countAt({ phase: out, progress }))).toEqual([1, 1, 2, 4])
  })

  it('goes through the sentences in order, from any start', () => {
    expect(phraseFor(['a', 'b', 'c'], 0, 1)).toBe('b')
    expect(phraseFor(['a', 'b', 'c'], 2, 1)).toBe('a')
  })

  it('writes seconds the Spanish way', () => {
    expect(secondsText(3)).toBe('3 s')
    expect(secondsText(2.5)).toBe('2,5 s')
  })
})

describe('timingAdvice', () => {
  const advice = (id: string, inhale: number, exhale: number) => timingAdvice(exerciseById(id)!, { inhale, exhale })

  it('never says anything for the defaults that sounds like a warning', () => {
    for (const e of EXERCISES) expect(timingAdvice(e, e).tone).not.toBe('care')
  })

  it('relaxing: by breaths a minute and how long you breathe out', () => {
    expect(advice('tranquila', 3, 4).title).toBe('Para relajarte a diario')
    expect(advice('desconectar', 4, 6).title).toBe('Para relajarte mucho')
    expect(advice('tranquila', 2, 2)).toMatchObject({ tone: 'info', title: 'Ritmo ágil' })
    expect(advice('tranquila', 4, 3)).toMatchObject({ tone: 'info', title: 'Activa más que relaja' })
    expect(advice('tranquila', 3, 8)).toMatchObject({ tone: 'care', title: 'Relaja mucho, sin forzar' })
    expect(advice('tranquila', 6, 6.5)).toMatchObject({ tone: 'care', title: 'Muy lento' })
  })

  it('walking: by the pace of each step', () => {
    expect(advice('caminar', 2, 4).title).toBe('Paso de paseo')
    expect(advice('caminar', 1.5, 2)).toMatchObject({ tone: 'info', title: 'Paso rápido' })
    expect(advice('cuestas', 3, 4.5).title).toBe('Paso lento')
    expect(advice('caminar', 3, 2).tone).toBe('care')
  })

  it('getting your breath back: by how much you still need it', () => {
    expect(advice('recuperar', 2, 4).title).toBe('Justo después del esfuerzo')
    expect(advice('recuperar', 3, 5).title).toBe('Para terminar de recuperarte')
  })

  it('speech: warns gently about long sentences and long breaths out', () => {
    expect(advice('frases', 3, 3).title).toBe('Para empezar')
    expect(advice('frases', 3, 6)).toMatchObject({ tone: 'care', title: 'Frases largas' })
    expect(advice('frases', 5, 4).title).toBe('Mucho rato tomando aire')
    expect(advice('sss', 3, 7).tone).toBe('care')
    expect(advice('contar', 3, 2.5).title).toBe('Salida corta')
  })

  it('counts the rest after a sentence in the breaths a minute', () => {
    expect(breathsPerMinute(exerciseById('frases')!, { inhale: 3, exhale: 5 })).toBe(6)
    expect(breathsPerMinute(exerciseById('tranquila')!, { inhale: 3, exhale: 3 })).toBe(10)
  })
})
