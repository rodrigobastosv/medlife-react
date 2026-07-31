import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useSession } from '@/app/providers/session-context';
import {
  notificationSupport,
  requestNotificationPermission,
} from '@/core/notifications/web-notifications';
import {
  currentPushRegistration,
  isPushConfigured,
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from '@/core/notifications/web-push';
import {
  registerPushSubscription,
  unregisterPushSubscription,
} from '@/data/push-subscriptions-repository';
import { queryKeys } from '@/features/query-keys';
import { useSaveNotificationPreferencesMutation } from '@/features/notifications/use-notification-preferences';
import type { NotificationPreferences } from '@/domain/notifications/notification-preferences';

/**
 * How far this device is from being able to receive a notification.
 *
 * Five states rather than a boolean, because each one has a different fix and
 * telling the user the wrong one wastes their time:
 *
 * - `unsupported`  — no push in this browser. On iPhone that means "not added to
 *                    the home screen yet", which is an instruction, not a failure.
 * - `unconfigured` — the build has no VAPID key. That is an operator problem, and
 *                    saying "ative as notificações" to the user would be a lie.
 * - `blocked`      — permission denied. Unrecoverable from JavaScript; only the
 *                    browser's own settings can undo it.
 * - `idle`         — everything works, this device just has not opted in.
 * - `ready`        — permission granted *and* registered with the push service.
 *
 * `granted` without a registration is a real state, not a transient one: a
 * browser can drop its subscription on its own (cleared site data, an expiry)
 * while the permission survives, and it looks exactly like being subscribed
 * until something asks.
 */
export type PushStatus = 'unsupported' | 'unconfigured' | 'blocked' | 'idle' | 'ready';

export function usePushSubscription() {
  const { userId } = useSession();
  const queryClient = useQueryClient();
  const savePreferences = useSaveNotificationPreferencesMutation();
  const key = queryKeys.notifications.pushRegistration(userId ?? '');

  const registration = useQuery({
    queryKey: key,
    queryFn: currentPushRegistration,
    enabled: userId !== null && isPushSupported(),
    // The browser's answer does not change unless this app changes it, and every
    // path that does invalidates the key below.
    staleTime: Infinity,
  });

  const status = resolveStatus(registration.data ?? null, registration.isPending);

  /**
   * Permission, then subscription, then the two writes — in that order, because
   * each step is only meaningful once the one before it succeeded.
   *
   * The timezone is captured **here**, at the moment of opting in, and not
   * refreshed afterwards. On the server "07:30" means nothing until a zone is
   * named, and the right zone is the clinic's: appointments are recorded in
   * wall-clock time, so a doctor answering e-mail from another country still
   * wants the morning summary on the clock their patients are keeping.
   */
  const enable = useMutation({
    mutationFn: async (preferences: NotificationPreferences) => {
      // Asserted once, here, rather than threaded through as a nullable. This
      // card only renders inside the authenticated layout, so a null id is not a
      // case to handle — it is a bug, and it should say so.
      if (userId === null) throw new Error('Sessão expirada. Entre novamente.');

      const permission = await requestNotificationPermission();
      if (permission !== 'granted') {
        throw new Error(
          permission === 'denied'
            ? 'As notificações foram bloqueadas neste navegador.'
            : 'É preciso autorizar as notificações para continuar.',
        );
      }

      const pushRegistration = await subscribeToPush();
      await registerPushSubscription(userId, pushRegistration);

      await savePreferences.mutateAsync({
        ...preferences,
        pushEnabled: true,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });

      return pushRegistration;
    },
    onSuccess: (pushRegistration) => queryClient.setQueryData(key, pushRegistration),
  });

  /**
   * Stops *this* device, and only this device.
   *
   * `push_enabled` on the account is deliberately left alone: it records that the
   * person opted in, and a doctor turning the desktop off should not silence the
   * phone in their pocket. Stopping everything is what the four switches are for
   * — that is a decision about what to be told, which belongs to the person, not
   * to the browser they happen to be sitting at.
   */
  const disable = useMutation({
    mutationFn: async () => {
      if (userId === null) throw new Error('Sessão expirada. Entre novamente.');

      const endpoint = await unsubscribeFromPush();
      // Unregistered locally but the row still on the server would leave the
      // function pushing to a dead endpoint until it collects enough 410s.
      if (endpoint !== null) await unregisterPushSubscription(userId, endpoint);
    },
    onSuccess: () => queryClient.setQueryData(key, null),
  });

  return {
    status,
    isBusy: enable.isPending || disable.isPending,
    enable: enable.mutate,
    disable: disable.mutate,
  };
}

function resolveStatus(registration: { endpoint: string } | null, isPending: boolean): PushStatus {
  if (!isPushSupported()) return 'unsupported';
  if (!isPushConfigured()) return 'unconfigured';

  const permission = notificationSupport();
  if (permission === 'unsupported') return 'unsupported';
  if (permission === 'denied') return 'blocked';

  // Still asking the browser. Reported as `idle` rather than as a sixth state:
  // the only thing it changes is whether the button is disabled, and that is
  // already covered by `isBusy`.
  if (isPending) return 'idle';

  return permission === 'granted' && registration !== null ? 'ready' : 'idle';
}
