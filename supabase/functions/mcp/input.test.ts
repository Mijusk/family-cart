import { describe, expect, it } from 'vitest'
import { dateRange, dayOverrides, eventFields, folderFields, itemFields, NEW_EVENT, parseClock, taskFields, type EventFields } from './input.ts'

const ok = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw new Error(`expected ok, got: ${r.error}`)
  return r.value
}
const error = (r: { ok: boolean; error?: string }) => (r.ok ? null : r.error)

describe('parseClock', () => {
  it('accepts H:MM, HH:MM and HH:MM:SS', () => {
    expect(parseClock('9:30')).toBe('09:30')
    expect(parseClock('17:05')).toBe('17:05')
    expect(parseClock('08:00:00')).toBe('08:00')
  })
  it('rejects what is not a time', () => {
    expect(parseClock('24:00')).toBeNull()
    expect(parseClock('12:60')).toBeNull()
    expect(parseClock('5pm')).toBeNull()
  })
})

describe('eventFields: creating', () => {
  it('builds a timed event as the form saves it', () => {
    expect(ok(eventFields({ titulo: '  dentista ', fecha: '2026-11-04', hora_inicio: '17:30', hora_fin: '18:30', lugar: ' ' }))).toEqual({
      ...NEW_EVENT,
      title: 'Dentista',
      startDate: '2026-11-04',
      startTime: '17:30',
      endTime: '18:30',
    })
  })

  it('lasts an hour without an end, also past midnight', () => {
    expect(ok(eventFields({ titulo: 'Cine', fecha: '2026-11-04', hora_inicio: '23:30' }))).toMatchObject({ startTime: '23:30', endTime: '00:30' })
  })

  it('keeps an end before the start: it crosses midnight', () => {
    expect(ok(eventFields({ titulo: 'Turno', fecha: '2026-11-04', hora_inicio: '22:00', hora_fin: '06:00' }))).toMatchObject({ endTime: '06:00' })
  })

  it('drops the times of an all-day event', () => {
    expect(ok(eventFields({ titulo: 'Excursión', fecha: '2026-11-04', todo_el_dia: true, hora_inicio: '10:00' }))).toMatchObject({
      allDay: true,
      startTime: null,
      endTime: null,
    })
  })

  it('asks for what is missing or wrong, in Spanish', () => {
    expect(error(eventFields({ titulo: ' ', fecha: '2026-11-04', todo_el_dia: true }))).toMatch(/título/)
    expect(error(eventFields({ titulo: 'x', todo_el_dia: true }))).toMatch(/Falta la fecha/)
    expect(error(eventFields({ titulo: 'x', fecha: '04/11/2026', todo_el_dia: true }))).toMatch(/AAAA-MM-DD/)
    expect(error(eventFields({ titulo: 'x', fecha: '1926-11-04', todo_el_dia: true }))).toMatch(/año/)
    expect(error(eventFields({ titulo: 'x', fecha: '2026-11-04' }))).toMatch(/hora de inicio/)
    expect(error(eventFields({ titulo: 'x', fecha: '2026-11-04', hora_inicio: '10:00', hora_fin: '10:00' }))).toMatch(/distinta/)
    expect(error(eventFields({ titulo: 'x'.repeat(121), fecha: '2026-11-04', todo_el_dia: true }))).toMatch(/120/)
    expect(error(eventFields({ titulo: 'x', fecha: '2026-11-04', todo_el_dia: true, aviso_minutos: 50000 }))).toMatch(/30 días/)
  })

  it('repeats weekly on the event weekday when no days are given', () => {
    // 2026-11-04 is a Wednesday.
    expect(ok(eventFields({ titulo: 'Inglés', fecha: '2026-11-04', hora_inicio: '18:00', repeticion: 'weekly' }))).toMatchObject({
      repeat: 'weekly',
      repeatWeekdays: [3],
    })
    expect(ok(eventFields({ titulo: 'Inglés', fecha: '2026-11-04', hora_inicio: '18:00', repeticion: 'weekly', dias_semana: [5, 1, 5] }))).toMatchObject({
      repeatWeekdays: [1, 5],
    })
  })

  it('checks the end of the repetition, and ignores it on one-off events', () => {
    expect(error(eventFields({ titulo: 'x', fecha: '2026-11-04', todo_el_dia: true, repeticion: 'daily', repetir_hasta: '2026-11-01' }))).toMatch(/terminar antes/)
    expect(ok(eventFields({ titulo: 'x', fecha: '2026-11-04', todo_el_dia: true, repetir_hasta: '2026-12-01' })).repeatUntil).toBeNull()
    expect(error(eventFields({ titulo: 'x', fecha: '2026-11-04', todo_el_dia: true, repeticion: 'weekly', dias_semana: [8] }))).toMatch(/1 \(lunes\)/)
  })
})

