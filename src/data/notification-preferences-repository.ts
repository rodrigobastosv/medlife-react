import { AppError } from '@/core/errors';
import { supabase } from '@/core/supabase/client';
import { Table } from '@/core/supabase/tables';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  preferencesToColumns,
  toNotificationPreferences,
  type NotificationPreferences,
  type NotificationPreferencesRow,
} from '@/domain/notifications/notification-preferences';

/**
 * The signed-in user's notification settings.
 *
 * Keyed on `user_id` and **not** on the scope's `ownerId`, which makes this the
 * one repository in the app that does not take a `Scope`. The distinction is the
 * point: every other table here answers "whose patients are these", and this one
 * answers "how does the person at the keyboard want to be interrupted". A
 * secretary linked to three doctors has one answer to that, and it follows her
 * when she switches between them.
 */
export async function fetchNotificationPreferences(
  userId: string,
): Promise<NotificationPreferences> {
  const { data, error } = await supabase
    .from(Table.notificationPreferences)
    .select()
    .eq('user_id', userId)
    // `maybeSingle`, not `single`: a user who has never opened Ajustes has no
    // row, and that is the normal case rather than an error. `single` would turn
    // "has not chosen yet" into a failed query on every app start.
    .maybeSingle<NotificationPreferencesRow>();

  if (error !== null) {
    throw new AppError('Não foi possível carregar suas preferências de notificação', error);
  }

  // No row reads back as everything off — the same values the column defaults
  // would have produced, so the absence of a row is never a different state from
  // a freshly created one.
  return data === null ? DEFAULT_NOTIFICATION_PREFERENCES : toNotificationPreferences(data);
}

/**
 * Writes the whole set of preferences.
 *
 * `upsert` rather than insert-or-update: the row is created the first time
 * anything is toggled, and there is no separate "have they got a row yet"
 * question for the caller to get wrong. The primary key is `user_id`, so the
 * conflict target is implicit.
 */
export async function saveNotificationPreferences(
  userId: string,
  preferences: NotificationPreferences,
): Promise<NotificationPreferences> {
  const { data, error } = await supabase
    .from(Table.notificationPreferences)
    .upsert({ user_id: userId, ...preferencesToColumns(preferences) })
    .select()
    .single<NotificationPreferencesRow>();

  if (error !== null) {
    throw new AppError('Não foi possível salvar suas preferências de notificação', error);
  }

  // The row as the database now holds it, not the object that was sent: the
  // `time` columns come back normalised to `HH:mm:ss`, and returning the input
  // would leave the cache holding a shape the next read disagrees with.
  return toNotificationPreferences(data);
}
