import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { dateOnly } from '@/core/format';
import { useDataScope } from '@/app/providers/session-context';
import {
  createAppointment,
  deleteAppointment,
  fetchAgenda,
  fetchPatientAppointments,
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
  const from = new Date(month.getFullYear(), month.getMonth(), -6);
  const to = new Date(month.getFullYear(), month.getMonth() + 1, 7);

  return useQuery({
    queryKey: queryKeys.appointments.agenda(scope.ownerId, month),
    queryFn: () => fetchAgenda(scope, { from, to }),
    select: (appointments) => expandAgendaEvents(appointments, { from, to }),
  });
}

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
