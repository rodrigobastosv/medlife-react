import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { dateOnly } from '@/core/format';
import { useDataScope, useSession } from '@/app/providers/session-context';
import {
  createAppointment,
  deleteAppointment,
  fetchAgenda,
  fetchAppointmentsOnDay,
  fetchPatientAppointments,
  fetchPendingFollowUps,
  fetchPendingRecalls,
  fetchUpcomingReturns,
  updateAppointment,
} from '@/data/appointments-repository';
import { expandAgendaEvents } from '@/domain/agenda/agenda-event';
import type { AppointmentDraft } from '@/domain/appointments/appointment';
import { queryKeys } from '@/features/query-keys';

export function usePatientAppointmentsQuery(patientId: string) {
  const scope = useDataScope();
  return useQuery({
    queryKey: queryKeys.appointments.forPatient(scope.ownerId, patientId),
    queryFn: () => fetchPatientAppointments(scope, patientId),
  });
}

export function usePendingRecallsQuery() {
  const scope = useDataScope();
  return useQuery({
    queryKey: queryKeys.appointments.recalls(scope.ownerId),
    // `dateOnly(new Date())` is computed inside the query function rather than in
    // the component body. Called during render it would be a new value on every
    // render — and if it were part of the key, every render would be a new query.
    queryFn: () => fetchPendingRecalls(scope, dateOnly(new Date())),
  });
}

/**
 * The doctor's acompanhamento backlog — patients due to be asked how they are.
 *
 * A sibling of `usePendingRecallsQuery`, not a variant of it: that one is the
 * secretary's queue for booking the next consultation. Same shape, different
 * work, so they get their own key and invalidate independently.
 */
export function usePendingFollowUpsQuery() {
  const scope = useDataScope();
  const { role } = useSession();

  return useQuery({
    queryKey: queryKeys.appointments.followUps(scope.ownerId),
    queryFn: () => fetchPendingFollowUps(scope, dateOnly(new Date())),
    // Disabled rather than not called: hooks cannot be conditional, and the
    // alternative — letting a secretary fetch a queue only the doctor can act
    // on — is a request per home screen for a list that is never rendered.
    enabled: role === 'doctor',
  });
}

/**
 * Everything booked on one day, with the patient joined.
 *
 * The day is resolved once by the caller and passed to both the key and the
 * query, so the two cannot disagree — computing it separately in each would, at
 * midnight, cache one day's rows under the next day's key.
 *
 * `null` disables the query rather than fetching some default day. The
 * appointment form asks this about whatever date is typed into it, and a
 * cleared date field is a real state with no day to ask about; see
 * `queryKeys.appointments.onDay` for why the key still names that absence.
 */
export function useAppointmentsOnDayQuery(day: Date | null) {
  const scope = useDataScope();

  return useQuery({
    queryKey: queryKeys.appointments.onDay(scope.ownerId, day),
    // `skipToken` rather than `enabled: day !== null`, which would leave the
    // query function holding a `Date | null` it has to cast its way out of.
    // This way the narrowing is the same thing that disables the query.
    queryFn: day === null ? skipToken : () => fetchAppointmentsOnDay(scope, day),
  });
}

/** Today's appointments, for the home screen. */
export function useTodayAppointmentsQuery() {
  return useAppointmentsOnDayQuery(dateOnly(new Date()));
}

export function useUpcomingReturnsQuery() {
  const scope = useDataScope();
  return useQuery({
    queryKey: queryKeys.appointments.returns(scope.ownerId),
    queryFn: () => fetchUpcomingReturns(scope, dateOnly(new Date())),
  });
}

/**
 * The agenda for a month, already expanded into calendar events.
 *
 * `select` is the right place for that transformation: it runs on the cached
 * data rather than on the network response, so the expensive part (the request)
 * is not repeated, and the component receives exactly what it renders. The cache
 * still holds the raw appointments, which is what lets a different screen reuse
 * the same entry.
 *
 * The range is padded by a week on each side so the leading and trailing days
 * the calendar grid borrows from the neighbouring months are not blank.
 */
export function useAgendaQuery(month: Date) {
  const scope = useDataScope();
  const range = agendaRange(month);

  return useQuery({
    queryKey: queryKeys.appointments.agenda(scope.ownerId, month),
    queryFn: () => fetchAgenda(scope, range),
    select: (appointments) => expandAgendaEvents(appointments, range),
  });
}

/**
 * The days a month's agenda covers, including the neighbouring days the calendar
 * grid borrows so its leading and trailing cells are not blank.
 *
 * Exported because the birthdays shown on the same calendar are expanded over
 * the same range from a different query, and two definitions of "which days is
 * this month showing" would eventually disagree by a day at the edges — where
 * the only visible symptom is a marker missing from the first or last row.
 */
export const agendaRange = (month: Date): { from: Date; to: Date } => ({
  from: new Date(month.getFullYear(), month.getMonth(), -6),
  to: new Date(month.getFullYear(), month.getMonth() + 1, 7),
});

export function useSaveAppointmentMutation(appointmentId: string | null) {
  const scope = useDataScope();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (draft: AppointmentDraft) =>
      appointmentId === null
        ? createAppointment(scope, draft)
        : updateAppointment(scope, appointmentId, draft),
    onSuccess: () => invalidateAppointments(queryClient, scope.ownerId),
  });
}

export function useDeleteAppointmentMutation() {
  const scope = useDataScope();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (appointmentId: string) => deleteAppointment(scope, appointmentId),
    onSuccess: () => invalidateAppointments(queryClient, scope.ownerId),
  });
}

/**
 * One appointment write moves five screens: the patient's history, the recall
 * backlog, the upcoming returns, the agenda and the report. They all live under
 * the `appointments` prefix precisely so this is one call rather than five —
 * and so a screen added later is covered without editing this function.
 *
 * The report is a separate prefix because it is derived from a different query,
 * so it has to be named on its own.
 */
function invalidateAppointments(
  queryClient: ReturnType<typeof useQueryClient>,
  ownerId: string,
): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all(ownerId) });
  void queryClient.invalidateQueries({ queryKey: ['reports', ownerId] });
}
