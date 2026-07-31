/**
 * The browser's notification *permission*, wrapped once.
 *
 * Only the permission. Showing a notification is no longer this layer's job —
 * the messages arrive as push events and `public/sw-notifications.js` renders
 * them in the service worker, which is the only context that exists when the app
 * is closed. What is left here is the part that still needs a page and a user
 * gesture: asking.
 *
 * Its companion is `web-push.ts`, which owns the subscription. The two are
 * separate because they fail separately — see the note there.
 */

/**
 * What the app is allowed to do right now.
 *
 * `unsupported` is a real and common state, not a defensive branch: on iOS the
 * `Notification` constructor does not exist at all until the app has been added
 * to the home screen, so a Safari user reading this screen has no permission to
 * grant. The UI has to say that rather than render a button that does nothing,
 * which is why this is a fourth value and not a `false` folded into `default`.
 */
export type NotificationSupport = 'unsupported' | 'default' | 'granted' | 'denied';

export function notificationSupport(): NotificationSupport {
  // Both are required. The permission lives on `Notification`, but every message
  // is delivered by the service worker, so a browser with one and not the other
  // cannot actually notify anyone.
  if (typeof window === 'undefined') return 'unsupported';
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return 'unsupported';

  const permission = Notification.permission;
  return permission === 'granted' || permission === 'denied' ? permission : 'default';
}

/**
 * Asks for the permission. **Only ever from a click handler.**
 *
 * Browsers penalise a prompt that appears on page load — Safari ignores it
 * outright, and Chrome's quiet UI hides it behind an icon nobody looks at — so
 * the request is deliberately not made anywhere the user did not ask for it.
 *
 * There is no way back from `denied`. Once refused, this function resolves to
 * `denied` forever without showing anything, and only the user changing it in
 * the browser's own settings can undo it. That is why the caller has to
 * distinguish the two states instead of retrying.
 */
export async function requestNotificationPermission(): Promise<NotificationSupport> {
  if (notificationSupport() === 'unsupported') return 'unsupported';

  try {
    const permission = await Notification.requestPermission();
    return permission === 'granted' || permission === 'denied' ? permission : 'default';
  } catch {
    // Older Safari implements the callback form and rejects the promise one.
    // A failure to ask is not a failure worth surfacing — the screen simply
    // stays on its "not enabled yet" state.
    return notificationSupport();
  }
}
