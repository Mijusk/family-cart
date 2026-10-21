import { describe, expect, it } from 'vitest'
import type { EventTiming } from '@/types'
import { buildPlanText, DEFAULT_PLAN_REQUEST, type PlanEvent, type PlanInput } from './planText'

// 2026-10-19 is a Monday.
function timing(change: Partial<EventTiming> = {}): EventTiming {
  return {
    allDay: false,
    startDate: '2026-10-19',
    startTime: '08:00',
    endTime: '15:00',
    repeat: 'none',
    repeatWeekdays: null,
    repeatUntil: null,
    ...change,
  }
}

function event(change: Partial<Omit<PlanEvent, 'timing'>> & { timing?: Partial<EventTiming> } = {}): PlanEvent {
  return { id: 'e1', title: 'Oficina', folder: 'Trabajo', people: ['m'], exceptions: [], ...change, timing: timing(change.timing) }
}

function plan(change: Partial<PlanInput> = {}): string {
  return buildPlanText({
    groupName: 'Casa Martín',
    from: '2026-10-19',
    to: '2026-10-25',
    today: '2026-10-19',
    people: [
      { id: 'm', name: 'Marta', isMe: true },
      { id: 'd', name: 'Daniel', isMe: false },
    ],
    events: [],
    tasks: [],
    request: '',
    ...change,
  })
}

const office = event({ timing: { repeat: 'weekly', repeatWeekdays: [1, 2, 3, 4, 5] } })

describe('buildPlanText', () => {
  it('says who is who and the period', () => {
    const text = plan()
    expect(text).toContain('# Calendario de Casa Martín: del 19 oct al 25 oct de 2026')
    expect(text).toContain('Personas: Marta (yo), Daniel.')
  })

  it('the routine goes once, not every day', () => {
    const text = plan({ events: [office] })
    expect(text).toContain('Marta:\n- 08:00–15:00 Oficina — cada semana: lunes, martes, miércoles, jueves y viernes')
    expect(text.match(/Oficina/g)).toHaveLength(1)
  })

  it('a shared event says with whom, under each person', () => {
    const text = plan({ events: [event({ title: 'Pádel', people: ['m', 'd'], timing: { repeat: 'weekly', repeatWeekdays: [6], startTime: '10:00', endTime: '11:30' } })] })
    expect(text).toContain('Marta:\n- 10:00–11:30 Pádel (con Daniel)')
    expect(text).toContain('Daniel:\n- 10:00–11:30 Pádel (con Marta)')
  })

  it('one-off, changed and cancelled days go day by day', () => {
    const text = plan({
      events: [
        { ...office, exceptions: [{ eventId: 'e1', occurrenceDate: '2026-10-21', status: 'cancelled', overrides: {} }, { eventId: 'e1', occurrenceDate: '2026-10-22', status: 'modified', overrides: { startTime: '10:00' } }] },
        event({ id: 'e2', title: 'Pádel', people: ['d'], timing: { startDate: '2026-10-24', startTime: '23:00', endTime: '00:30' } }),
      ],
    })
    expect(text).toContain('- mié 21 oct · Marta: no hay Oficina')
    expect(text).toContain('- jue 22 oct · Marta: 10:00–15:00 Oficina (cambio de un día de su rutina)')
    expect(text).toContain('- sáb 24 oct · Daniel: 23:00–00:30 (+1) Pádel')
  })

  it('works out the free time of each person', () => {
    const text = plan({
      events: [office, event({ id: 'e2', title: 'Pádel', people: ['d'], timing: { startDate: '2026-10-24', startTime: '23:00', endTime: '00:30' } })],
    })
    expect(text).toContain('- lun 19 oct · Marta 07:00–08:00, 15:00–22:00 · Daniel 07:00–22:00')
    // The night before's event that runs past midnight takes nothing of the waking hours.
    expect(text).toContain('- dom 25 oct · Marta 07:00–22:00 · Daniel 07:00–22:00')
  })

  it('drops free time shorter than 30 minutes', () => {
    const text = plan({ events: [event({ timing: { startTime: '07:20', endTime: '21:40' } })] })
    expect(text).toContain('- lun 19 oct · Marta nada · Daniel 07:00–22:00')
  })

  it('all-day events are noted, and busy slots have no title', () => {
    const text = plan({
      events: [
        event({ title: 'Viaje a Valencia', timing: { allDay: true, startTime: null, endTime: null, startDate: '2026-10-20' } }),
        event({ id: 'e2', title: null, people: ['d'], timing: { startDate: '2026-10-20', startTime: '19:00', endTime: '20:30' } }),
      ],
    })
    expect(text).toContain('- mar 20 oct · Marta 07:00–22:00 (todo el día: Viaje a Valencia) · Daniel 07:00–19:00, 20:30–22:00')
    expect(text).toContain('- mar 20 oct · Daniel: 19:00–20:30 Ocupado')
  })

  it('a month already started counts from today', () => {
    const text = plan({ from: '2026-10-01', to: '2026-10-31', today: '2026-10-21' })
    expect(text).toContain('del 21 oct al 31 oct de 2026')
    expect(text).not.toContain('lun 19 oct')
  })

  it('lists pending tasks with who and when', () => {
    const text = plan({
      tasks: [
        { title: 'Comprar regalo', list: 'Pendientes', dueDate: '2026-10-23', assignees: ['Marta'] },
        { title: 'Llamar al fontanero', list: 'Pendientes', dueDate: '2026-10-10', assignees: [] },
      ],
    })
    expect(text).toContain('- Comprar regalo (lista «Pendientes») · para Marta · para el vie 23 oct')
    expect(text).toContain('- Llamar al fontanero (lista «Pendientes») · vencida (era el 10 oct)')
  })

  it('ends with the request, or the default one', () => {
    expect(plan()).toContain(`## Lo que te pido\n${DEFAULT_PLAN_REQUEST}`)
    expect(plan({ request: 'Solo yoga.' })).toContain('## Lo que te pido\nSolo yoga.')
  })
})
