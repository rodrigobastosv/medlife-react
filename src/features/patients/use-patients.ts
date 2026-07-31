import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useDataScope } from '@/app/providers/session-context';
import {
  createPatient,
  deletePatient,
  fetchPatient,
  fetchPatients,
  fetchPatientsCount,
  findPatientByCpf,
  updatePatient,
} from '@/data/patients-repository';
import type { PatientDraft } from '@/domain/patients/patient';
import { cpfDigits, isCompleteCpf } from '@/domain/patients/patient-cpf';
import { queryKeys } from '@/features/query-keys';

/**
 * The patients feature's data access, as hooks.
 *
 * This file is the layer that replaces a cubit: components call
 * `usePatientsQuery()` and get `{ data, isPending, error }` without knowing that
 * a repository, a Supabase client or a cache exist. Everything React-specific
 * about loading patients is here, and nothing React-specific leaks below it.
 */

/**
 * `enabled` is here for callers that mount the hook before they need the data —
 * the patient picker renders with its dialog closed, and a modal nobody has
 * opened should not cost a request. It defaults to true, so the screens that
 * simply show the list are unaffected.
 */
export function usePatientsQuery({ enabled = true }: { enabled?: boolean } = {}) {
  const { ownerId } = useDataScope();
  return useQuery({
    queryKey: queryKeys.patients.all(ownerId),
    queryFn: () => fetchPatients(ownerId),
    enabled,
  });
}

export function usePatientsCountQuery() {
  const { ownerId } = useDataScope();
  return useQuery({
    queryKey: queryKeys.patients.count(ownerId),
    queryFn: () => fetchPatientsCount(ownerId),
  });
}

export function usePatientQuery(patientId: string) {
  const { ownerId } = useDataScope();
  return useQuery({
    queryKey: queryKeys.patients.detail(ownerId, patientId),
    queryFn: () => fetchPatient(ownerId, patientId),
  });
}

/**
 * Whether some patient already holds this CPF.
 *
 * A query rather than a call in an event handler, which is what makes it safe
 * to hang off a blur: going back to a field and leaving it again is a cache hit,
 * not a second request, and the answer is invalidated by any patient save. The
 * `enabled` gate is why an incomplete CPF costs nothing at all — the caller can
 * hand over whatever is in the field.
 */
export function usePatientByCpfQuery(cpf: string) {
  const { ownerId } = useDataScope();
  const digits = cpfDigits(cpf);

  return useQuery({
    queryKey: queryKeys.patients.byCpf(ownerId, digits),
    queryFn: () => findPatientByCpf(ownerId, digits),
    enabled: isCompleteCpf(digits),
  });
}

/**
 * Create and edit share one hook, because they are the same form: `patientId`
 * being null is what distinguishes them, exactly as a null `id` does in the
 * Flutter draft.
 */
export function useSavePatientMutation(patientId: string | null) {
  const { ownerId } = useDataScope();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (draft: PatientDraft) =>
      patientId === null ? createPatient(ownerId, draft) : updatePatient(ownerId, patientId, draft),

    // `onSuccess` is where a cubit would call `load()` again. Invalidating marks
    // the cached lists stale, so any *mounted* screen showing them refetches
    // immediately and the rest refetch when next opened. Note it invalidates by
    // the list prefix, which covers the count and the detail underneath it.
    onSuccess: (patient) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.patients.all(ownerId) });
      // Seeding the detail cache with the row the server just returned means
      // navigating to the patient right after saving shows it with no spinner
      // and no second request.
      queryClient.setQueryData(queryKeys.patients.detail(ownerId, patient.id), patient);
    },
  });
}

export function useDeletePatientMutation() {
  const { ownerId } = useDataScope();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (patientId: string) => deletePatient(ownerId, patientId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.patients.all(ownerId) });
      // Deleting a patient cascades to their appointments in the database, so
      // every appointment-derived screen (home, agenda) is stale too.
      void queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all(ownerId) });
    },
  });
}
