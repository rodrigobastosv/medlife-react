import { AppError } from '@/core/errors';
import { supabase } from '@/core/supabase/client';
import { Table } from '@/core/supabase/tables';
import {
  patientDraftToColumns,
  toPatient,
  type Patient,
  type PatientDraft,
  type PatientRow,
} from '@/domain/patients/patient';

/**
 * Every read and write of `patients`.
 *
 * ---
 * **Why `ownerId` is a parameter instead of ambient state.**
 *
 * The Flutter app has a `SessionService` singleton that every datasource reaches
 * into for the active doctor. That works there. Here it would be a trap: React
 * caches by key, and a value read from a module-level singleton is invisible to
 * that key. A secretary linked to two doctors would switch doctors, the cache
 * key would not change, and she would be served the previous doctor's patients
 * from cache. Passing the id in makes it part of the query key by construction
 * (see `src/features/patients/use-patients.ts`), so the switch is a cache miss
 * and refetches, which is the correct behaviour.
 *
 * The filter is redundant with row-level security **on purpose**. RLS is what
 * makes access safe; this filter is what keeps a secretary linked to two doctors
 * from seeing both their patient lists merged into one.
 */
export async function fetchPatients(ownerId: string): Promise<Patient[]> {
  const { data, error } = await supabase
    .from(Table.patients)
    .select()
    .eq('owner_id', ownerId)
    .order('full_name', { ascending: true })
    .overrideTypes<PatientRow[], { merge: false }>();

  if (error !== null) {
    throw new AppError('Não foi possível carregar os pacientes', error);
  }
  return data.map(toPatient);
}

export async function fetchPatientsCount(ownerId: string): Promise<number> {
  // `head: true` asks Postgres for the count and no rows at all — the home
  // screen needs the number, not the list.
  const { count, error } = await supabase
    .from(Table.patients)
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', ownerId);

  if (error !== null) {
    throw new AppError('Não foi possível contar os pacientes', error);
  }
  return count ?? 0;
}

export async function fetchPatient(ownerId: string, id: string): Promise<Patient> {
  const { data, error } = await supabase
    .from(Table.patients)
    .select()
    .eq('id', id)
    .eq('owner_id', ownerId)
    .single<PatientRow>();

  if (error !== null) {
    throw new AppError('Não foi possível carregar o paciente', error);
  }
  return toPatient(data);
}

export async function createPatient(ownerId: string, draft: PatientDraft): Promise<Patient> {
  const { data, error } = await supabase
    .from(Table.patients)
    .insert({ ...patientDraftToColumns(draft), owner_id: ownerId })
    .select()
    .single<PatientRow>();

  if (error !== null) {
    throw new AppError('Não foi possível salvar o paciente', error);
  }
  return toPatient(data);
}

export async function updatePatient(
  ownerId: string,
  id: string,
  draft: PatientDraft,
): Promise<Patient> {
  const { data, error } = await supabase
    .from(Table.patients)
    .update(patientDraftToColumns(draft))
    .eq('id', id)
    .eq('owner_id', ownerId)
    .select()
    .single<PatientRow>();

  if (error !== null) {
    throw new AppError('Não foi possível atualizar o paciente', error);
  }
  return toPatient(data);
}

export async function deletePatient(ownerId: string, id: string): Promise<void> {
  const { error } = await supabase
    .from(Table.patients)
    .delete()
    .eq('id', id)
    .eq('owner_id', ownerId);

  if (error !== null) {
    throw new AppError('Não foi possível excluir o paciente', error);
  }
}
