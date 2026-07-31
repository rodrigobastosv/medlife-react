import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useSession } from '@/app/providers/session-context';
import {
  fetchNotificationPreferences,
  saveNotificationPreferences,
} from '@/data/notification-preferences-repository';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from '@/domain/notifications/notification-preferences';
import { queryKeys } from '@/features/query-keys';

/**
 * The signed-in user's notification preferences.
 *
 * Note this reads `userId` from the session rather than going through
 * `useDataScope()`. Two reasons, and both matter: the row is the person's and
 * not the active doctor's, and `/settings` — the only screen that renders these
 * — sits deliberately outside `RequireActiveDoctor`, so `useDataScope()` would
 * throw there for a secretary with no active link.
 */
export function useNotificationPreferencesQuery() {
  const { userId } = useSession();

  return useQuery({
    queryKey: queryKeys.notifications.preferences(userId ?? ''),
    queryFn: () => fetchNotificationPreferences(userId!),
    enabled: userId !== null,
    // A preference changes only when this user changes it, and the mutation
    // below writes the result straight into the cache. Refetching on every
    // window focus would be a request that can only ever confirm what is already
    // on screen.
    staleTime: Infinity,
  });
}

/**
 * The preferences as the rest of the app should read them: never `undefined`.
 *
 * While the query is in flight the answer is "everything off", which is the
 * safe direction to be wrong in — the scheduler stays quiet for a moment rather
 * than firing on a default nobody chose.
 */
export function useNotificationPreferences(): NotificationPreferences {
  return useNotificationPreferencesQuery().data ?? DEFAULT_NOTIFICATION_PREFERENCES;
}

export function useSaveNotificationPreferencesMutation() {
  const { userId } = useSession();
  const queryClient = useQueryClient();
  const key = queryKeys.notifications.preferences(userId ?? '');

  return useMutation({
    mutationFn: (preferences: NotificationPreferences) => {
      // A mutation has no `enabled` to wait behind, so the impossible null is
      // asserted here instead — the card only renders inside the authenticated
      // layout, and a null id there is a bug rather than a state to render.
      if (userId === null) throw new Error('Sessão expirada. Entre novamente.');
      return saveNotificationPreferences(userId, preferences);
    },

    /*
      Optimistic, because these are switches. A toggle that waits for a round
      trip before moving reads as a broken control, and the user flips it again
      — which is how you end up sending two writes for one intention.

      The cancel is not optional: an in-flight refetch that resolves after this
      would overwrite the optimistic value with the pre-toggle row.
    */
    onMutate: async (preferences) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<NotificationPreferences>(key);
      queryClient.setQueryData(key, preferences);
      return { previous };
    },

    onError: (_error, _preferences, context) => {
      // Put the switch back where it was. Without this the UI keeps claiming a
      // setting that the database never accepted.
      if (context?.previous !== undefined) queryClient.setQueryData(key, context.previous);
    },

    // The row as saved, with the `time` columns normalised. No invalidation:
    // the response *is* the new truth, so a refetch would only ask for what has
    // just been written.
    onSuccess: (saved) => queryClient.setQueryData(key, saved),
  });
}
