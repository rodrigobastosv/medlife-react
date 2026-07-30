import { dateOnly } from '@/core/format';
import type { Appointment } from '@/domain/appointments/appointment';

/** The three things that can land on a calendar day, all derived from one appointment. */
export const AGENDA_EVENT_TYPES = ['consultation', 'return', 'recall'] as const;
export type AgendaEventType = (typeof AGENDA_EVENT_TYPES)[number];

export const agendaEventTypeLabel: Record<AgendaEventType, string> = {
  consultation: 'Consulta',
  return: 'Retorno',
  recall: 'Recall',
};

export interface AgendaEvent {
  readonly date: Date;
  readonly type: AgendaEventType;
  readonly appointment: Appointment;
}

/**
 * Expands appointments into calendar events inside `[from, to]`, inclusive.
 *
 * One appointment can produce up to three events — the visit itself, the return
 * it scheduled, and the recall (a "call this patient" reminder). That fan-out is
 * why the agenda cannot simply render the appointment list: the same row belongs
 * on three different days.
 *
 * This is a pure function over data the caller already has, so it lives in the
 * domain and is trivially testable — no dates from `Date.now()`, no fetching.
 */
export function expandAgendaEvents(
  appointments: readonly Appointment[],
  range: { from: Date; to: Date },
): AgendaEvent[] {
  const start = dateOnly(range.from).getTime();
  const end = dateOnly(range.to).getTime();
  const inRange = (day: Date): boolean => {
    const time = dateOnly(day).getTime();
    return time >= start && time <= end;
  };

  const events: AgendaEvent[] = [];
  for (const appointment of appointments) {
    if (inRange(appointment.scheduledDate)) {
      events.push({
        date: dateOnly(appointment.scheduledDate),
        type: 'consultation',
        appointment,
      });
    }
    if (appointment.nextReturnDate !== null && inRange(appointment.nextReturnDate)) {
      events.push({ date: dateOnly(appointment.nextReturnDate), type: 'return', appointment });
    }
    if (appointment.recallDate !== null && inRange(appointment.recallDate)) {
      events.push({ date: dateOnly(appointment.recallDate), type: 'recall', appointment });
    }
  }
  return events;
}

/**
 * Groups events by day, keyed by `yyyy-MM-dd`.
 *
 * A `Date` cannot be a `Map` key — two `Date` objects for the same day are
 * different references, so lookups silently miss. The ISO day string is the
 * stable identity of "which day this is".
 */
export function groupEventsByDay(events: readonly AgendaEvent[]): Map<string, AgendaEvent[]> {
  const byDay = new Map<string, AgendaEvent[]>();
  for (const event of events) {
    const key = dayKey(event.date);
    const bucket = byDay.get(key);
    if (bucket === undefined) byDay.set(key, [event]);
    else bucket.push(event);
  }
  return byDay;
}

export const dayKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
