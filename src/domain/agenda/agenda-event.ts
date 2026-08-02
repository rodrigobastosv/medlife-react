import { dateOnly } from '@/core/format';
import type { Appointment } from '@/domain/appointments/appointment';
import type { Patient } from '@/domain/patients/patient';
import { turningAgeIn } from '@/domain/patients/patient-birthdays';

/**
 * The five things that can land on a calendar day.
 *
 * Four of them are derived from an appointment; the fifth is not derived from
 * anything the clinic scheduled. That is why the event below is a *union* rather
 * than a record with an optional appointment: a birthday belongs to a patient,
 * has no time, no status and no money attached, and every consumer that reaches
 * for `event.appointment` has to be made to say what it does about the day when
 * there is not one.
 *
 * The order is the order they are offered in the legend and the day list, and it
 * runs from the most to the least scheduled: a consultation is an appointment, a
 * birthday is a fact about a date.
 */
export const AGENDA_EVENT_TYPES = [
  'consultation',
  'return',
  'recall',
  'followUp',
  'birthday',
] as const;
export type AgendaEventType = (typeof AGENDA_EVENT_TYPES)[number];

export const agendaEventTypeLabel: Record<AgendaEventType, string> = {
  consultation: 'Consulta',
  return: 'Retorno',
  recall: 'Recall',
  followUp: 'Acompanhamento',
  birthday: 'Aniversário',
};

/** The event types that come out of an appointment — everything but a birthday. */
export type AppointmentEventType = Exclude<AgendaEventType, 'birthday'>;

export interface AppointmentAgendaEvent {
  readonly date: Date;
  readonly type: AppointmentEventType;
  readonly appointment: Appointment;
}

export interface BirthdayAgendaEvent {
  readonly date: Date;
  readonly type: 'birthday';
  readonly patient: Patient;
  /** The age this birthday completes, or null for a birth date in the future. */
  readonly turningAge: number | null;
}

export type AgendaEvent = AppointmentAgendaEvent | BirthdayAgendaEvent;

/**
 * A key that is unique within a day's list.
 *
 * One appointment produces up to four events, so its id alone repeats inside a
 * day; a birthday has no appointment id at all. Both cases are the same
 * question — "which row is this" — and answering it here keeps the list from
 * growing a conditional in its JSX.
 */
export const agendaEventKey = (event: AgendaEvent): string =>
  event.type === 'birthday'
    ? `birthday-${event.patient.id}`
    : `${event.appointment.id}-${event.type}`;

/**
 * Expands appointments into calendar events inside `[from, to]`, inclusive.
 *
 * One appointment can produce up to four events — the visit itself, the return
 * it scheduled, the recall (the secretary's "book this patient again") and the
 * acompanhamento (the doctor's "ask this patient how they are"). That fan-out is
 * why the agenda cannot simply render the appointment list: the same row belongs
 * on four different days.
 *
 * The last two are two dates on the same row and they stay two events, for the
 * reason `008_appointment_follow_up.sql` gives for keeping them in two columns:
 * they are different people's work. Merging them into one "contato" marker would
 * put a doctor's call and a secretary's call on the calendar as the same thing,
 * and nothing in the row would say whose day it lands on.
 *
 * This is a pure function over data the caller already has, so it lives in the
 * domain and is trivially testable — no dates from `Date.now()`, no fetching.
 */
export function expandAgendaEvents(
  appointments: readonly Appointment[],
  range: { from: Date; to: Date },
): AppointmentAgendaEvent[] {
  const start = dateOnly(range.from).getTime();
  const end = dateOnly(range.to).getTime();
  const inRange = (day: Date): boolean => {
    const time = dateOnly(day).getTime();
    return time >= start && time <= end;
  };

  const events: AppointmentAgendaEvent[] = [];
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
    if (appointment.followUpDate !== null && inRange(appointment.followUpDate)) {
      events.push({ date: dateOnly(appointment.followUpDate), type: 'followUp', appointment });
    }
  }
  return events;
}

/**
 * The birthdays falling inside `[from, to]`, one event per patient per occurrence.
 *
 * **The days are walked and the patients are indexed by `MM-dd`, rather than a
 * birthday being *constructed* for each patient.** The obvious implementation —
 * `new Date(year, birth.getMonth(), birth.getDate())` — is the one that breaks
 * on 29 February: it silently normalises to 1 March in a common year, which
 * would move a leap-day patient to a day in a different month. Walking real
 * calendar days means every date here came from the calendar and none was
 * invented.
 *
 * It also settles the range cleanly. The agenda fetches a few days either side
 * of the month, so a run can cross a month boundary and, in December, a year
 * boundary — and "which year is this birthday turning" is then a different
 * answer within one call. Reading the year off the day being walked makes that
 * question local.
 *
 * **A patient born on 29 February appears on the 28th in years without a 29th.**
 * The card on Início can afford to leave them under "fevereiro" and let a reader
 * work it out, because it shows a month at a time. A calendar cannot: in three
 * years out of four there is no cell for their birthday, so the alternative to
 * the 28th is that they quietly do not appear at all. The same rule is applied
 * by the birthday notification in `supabase/functions/notify/plan.ts`, so the
 * calendar and the push agree about which day it is.
 */
export function expandBirthdayEvents(
  patients: readonly Patient[],
  range: { from: Date; to: Date },
): BirthdayAgendaEvent[] {
  // The birth date is carried alongside the patient rather than read back off
  // it in the loop, so the null check below happens once and the age arithmetic
  // never needs an assertion to know it already passed.
  const byMonthDay = new Map<string, { patient: Patient; birthDate: Date }[]>();
  for (const patient of patients) {
    // A missing birth date is not a birthday on the 1st — the same reading
    // `birthdaysInMonth` gives it.
    const birthDate = patient.birthDate;
    if (birthDate === null) continue;
    const key = monthDay(birthDate);
    const bucket = byMonthDay.get(key);
    if (bucket === undefined) byMonthDay.set(key, [{ patient, birthDate }]);
    else bucket.push({ patient, birthDate });
  }
  if (byMonthDay.size === 0) return [];

  const events: BirthdayAgendaEvent[] = [];
  const end = dateOnly(range.to).getTime();

  for (let day = dateOnly(range.from); day.getTime() <= end; day = nextDay(day)) {
    const celebrating = [
      ...(byMonthDay.get(monthDay(day)) ?? []),
      ...(isLastDayOfFebruary(day) ? (byMonthDay.get('02-29') ?? []) : []),
    ];

    for (const { patient, birthDate } of celebrating) {
      events.push({
        date: day,
        type: 'birthday',
        patient,
        turningAge: turningAgeIn(birthDate, day.getFullYear()),
      });
    }
  }

  return events;
}

/** `MM-dd` — the only part of a date a birthday is compared on. */
const monthDay = (date: Date): string =>
  `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/**
 * Day arithmetic through the constructor rather than `+ 86_400_000`, which is a
 * day only until a clock change makes it 23 or 25 hours and the walk starts
 * landing on the previous evening.
 */
const nextDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);

/** The 28th of a February that has no 29th — where leap-day patients land. */
const isLastDayOfFebruary = (date: Date): boolean =>
  date.getMonth() === 1 && date.getDate() === 28 && nextDay(date).getMonth() !== 1;

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
