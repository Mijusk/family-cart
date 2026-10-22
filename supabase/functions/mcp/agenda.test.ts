import { describe, expect, it } from 'vitest'
import type { EventTiming } from '../../../src/types.ts'
import { agenda, eventSummary, nextDays, nowIn, taskSummary, timeText, type AgendaEvent } from './agenda.ts'

const timing = (t: Partial<EventTiming>): EventTiming => ({
  allDay: false,
  startDate: '2026-11-02',
  startTime: '17:00',
  endTime: '18:00',
  repeat: 'none',
  repeatWeekdays: null,
  repeatUntil: null,
  ...t,
})

const event = (e: Partial<AgendaEvent>): AgendaEvent => ({
  id: 'e1',
  title: 'Natación',
  notes: null,
  location: null,
  folder: 'Deporte',
  ownerId: 'marta',
  participants: [],
  editable: true,
  reminderOnly: false,
  timing: timing({}),
  exceptions: [],
  ...e,
})

const names: Record<string, string> = { marta: 'Marta', pablo: 'Pablo', daniel: 'Daniel' }
const name = (id: string) => names[id] ?? 'Alguien'

describe('texts', () => {
  it('writes times and summaries as the prompt asks', () => {
    expect(timeText({ allDay: false, startTime: '17:30', endTime: '18:30' })).toBe('17:30–18:30')
    expect(timeText({ allDay: false, startTime: '23:00', endTime: '01:00' })).toBe('23:00–01:00 (acaba al día siguiente)')
    expect(timeText({ allDay: true, startTime: null, endTime: null })).toBe('todo el día')
    expect(eventSummary({ ...timing({ startDate: '2026-11-04', startTime: '17:30', endTime: '18:30' }), title: 'Dentista' }, 'Médico')).toBe(
      'Dentista · mié 4 nov, 17:30–18:30 · carpeta Médico',
    )
    expect(eventSummary({ ...timing({ repeat: 'weekly', repeatWeekdays: [1, 3] }), title: 'Natación' }, null)).toBe(
      'Natación · lun 2 nov, 17:00–18:00 · cada semana: lunes y miércoles',
    )
    expect(taskSummary({ title: 'Regalo', dueDate: '2026-11-04' }, 'Pendientes')).toBe('Regalo · para el mié 4 nov · lista Pendientes')
  })

  it('gives today, the time and the next days in the group zone', () => {
    // 22:30 UTC on a Thursday is already Friday in Madrid (UTC+1 in November).
    expect(nowIn('Europe/Madrid', new Date('2026-11-05T23:30:00Z'))).toEqual({ fecha: '2026-11-06', dia_semana: 'viernes', hora: '00:30' })
    expect(nextDays('2026-11-06', 3)).toEqual([
      { fecha: '2026-11-06', dia: 'vie 6 nov' },
      { fecha: '2026-11-07', dia: 'sáb 7 nov' },
      { fecha: '2026-11-08', dia: 'dom 8 nov' },
    ])
  })
})

describe('agenda', () => {
  const weekly = event({ timing: timing({ repeat: 'weekly', repeatWeekdays: [1, 3] }) })

  it('expands repetitions day by day, with every day of the range', () => {
    const days = agenda([weekly], '2026-11-02', '2026-11-08', name)
    expect(days).toHaveLength(7)
    expect(days.filter((d) => d.eventos.length).map((d) => d.fecha)).toEqual(['2026-11-02', '2026-11-04'])
    expect(days[0]!.eventos[0]).toEqual({
      evento_id: 'e1',
      fecha_serie: '2026-11-02',
      titulo: 'Natación',
      hora: '17:00–18:00',
      de: 'Marta',
      carpeta: 'Deporte',
      repite: 'Cada semana: lunes y miércoles',
      puedo_editar: true,
    })
  })

  it('leaves cancelled days out and shows changed ones with their data, on their new date', () => {
    const changed = {
      ...weekly,
      exceptions: [
        { eventId: 'e1', occurrenceDate: '2026-11-02', status: 'cancelled' as const, overrides: {} },
        { eventId: 'e1', occurrenceDate: '2026-11-04', status: 'modified' as const, overrides: { startDate: '2026-11-05', title: 'Natación libre' } },
      ],
    }
    const days = agenda([changed], '2026-11-02', '2026-11-08', name)
    expect(days.filter((d) => d.eventos.length).map((d) => d.fecha)).toEqual(['2026-11-05'])
    expect(days[3]!.eventos[0]).toMatchObject({ titulo: 'Natación libre', fecha_serie: '2026-11-04', cambiado_solo_este_dia: true })
  })

  it('shows busy slots without title, folder, place or notes', () => {
    const busy = event({ id: 'b1', title: null, folder: 'Gimnasio', location: 'Gym', notes: 'x', ownerId: 'daniel', editable: false })
    expect(agenda([busy], '2026-11-02', '2026-11-02', name)[0]!.eventos[0]).toEqual({
      evento_id: 'b1',
      titulo: 'Ocupado',
      hora: '17:00–18:00',
      de: 'Daniel',
      ocupado: true,
      puedo_editar: false,
    })
  })

  it('filters by person (owner or participant) and orders all-day first', () => {
    const school = event({ id: 'e2', title: 'Colegio', ownerId: 'pablo', timing: timing({ startTime: '09:00', endTime: '14:00' }) })
    const party = event({ id: 'e3', title: 'Cumple', participants: ['pablo'], timing: timing({ allDay: true, startTime: null, endTime: null }) })
    const gym = event({ id: 'e4', title: 'Gym', ownerId: 'daniel' })
    const day = agenda([gym, school, party], '2026-11-02', '2026-11-02', name, { personId: 'pablo' })[0]!
    expect(day.eventos.map((e) => e.titulo)).toEqual(['Cumple', 'Colegio'])
    expect(day.eventos[0]!.con).toEqual(['Pablo'])
  })

  it('lists a night shift on the day it starts only', () => {
    const night = event({ timing: timing({ startDate: '2026-11-01', startTime: '22:00', endTime: '06:00' }) })
    expect(agenda([night], '2026-11-02', '2026-11-02', name)[0]!.eventos).toEqual([])
    expect(agenda([night], '2026-11-01', '2026-11-02', name)[0]!.eventos[0]!.hora).toBe('22:00–06:00 (acaba al día siguiente)')
  })

  it('marks a recordatorio and gives only its time', () => {
    const pill = event({ title: 'Pastilla', reminderOnly: true, timing: timing({ startTime: '09:00', endTime: '09:15' }) })
    expect(agenda([pill], '2026-11-02', '2026-11-02', name)[0]!.eventos[0]).toMatchObject({ titulo: 'Pastilla', hora: 'aviso a las 09:00', recordatorio: true })
    expect(eventSummary({ ...timing({ startTime: '09:00', endTime: '09:15' }), title: 'Pastilla', reminderOnly: true }, 'Salud')).toBe(
      'Pastilla · lun 2 nov, aviso a las 09:00 · recordatorio · carpeta Salud',
    )
  })

  it('cuts long notes', () => {
    const long = event({ notes: 'a'.repeat(400) })
    expect(agenda([long], '2026-11-02', '2026-11-02', name)[0]!.eventos[0]!.notas).toHaveLength(301)
  })
})