describe('eventFields: recordatorio', () => {
  it('ends 15 minutes after the start and reminds when it starts', () => {
    expect(ok(eventFields({ titulo: 'Pastilla', fecha: '2026-11-04', hora_inicio: '9:00', recordatorio: true, repeticion: 'daily' }))).toMatchObject({
      reminderOnly: true,
      allDay: false,
      startTime: '09:00',
      endTime: '09:15',
      reminderMinutes: 0,
    })
  })

  it('keeps another reminder if asked for, but never none', () => {
    expect(ok(eventFields({ titulo: 'Pastilla', fecha: '2026-11-04', hora_inicio: '21:00', recordatorio: true, aviso_minutos: 15 })).reminderMinutes).toBe(15)
    expect(error(eventFields({ titulo: 'Pastilla', fecha: '2026-11-04', hora_inicio: '21:00', recordatorio: true, aviso_minutos: null }))).toMatch(/necesita un aviso/)
  })

  it('needs a time and ignores all day', () => {
    expect(error(eventFields({ titulo: 'Pastilla', fecha: '2026-11-04', recordatorio: true, todo_el_dia: true }))).toMatch(/hora de inicio/)
  })

  it('moves the end with the start when editing one', () => {
    const pill = ok(eventFields({ titulo: 'Pastilla', fecha: '2026-11-04', hora_inicio: '09:00', recordatorio: true }))
    expect(ok(eventFields({ hora_inicio: '23:50' }, pill))).toMatchObject({ startTime: '23:50', endTime: '00:05', reminderOnly: true })
  })
})

describe('eventFields: editing', () => {
  const base: EventFields = {
    ...NEW_EVENT,
    title: 'Natación',
    location: 'Polideportivo',
    startDate: '2026-11-02',
    startTime: '17:00',
    endTime: '18:30',
    repeat: 'weekly',
    repeatWeekdays: [1, 3],
    reminderMinutes: 15,
  }

  it('keeps what is left out and clears what is null', () => {
    expect(ok(eventFields({ lugar: null, aviso_minutos: null }, base))).toEqual({ ...base, location: null, reminderMinutes: null })
  })

  it('moves the end with the start, keeping the length', () => {
    expect(ok(eventFields({ hora_inicio: '17:30' }, base))).toMatchObject({ startTime: '17:30', endTime: '19:00' })
  })

  it('stops repeating', () => {
    expect(ok(eventFields({ repeticion: 'none' }, base))).toMatchObject({ repeat: 'none', repeatWeekdays: null, repeatUntil: null })
  })

  it('needs a start to stop being all day', () => {
    const allDay = { ...base, allDay: true, startTime: null, endTime: null }
    expect(error(eventFields({ todo_el_dia: false }, allDay))).toMatch(/hora de inicio/)
    expect(ok(eventFields({ hora_inicio: '09:00' }, allDay))).toMatchObject({ allDay: false, startTime: '09:00', endTime: '10:00' })
  })
})

