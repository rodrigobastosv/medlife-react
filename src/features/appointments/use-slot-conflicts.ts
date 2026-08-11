import { fromDateColumn } from '@/core/format';
import { conflictsAt, type SlotConflict } from '@/domain/agenda/slot-conflicts';
import type { AppointmentLocation } from '@/domain/appointments/appointment-enums';
import { useAppointmentsOnDayQuery } from '@/features/appointments/use-appointments';
import {
  useAvailabilityExceptionsQuery,
  useAvailabilityRulesQuery,
} from '@/features/availability/use-availability';

/**
 * Who is already booked over the slot the appointment form currently describes.
 *
 * Takes the form's raw string fields rather than parsed values, because that is
 * what the form has while it is being filled in: an `<input type="date">` reads
 * `''` until it holds a whole date, and half of this hook's job is deciding
 * that there is nothing to ask yet.
 *
 * The three queries behind it are all cheap and mostly warm — the day's
 * appointments are one small request per day the user lands on, and the
 * availability rules are the same two queries the settings screen already
 * populated. Nothing refetches per keystroke: the day is part of a query key,
 * so returning to a date already seen is a cache hit.
 *
 * No `useMemo`. The result feeds a paragraph, not another hook, so a fresh
 * array each render costs nothing — and memoising it would mean listing `date`
 * as a dependency while using the `Date` parsed from it, which is the kind of
 * dependency list that is right until someone reorders it.
 */
export function useSlotConflicts(params: {
  /** `yyyy-MM-dd` from the form, or `''`. */
  date: string;
  /** `HH:mm` from the form, or `''`. */
  time: string;
  location: AppointmentLocation;
  /** The appointment being edited, so it does not collide with itself. */
  ignoreAppointmentId: string | null;
}): SlotConflict[] {
  const day = params.date === '' ? null : fromDateColumn(params.date);

  const appointmentsQuery = useAppointmentsOnDayQuery(day);
  const rulesQuery = useAvailabilityRulesQuery();
  const exceptionsQuery = useAvailabilityExceptionsQuery();

  const appointments = appointmentsQuery.data;
  const rules = rulesQuery.data;
  const exceptions = exceptionsQuery.data;

  if (day === null || params.time === '' || appointments === undefined) return [];
  // Availability decides how long each appointment runs, so answering before it
  // has loaded would show a narrow "same minute" warning and then widen it a
  // moment later — the user would watch the message change under them with no
  // way to know which reading was the real one. Waiting costs a beat on a cold
  // cache and nothing after that. An empty result is a different thing from a
  // pending one: it means the doctor has declared no hours, which `conflictsAt`
  // handles on its own by narrowing to exact-time clashes.
  if (rules === undefined || exceptions === undefined) return [];

  return conflictsAt({
    day,
    time: params.time,
    location: params.location,
    appointments,
    rules,
    exceptions,
    ignoreAppointmentId: params.ignoreAppointmentId,
  });
}
