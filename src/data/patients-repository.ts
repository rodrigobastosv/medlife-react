import type { PostgrestError } from '@supabase/supabase-js';

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
import { cpfSpellings } from '@/domain/patients/patient-cpf';

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

/**
 * The patient already holding this CPF, if there is one.
 *
 * Its job is to answer the form *before* the insert, so a duplicate register
 * ends as "this person is already here, open her" rather than as a rejected
 * save. It is not the guarantee — the unique index in
 * `supabase/migrations/007_patients_unique_cpf.sql` is, and it has to be,
 * because between this read and the write there is a gap and another device
 * (or the Flutter app) can write into it.
 *
 * The `in` list rather than an `eq` comes from `cpfSpellings`: the column holds
 * the CPF as typed, so the same person can be in there masked while the form
 * has bare digits. `limit(1)` is what lets this use `maybeSingle` — the table
 * *can* still hold two matches today, since the index does not exist until
 * somebody applies it, and `maybeSingle` on two rows is an error rather than an
 * answer.
 */
export async function findPatientByCpf(ownerId: string, cpf: string): Promise<Patient | null> {
  const spellings = cpfSpellings(cpf);
  if (spellings.length === 0) return null;

  const { data, error } = await supabase
    .from(Table.patients)
    .select()
    .eq('owner_id', ownerId)
    .in('cpf', spellings)
    .limit(1)
    .maybeSingle<PatientRow>();

  if (error !== null) {
    throw new AppError('Não foi possível verificar o CPF', error);
  }
  return data === null ? null : toPatient(data);
}

export async function createPatient(ownerId: string, draft: PatientDraft): Promise<Patient> {
  const { data, error } = await supabase
    .from(Table.patients)
    .insert({ ...patientDraftToColumns(draft), owner_id: ownerId })
    .select()
    .single<PatientRow>();

  if (error !== null) {
    throw writeError(error, 'Não foi possível salvar o paciente');
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
    throw writeError(error, 'Não foi possível atualizar o paciente');
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

/**
 * SQLSTATE 23505 is Postgres saying a unique index was violated, and on this
 * table there is exactly one: the CPF (migration 007). The insert that trips it
 * is the losing side of the race the form's lookup cannot close — two tabs, two
 * devices, or the Flutter app writing the same person a second earlier.
 *
 * Translating it here rather than in `messageOf` is deliberate. What the user
 * needs to read is not "unique violation", it is *which* rule they hit, and the
 * constraint's meaning is knowledge this repository has and `core/errors` does
 * not. Left untranslated it would surface as `duplicate key value violates
 * unique constraint "patients_owner_cpf_key"` in a toast, which is a sentence
 * about the database rather than about the person on the other side of the
 * desk.
 */
function writeError(error: PostgrestError, fallback: string): AppError {
  if (error.code === '23505') {
    return new AppError('Já existe um paciente com esse CPF neste cadastro', error);
  }
  return new AppError(fallback, error);
}
