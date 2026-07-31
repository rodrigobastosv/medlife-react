import { AppError } from '@/core/errors';
import type { PushRegistration } from '@/core/notifications/web-push';
import { supabase } from '@/core/supabase/client';
import { Table } from '@/core/supabase/tables';

/**
 * Where a user's browsers are registered so the server can reach them.
 *
 * Like the notification preferences, this is keyed on the **signed-in user** and
 * takes no `Scope` — a browser belongs to a person, not to a doctor's data. The
 * difference from preferences is that there is one row per *browser*: the desktop
 * in the consulting room and the phone in a pocket are two registrations, and
 * both should receive.
 */
export async function registerPushSubscription(
  userId: string,
  registration: PushRegistration,
): Promise<void> {
  const { error } = await supabase.from(Table.pushSubscriptions).upsert(
    {
      endpoint: registration.endpoint,
      user_id: userId,
      p256dh: registration.p256dh,
      auth: registration.auth,
      user_agent: navigator.userAgent,
      // Re-registering is also how a subscription comes back from the dead: the
      // server may have counted failures against it while this browser was
      // offline, and arriving here means it is listening again.
      failure_count: 0,
      last_seen_at: new Date().toISOString(),
    },
    // The endpoint is the primary key, so re-subscribing on the same browser
    // updates its row instead of adding a second one for the same device.
    { onConflict: 'endpoint' },
  );

  if (error !== null) {
    throw new AppError('Não foi possível registrar este aparelho para notificações', error);
  }
}

/**
 * Removes a registration.
 *
 * Filtered by `user_id` as well as by endpoint even though the endpoint alone is
 * unique. RLS already makes it impossible to delete somebody else's row, so this
 * changes no outcome — it states the intent in the query, so a future change to
 * the policy cannot silently widen what this call does.
 */
export async function unregisterPushSubscription(userId: string, endpoint: string): Promise<void> {
  const { error } = await supabase
    .from(Table.pushSubscriptions)
    .delete()
    .eq('endpoint', endpoint)
    .eq('user_id', userId);

  if (error !== null) {
    throw new AppError('Não foi possível remover este aparelho das notificações', error);
  }
}