describe('dayOverrides', () => {
  const series = { title: 'Natación', notes: null, location: 'Polideportivo', allDay: false, startTime: '17:00', endTime: '18:30' }
  const asSeries = { ...series, startDate: '2026-11-02' }

  it('keeps only what differs from the series', () => {
    expect(ok(dayOverrides({ hora_inicio: '18:00' }, series, '2026-11-02', asSeries))).toEqual({ startTime: '18:00', endTime: '19:30' })
    expect(ok(dayOverrides({ nueva_fecha: '2026-11-03' }, series, '2026-11-02', asSeries))).toEqual({ startDate: '2026-11-03' })
  })

  it('builds on the change the day already has', () => {
    const changed = { ...asSeries, location: 'Piscina' }
    expect(ok(dayOverrides({ hora_inicio: '18:00' }, series, '2026-11-02', changed))).toEqual({ location: 'Piscina', startTime: '18:00', endTime: '19:30' })
  })

  it('is empty when the day goes back to the series', () => {
    const changed = { ...asSeries, location: 'Piscina' }
    expect(ok(dayOverrides({ lugar: 'Polideportivo' }, series, '2026-11-02', changed))).toEqual({})
  })

  it('does not move a day more than a week', () => {
    expect(error(dayOverrides({ nueva_fecha: '2026-11-20' }, series, '2026-11-02', asSeries))).toMatch(/una semana/)
  })
})

describe('taskFields', () => {
  it('cleans the title and checks the date', () => {
    expect(ok(taskFields({ titulo: ' llamar al fontanero ', fecha: '2026-11-04' }))).toEqual({ title: 'Llamar al fontanero', notes: null, dueDate: '2026-11-04' })
    expect(error(taskFields({ titulo: 'x', fecha: 'mañana' }))).toMatch(/AAAA-MM-DD/)
    expect(error(taskFields({ titulo: '' }))).toMatch(/título de la tarea/)
  })

  it('keeps or clears what is left out or null when editing', () => {
    const base = { title: 'Regalo', notes: 'Para Pablo', dueDate: '2026-11-04' }
    expect(ok(taskFields({ fecha: null }, base))).toEqual({ ...base, dueDate: null })
  })
})

describe('itemFields', () => {
  it('cleans the name and defaults to one', () => {
    expect(ok(itemFields({ nombre: ' leche  semidesnatada ' }))).toEqual({ name: 'Leche semidesnatada', quantity: 1, note: null })
  })
  it('checks quantity and lengths', () => {
    expect(error(itemFields({ nombre: 'Huevos', cantidad: 0 }))).toMatch(/de 1 a 999/)
    expect(error(itemFields({ nombre: 'Huevos', cantidad: 1.5 }))).toMatch(/de 1 a 999/)
    expect(error(itemFields({ nombre: ' ' }))).toMatch(/nombre/)
    expect(error(itemFields({ nombre: 'Huevos', nota: 'x'.repeat(121) }))).toMatch(/120/)
  })
})

describe('dateRange', () => {
  it('defaults to one day and caps the length', () => {
    expect(ok(dateRange('2026-11-04'))).toEqual({ from: '2026-11-04', to: '2026-11-04' })
    expect(ok(dateRange('2026-11-01', '2027-01-01'))).toEqual({ from: '2026-11-01', to: '2027-01-01' })
    expect(error(dateRange('2026-11-01', '2027-01-02'))).toMatch(/62 días/)
    expect(error(dateRange('2026-11-04', '2026-11-03'))).toMatch(/anterior/)
  })
})

describe('folderFields', () => {
  it("cleans the name and takes the form's color", () => {
    expect(ok(folderFields({ nombre: '  iglesia   evangélica ' }))).toEqual({ name: 'Iglesia evangélica', color: '#3b6fb6', level: null })
  })
  it('takes a color of the palette only', () => {
    expect(ok(folderFields({ nombre: 'Trabajo', color: ' #A8522F ' })).color).toBe('#a8522f')
    expect(error(folderFields({ nombre: 'Trabajo', color: '#ffee00' }))).toMatch(/paleta/)
  })
  it('shares only with a group', () => {
    expect(ok(folderFields({ nombre: 'Trabajo', nivel: 'ocupado', grupo_id: 'g' })).level).toBe('busy')
    expect(ok(folderFields({ nombre: 'Trabajo', nivel: 'completo', grupo_id: 'g' })).level).toBe('full')
    expect(error(folderFields({ nombre: 'Trabajo', nivel: 'completo' }))).toMatch(/qué grupo/)
  })
  it('checks the name', () => {
    expect(error(folderFields({ nombre: '   ' }))).toMatch(/nombre/)
    expect(error(folderFields({ nombre: 'x'.repeat(61) }))).toMatch(/60/)
  })
})
