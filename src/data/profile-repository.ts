import { AppError } from '@/core/errors';
import { supabase } from '@/core/supabase/client';
import { Table } from '@/core/supabase/tables';
import {
  profileDisplayName,
  toProfile,
  type Profile,
  type ProfileRow,
} from '@/domain/profile/profile';

/**
 * The signed-in user's profile.
 *
 * The row is created by a database trigger at sign-up. If it comes back empty
 * something is wrong with the migration or the trigger, and failing loudly is
 * better than assuming `doctor` — that assumption would hand a secretary the
 * financial UI.
 */
export async function fetchMyProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase
    .from(Table.profiles)
    .select()
    .eq('id', userId)
    .single<ProfileRow>();

  if (error !== null) throw new AppError('Não foi possível carregar seu perfil', error);
  return toProfile(data);
}

/** Doctors the signed-in secretary has an active link to. Empty for a doctor. */
export async function fetchLinkedDoctors(userId: string): Promise<Profile[]> {
  // The `!doctor_secretaries_doctor_id_fkey` hint names *which* foreign key to
  // follow. The table has two FKs into `profiles` (doctor and secretary), so
  // without it PostgREST cannot tell which relationship the embed means.
  const { data, error } = await supabase
    .from(Table.doctorSecretaries)
    .select('doctor_id, profiles!doctor_secretaries_doctor_id_fkey(id, role, full_name)')
    .eq('secretary_id', userId)
    .eq('status', 'active')
    .returns<{ doctor_id: string; profiles: ProfileRow | null }[]>();

  if (error !== null) throw new AppError('Não foi possível carregar seus médicos', error);

  return data
    .map((row) => row.profiles)
    .filter((profile): profile is ProfileRow => profile !== null)
    .map(toProfile)
    .sort((a, b) =>
      profileDisplayName(a).toLowerCase().localeCompare(profileDisplayName(b).toLowerCase()),
    );
}
