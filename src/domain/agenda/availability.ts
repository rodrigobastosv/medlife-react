import { dateOnly, fromDateColumn, isSameDay, toDateColumn } from '@/core/format';
import { toTimeOfDay } from '@/domain/appointments/appointment';

/**
 * The doctor's declared hours, and the rule she can carve an exception out of.
 *
 * See `010_availability.sql` for why this is the shape it is — one rule per
 * weekday, one exception per date, an exception replacing rather than adding
 * to the weekday it falls on. `freeSlots` at the bottom of this file is the
 * one function that turns the two into an actual list of open times, and it is
 * pure on purpose (see CLAUDE.md's testing note): run it through `jiti`
 * instead of reimplementing the rule in a scratch script to check it.
 */

/** 0 = domingo .. 6 = sábado — same as `Date.getDay()` and Postgres `extract(dow ...)`. */
export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const weekdayLabel: Record<Weekday, string> = {
  0: 'Domingo',
  1: 'Segunda-feira',
  2: 'Terça-feira',
  3: 'Quarta-feira',
  4: 'Quinta-feira',
  5: 'Sexta-feira',
  6: 'Sábado',
};

/**
 * `Date.getDay()` is defined to return 0–6, so this cast is a fact about the
 * platform rather than an assumption — unlike the `weekday` column, which is
 * user data and goes through `toWeekday` below instead.
 */
export const weekdayOf = (date: Date): Weekday => date.getDay() as Weekday;

const toWeekday = (value: number): Weekday =>
  (WEEKDAYS as readonly number[]).includes(value) ? (value as Weekday) : 0;

/* --- Weekly rule ----------------------------------------------------------- */

export interface AvailabilityRule {
  readonly id: string;
  readonly weekday: Weekday;
  /** `HH:mm`. */
  readonly startTime: string;
  /** `HH:mm`. */
  readonly endTime: string;
  readonly slotDurationMinutes: number;
}

export interface AvailabilityRuleRow {
  id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
}

export function toAvailabilityRule(row: AvailabilityRuleRow): AvailabilityRule {
  return {
    id: row.id,
    weekday: toWeekday(row.weekday),
    // The migration's check constraint guarantees these are real times; the
    // fallback here is only for a row a future, laxer schema might allow.
    startTime: toTimeOfDay(row.start_time) ?? '00:00',
    endTime: toTimeOfDay(row.end_time) ?? '00:00',
    slotDurationMinutes: row.slot_duration_minutes,
  };
}

export interface AvailabilityRuleDraft {
  weekday: Weekday;
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
}

export function availabilityRuleDraftToColumns(draft: AvailabilityRuleDraft) {
  return {
    weekday: draft.weekday,
    start_time: draft.startTime,
    end_time: draft.endTime,
    slot_duration_minutes: draft.slotDurationMinutes,
  };
}

/* --- Exception --------------------------------------------------------- */

export interface AvailabilityException {
  readonly id: string;
  readonly date: Date;
  readonly isClosed: boolean;
  /** `HH:mm`, or `null` when `isClosed` — see `010_availability.sql`. */
  readonly startTime: string | null;
  readonly endTime: string | null;
  readonly slotDurationMinutes: number | null;
  readonly note: string | null;
}

export interface AvailabilityExceptionRow {
  id: string;
  exception_date: string;
  is_closed: boolean;
  start_time: string | null;
  end_time: string | null;
  slot_duration_minutes: number | null;
  note: string | null;
}

export function toAvailabilityException(row: AvailabilityExceptionRow): AvailabilityException {
  return {
    id: row.id,
    date: fromDateColumn(row.exception_date),
    isClosed: row.is_closed,
    startTime: toTimeOfDay(row.start_time),
    endTime: toTimeOfDay(row.end_time),
    slotDurationMinutes: row.slot_duration_minutes,
    note: row.note,
  };
}

export interface AvailabilityExceptionDraft {
  date: Date;
  isClosed: boolean;
  /** Ignored (and cleared) when `isClosed` — same rule the migration enforces. */
  startTime: string | null;
  endTime: string | null;
  slotDurationMinutes: number | null;
  note: string | null;
}

export function availabilityExceptionDraftToColumns(draft: AvailabilityExceptionDraft) {
  return {
    exception_date: toDateColumn(draft.date),
    is_closed: draft.isClosed,
    start_time: draft.isClosed ? null : draft.startTime,
    end_time: draft.isClosed ? null : draft.endTime,
    slot_duration_minutes: draft.isClosed ? null : draft.slotDurationMinutes,
    note: draft.note === null || draft.note.trim() === '' ? null : draft.note.trim(),
  };
}

/* --- Free slots ---------------------------------------------------------- */

interface OpenInterval {
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
}

/**
 * What is actually open on `day`: the exception for that date if there is one,
 * otherwise the weekday's rule, otherwise nothing.
 *
 * An exception *replaces* the weekday rule rather than layering on top of it —
 * a closed day has no slots no matter what the weekday would normally offer,
 * and a special-hours day is described completely by the exception's own
 * interval. Layering would mean a "horário especial" exception meant to
 * *shorten* a Tuesday could instead leave the original hours open alongside
 * it, which defeats the point of recording an exception at all.
 */
function openIntervalFor(
  day: Date,
  rules: readonly AvailabilityRule[],
  exceptions: readonly AvailabilityException[],
): OpenInterval | null {
  const exception = exceptions.find((candidate) => isSameDay(candidate.date, day));
  if (exception !== undefined) {
    if (exception.isClosed) return null;
    // The migration's check constraint guarantees a non-closed exception
    // carries all three fields; this is only for the type checker.
    if (
      exception.startTime === null ||
      exception.endTime === null ||
      exception.slotDurationMinutes === null
    ) {
      return null;
    }
    return {
      startTime: exception.startTime,
      endTime: exception.endTime,
      slotDurationMinutes: exception.slotDurationMinutes,
    };
  }

  const weekday = weekdayOf(day);
  return rules.find((rule) => rule.weekday === weekday) ?? null;
}

/**
 * The open `HH:mm` slots on `day`, with the already-booked ones removed.
 *
 * Pure and synchronous: no `Date.now()`, no fetching. The caller supplies
 * `bookedTimes` — the `scheduledTime`s already on the agenda for that day —
 * rather than this function reading appointments itself, which is what keeps
 * it testable on its own and reusable from a context (a webhook, later) that
 * has no `Scope` to fetch with.
 *
 * A slot is offered only if it *fits* before the interval's end
 * (`start + duration <= end`), so a 45-minute duration against a 18:00 close
 * does not offer a 17:45 slot that would run 15 minutes over.
 */
export function freeSlots(params: {
  day: Date;
  rules: readonly AvailabilityRule[];
  exceptions: readonly AvailabilityException[];
  bookedTimes: readonly string[];
}): string[] {
  const interval = openIntervalFor(dateOnly(params.day), params.rules, params.exceptions);
  if (interval === null) return [];

  const booked = new Set(params.bookedTimes);
  const endMinutes = timeToMinutes(interval.endTime);
  const slots: string[] = [];
  for (
    let minutes = timeToMinutes(interval.startTime);
    minutes + interval.slotDurationMinutes <= endMinutes;
    minutes += interval.slotDurationMinutes
  ) {
    const slot = minutesToTime(minutes);
    if (!booked.has(slot)) slots.push(slot);
  }
  return slots;
}

const timeToMinutes = (time: string): number => {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

const minutesToTime = (totalMinutes: number): string =>
  `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
