import { AppError } from '@/core/errors';
import { supabase } from '@/core/supabase/client';
import { Table } from '@/core/supabase/tables';
import type { ProfileRow } from '@/domain/profile/profile';
import type { SecretaryLink } from '@/domain/secretaries/secretary-link';

/** Active links and pending invitations, merged into the one list the doctor reads. */
export async function fetchSecretaries(doctorId: string): Promise<SecretaryLink[]> {
  const [links, invites] = await Promise.all([
    supabase
      .from(Table.doctorSecretaries)
      .select('secretary_id, profiles!doctor_secretaries_secretary_id_fkey(id, full_name)')
      .eq('doctor_id', doctorId)
      .eq('status', 'active')
      .overrideTypes<
        { secretary_id: string; profiles: Pick<ProfileRow, 'id' | 'full_name'> | null }[],
        { merge: false }
      >(),
    supabase
      .from(Table.secretaryInvites)
      .select('id, email')
      .eq('doctor_id', doctorId)
      .eq('status', 'pending')
      .overrideTypes<{ id: string; email: string }[], { merge: false }>(),
  ]);

  if (links.error !== null || invites.error !== null) {
    throw new AppError('Não foi possível carregar suas secretárias', links.error ?? invites.error);
  }

  return [
    ...links.data.map((row): SecretaryLink => {
      const name = row.profiles?.full_name?.trim();
      return {
        id: row.secretary_id,
        label: name === undefined || name === '' ? 'Secretária' : name,
        isPending: false,
      };
    }),
    ...invites.data.map((row): SecretaryLink => ({
      id: row.id,
      label: row.email,
      isPending: true,
    })),
  ];
}

/**
 * Creates the invitation. The link itself is only born when she signs up with
 * this e-mail — a database trigger does that, not the app.
 */
export async function inviteSecretary(doctorId: string, email: string): Promise<void> {
  const { error } = await supabase.from(Table.secretaryInvites).insert({
    doctor_id: doctorId,
    email: email.trim().toLowerCase(),
  });

  if (error !== null) throw new AppError('Não foi possível enviar o convite', error);
}

/**
 * Revokes rather than deletes: the row stays, its status changes. Deleting would
 * erase the trail of who had access to what, which is exactly the record a
 * clinic needs to keep.
 */
export async function revokeSecretary(doctorId: string, link: SecretaryLink): Promise<void> {
  const { error } = link.isPending
    ? await supabase
        .from(Table.secretaryInvites)
        .update({ status: 'revoked' })
        .eq('id', link.id)
        .eq('doctor_id', doctorId)
    : await supabase
        .from(Table.doctorSecretaries)
        .update({ status: 'revoked' })
        .eq('doctor_id', doctorId)
        .eq('secretary_id', link.id);

  if (error !== null) throw new AppError('Não foi possível revogar o acesso', error);
}
