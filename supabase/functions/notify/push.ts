import * as webpush from '@negrel/webpush';

import type { DueNotification } from './plan.ts';
import type { StoredSubscription } from './queries.ts';

/**
 * Sending a notification to a browser that may have been closed for days.
 *
 * `@negrel/webpush` rather than the obvious `npm:web-push`: the Node library
 * reaches for `require('https')` and does not run on Deno at all
 * (denoland/deno#23693). This one is written against `SubtleCrypto` and the
 * fetch API, which is exactly the set of things the Edge Runtime has.
 */

/**
 * The application server, built once per invocation and reused for every message.
 *
 * `ApplicationServer.new` imports the VAPID keys and derives material used to
 * sign every request; doing it per notification would repeat that work for each
 * subscriber on the list.
 */
export async function applicationServer(): Promise<webpush.ApplicationServer> {
  const keysJson = Deno.env.get('VAPID_KEYS');
  const contact = Deno.env.get('VAPID_CONTACT');
  if (keysJson === undefined || contact === undefined) {
    throw new Error('VAPID_KEYS e VAPID_CONTACT são obrigatórios');
  }

  const vapidKeys = await webpush.importVapidKeys(JSON.parse(keysJson), {
    // Not extractable: nothing here ever needs to read the private key back out,
    // and telling the runtime that up front means a bug cannot serialise it into
    // a log line.
    extractable: false,
  });

  return await webpush.ApplicationServer.new({
    // Firefox and Chrome's push services use this to reach a human when an
    // application server starts misbehaving. A wrong address here is how a
    // sender finds out it has been throttled only after the fact.
    contactInformation: contact,
    vapidKeys,
  });
}

/**
 * What the service worker receives. Kept deliberately small: the payload is
 * encrypted, but it still travels through Google's or Mozilla's servers and is
 * held there until the device comes online, so it carries the message that was
 * already going to be shown on a lock screen and nothing more.
 */
interface PushPayload {
  readonly title: string;
  readonly body: string;
  readonly tag: string;
  readonly path: string;
}

export type SendOutcome = 'sent' | 'gone' | 'failed';

export async function sendPush(
  server: webpush.ApplicationServer,
  subscription: StoredSubscription,
  notification: DueNotification,
  path: string,
): Promise<SendOutcome> {
  const payload: PushPayload = {
    title: notification.title,
    body: notification.body,
    tag: notification.tag,
    path,
  };

  try {
    await server
      .subscribe({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      })
      .pushTextMessage(JSON.stringify(payload), {
        // Held by the push service for up to a day if the device is offline.
        // Long enough that a phone left in a bag still gets the morning summary
        // when it comes back; short enough that a reminder for a consult two
        // days ago never arrives at all.
        ttl: 24 * 60 * 60,
      });
    return 'sent';
  } catch (error) {
    // 410 Gone is the push service saying the browser unsubscribed. 404 means it
    // never heard of the endpoint. Either way the registration is dead and the
    // row should go, which is a different outcome from "could not reach it".
    if (error instanceof webpush.PushMessageError) {
      if (error.isGone() || error.response.status === 404) return 'gone';
    }
    console.error('push falhou', subscription.endpoint, String(error));
    return 'failed';
  }
}

/**
 * The in-app path a notification opens, from the planner's abstract target.
 *
 * The routes are written out here rather than imported from
 * `src/app/routing/routes.ts` for the same reason the planner had to move: this
 * function's bundle cannot reach into the frontend's source tree. They are three
 * literals, and the only one with any structure is mirrored from `routes.patient`.
 */
export function pathFor(target: DueNotification['target']): string {
  switch (target.screen) {
    case 'home':
      return '/';
    case 'agenda':
      return '/agenda';
    case 'patient':
      return `/patients/${target.patientId}`;
  }
}
