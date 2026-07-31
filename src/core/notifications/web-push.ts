import { env } from '@/core/env';

/**
 * Registering this browser to receive push messages.
 *
 * Sitting beside `web-notifications.ts`, which owns the *permission*. The two
 * are separate steps and fail separately: permission is granted once per origin
 * per device and is what the browser asks the user about, while a subscription
 * is a registration with the push service that this particular browser holds and
 * can drop on its own — clearing site data, an OS reinstall, or the service
 * simply expiring it. Someone can have granted permission and still not be
 * reachable, which is why the settings screen distinguishes the two states.
 */

/** What the server needs to reach this browser. Mirrors `push_subscriptions`. */
export interface PushRegistration {
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
}

export const isPushConfigured = (): boolean => env.vapidPublicKey !== '';

export function isPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  // `PushManager` is the one to test, not `Notification`: iOS Safari has had
  // notifications for installed web apps since 16.4, and a browser can support
  // showing a notification while having no push service behind it.
  return 'serviceWorker' in navigator && 'PushManager' in window;
}

/**
 * The registration this browser already holds, if any.
 *
 * Asked of the browser rather than of our own database, because the browser is
 * the authority: a row in `push_subscriptions` that the browser has since
 * dropped is a stale row, and the endpoint it names is dead.
 */
export async function currentPushRegistration(): Promise<PushRegistration | null> {
  if (!isPushSupported()) return null;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  return subscription === null ? null : toRegistration(subscription);
}

/**
 * Subscribes this browser, or returns the existing registration.
 *
 * `userVisibleOnly: true` is not a choice — Chrome rejects any other value. It
 * is the browser holding the site to a promise: every push message received will
 * result in a notification the user can see. A site that takes pushes and stays
 * silent is doing background work on someone's battery without telling them, and
 * losing the permission is the penalty.
 */
export async function subscribeToPush(): Promise<PushRegistration> {
  if (!isPushSupported()) throw new Error('Este navegador não suporta notificações push.');
  if (!isPushConfigured()) throw new Error('As notificações push não estão configuradas.');

  const registration = await navigator.serviceWorker.ready;

  const existing = await registration.pushManager.getSubscription();
  // Re-subscribing with the same key returns the same endpoint anyway, but going
  // through `subscribe` again would be a needless round trip to the push service
  // on every visit to the settings screen.
  if (existing !== null) return toRegistration(existing);

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: decodeBase64Url(env.vapidPublicKey),
  });

  return toRegistration(subscription);
}

/** Drops the registration. Returns the endpoint that was removed, if there was one. */
export async function unsubscribeFromPush(): Promise<string | null> {
  if (!isPushSupported()) return null;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription === null) return null;

  const { endpoint } = subscription;
  await subscription.unsubscribe();
  return endpoint;
}

/* ------------------------------------------------------------------------- */

/**
 * `PushSubscription` carries its keys as raw `ArrayBuffer`s; the database column
 * and the push protocol both want base64url text. `toJSON()` has already done
 * that conversion, which is why it is used instead of reading `getKey()` and
 * encoding by hand.
 */
function toRegistration(subscription: PushSubscription): PushRegistration {
  const json = subscription.toJSON();
  const p256dh = json.keys?.['p256dh'];
  const auth = json.keys?.['auth'];

  if (p256dh === undefined || auth === undefined) {
    // Only reachable if the browser handed back a subscription without the
    // encryption keys, which would make every message to it undeliverable.
    // Failing here beats storing a row the server can never use.
    throw new Error('O navegador devolveu uma inscrição incompleta.');
  }

  return { endpoint: subscription.endpoint, p256dh, auth };
}

/**
 * base64url → bytes, for the VAPID public key.
 *
 * `applicationServerKey` takes a `Uint8Array`, and the key is distributed as
 * base64url — the URL-safe alphabet, so `-` and `_` stand in for `+` and `/`,
 * and the `=` padding is dropped. `atob` understands neither, so both have to be
 * put back before decoding. Skipping this is the classic cause of an
 * `InvalidAccessError` on `subscribe()` that reads like a permissions problem.
 */
function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), '=');
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));

  // Allocated and filled rather than built with `Uint8Array.from`, which types
  // its result as backed by `ArrayBufferLike` — that includes `SharedArrayBuffer`,
  // and `applicationServerKey` will not accept one. Sizing the array up front
  // pins the buffer type to a plain `ArrayBuffer`.
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
