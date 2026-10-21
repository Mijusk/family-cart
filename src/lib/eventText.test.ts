import { describe, expect, it } from 'vitest'
import type { EventTiming, HistoryEntry } from '@/types'
import { historyText, reminderLabel, repeatLabel, timeLabel } from './eventText'

describe('timeLabel', () => {
  const at = (startTime: string, endTime: string) => ({ allDay: false, startTime, endTime, date: '2026-10-21' })

  it('all day', () => {
    expect(timeLabel({ allDay: true, startTime: null, endTime: null, date: '2026-10-21' }, '2026-10-21')).toBe('Todo el día')
  })

  it('a span of time, ending the next day when it crosses midnight', () => {
    expect(timeLabel(at('08:00', '15:00'), '2026-10-21')).toBe('08:00 – 15:00')
    expect(timeLabel(at('23:00', '00:30'), '2026-10-21')).toBe('23:00 – 00:30 (+1)')
    expect(timeLabel(at('23:00', '00:30'), '2026-10-21', true)).toBe('23:00 – 00:30 del día siguiente')
  })

  it('the part of last night’s event that runs into the day', () => {
    expect(timeLabel(at('23:00', '00:30'), '2026-10-22')).toBe('Hasta las 00:30')
  })
})

describe('repeatLabel', () => {
  const timing = (change: Partial<EventTiming>): EventTiming => ({
    allDay: false,
    startDate: '2026-10-07',
    startTime: '17:00',
    endTime: '18:00',
    repeat: 'none',
    repeatWeekdays: null,
    repeatUntil: null,
    ...change,
  })

  it('null when it does not repeat', () => {
    expect(repeatLabel(timing({}))).toBeNull()
  })

  it('each kind', () => {
    expect(repeatLabel(timing({ repeat: 'daily' }))).toBe('Cada día')
    expect(repeatLabel(timing({ repeat: 'weekly', repeatWeekdays: [5, 1, 3] }))).toBe('Cada semana: lunes, miércoles y viernes')
    expect(repeatLabel(timing({ repeat: 'biweekly', repeatWeekdays: [2] }))).toBe('Cada dos semanas: martes')
    expect(repeatLabel(timing({ repeat: 'monthly' }))).toBe('Cada mes, el día 7')
  })

  it('with an end date', () => {
    expect(repeatLabel(timing({ repeat: 'daily', repeatUntil: '2026-12-20' }))).toBe('Cada día · hasta el 20 dic')
  })
})

describe('reminderLabel', () => {
  it('presets and combinations', () => {
    expect(reminderLabel(0)).toBe('Al empezar')
    expect(reminderLabel(15)).toBe('15 minutos antes')
    expect(reminderLabel(60)).toBe('1 hora antes')
    expect(reminderLabel(1440)).toBe('1 día antes')
    expect(reminderLabel(10080)).toBe('1 semana antes')
    expect(reminderLabel(3060)).toBe('2 días y 3 horas antes')
    expect(reminderLabel(61)).toBe('1 hora y 1 minuto antes')
  })
})

describe('historyText', () => {
  const names = { person: (id: string) => `persona ${id}`, group: (id: string) => `grupo ${id}` }
  const entry = (change: Partial<HistoryEntry>) =>
    ({ id: 1, eventId: 'e1', action: 'update', changedBy: null, changedAt: '2026-10-21T10:00:00Z', before: null, after: null, ...change }) as HistoryEntry

  it('the simple actions', () => {
    expect(historyText(entry({ action: 'create' }), names)).toBe('creó el evento')
    expect(historyText(entry({ action: 'delete' }), names)).toBe('lo envió a la papelera')
    expect(historyText(entry({ action: 'restore' }), names)).toBe('lo recuperó de la papelera')
    expect(historyText(entry({ action: 'purge' }), names)).toBe('lo eliminó definitivamente')
  })

  it('changed fields, each named once', () => {
    const text = historyText(
      entry({ before: { title: 'A', start_time: '10:00', end_time: '11:00' }, after: { title: 'B', start_time: '11:00', end_time: '12:00' } }),
      names,
    )
    expect(text).toBe('cambió el título y el horario')
    expect(historyText(entry({ after: { something_new: 1 } }), names)).toBe('cambió otros datos')
  })

  it('exceptions', () => {
    const x = (status: string) => ({ exception: { occurrence_date: '2026-10-22', status } })
    expect(historyText(entry({ after: x('cancelled') }), names)).toBe('lo canceló el jueves, 22 de octubre')
    expect(historyText(entry({ after: x('modified') }), names)).toBe('lo cambió solo el jueves, 22 de octubre')
    expect(historyText(entry({ before: x('modified') }), names)).toBe('deshizo el cambio del jueves, 22 de octubre')
  })

  it('groups and participants', () => {
    expect(historyText(entry({ after: { group: 'g1' } }), names)).toBe('lo compartió con grupo g1')
    expect(historyText(entry({ before: { group: 'g1' } }), names)).toBe('dejó de compartirlo con grupo g1')
    expect(historyText(entry({ after: { participant: 'p1' } }), names)).toBe('añadió a persona p1')
    expect(historyText(entry({ before: { participant: 'p1' } }), names)).toBe('quitó a persona p1')
  })
})
