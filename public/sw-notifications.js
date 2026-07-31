/*
  What happens when a notification is clicked.

  This file is imported into the generated service worker (`workbox.importScripts`
  in `vite.config.ts`) rather than being the worker itself. The alternative is
  switching vite-plugin-pwa to `injectManifest`, which means hand-writing and
  maintaining the whole precache/routing worker — a lot of surface to own for one
  event handler. Importing keeps the generated worker generated.

  It is deliberately plain JavaScript in `public/`: this is not part of the app
  bundle, it runs in the worker's own global scope, and nothing here should be
  transformed or tree-shaken.
*/

/*
  A push message arrived.

  This is the event the whole server side exists to produce, and the only one
  that runs with the app closed — the browser's push service starts the worker
  for it and stops the worker when it is done.

  `event.waitUntil` is not optional. The worker was started *for this event* and
  is killed the moment the handler returns, so a bare `showNotification()` call
  is a promise racing against its own termination; it works on a warm worker and
  silently drops on a cold one, which is exactly the case that matters.

  The `catch` matters just as much. Chrome enforces the promise made by
  `userVisibleOnly: true`: a push that shows nothing gets the user a "this site
  was updated in the background" notice, and repeatedly doing it costs the site
  its push permission. So a malformed payload still shows *something*, rather
  than being quietly swallowed.
*/
self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let payload = null;
      try {
        payload = event.data ? event.data.json() : null;
      } catch {
        payload = null;
      }

      if (payload === null) {
        await self.registration.showNotification('MedLife', {
          body: 'Você tem um aviso novo.',
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
        });
        return;
      }

      await self.registration.showNotification(payload.title, {
        body: payload.body,
        // Same tag replaces rather than stacks — the server sends the dedupe key
        // here, so a message delivered twice is still one notification.
        tag: payload.tag,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        lang: 'pt-BR',
        // Read back by the click handler below.
        data: { path: payload.path },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const path =
    event.notification.data && typeof event.notification.data.path === 'string'
      ? event.notification.data.path
      : '/';
  const url = new URL(path, self.location.origin);

  /*
    Focus what is already open before opening anything new.

    Without this, clicking a notification while the app is running in another
    window opens a *second* copy of a single-page app — two tabs of the same
    session, one of which the user did not ask for. `waitUntil` keeps the worker
    alive until the promise settles; the browser is free to kill it the moment
    the handler returns otherwise, and the navigation would never happen.
  */
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        // Same origin is the test that matters, not the same path: the app is a
        // SPA, so any open window can be navigated to the target route.
        if (new URL(client.url).origin === url.origin && 'focus' in client) {
          // `navigate` is not available on every client, and it rejects if the
          // window is mid-navigation. Focusing is the part that must not be lost,
          // so it comes first and the route change is best-effort on top of it.
          return client.focus().then((focused) => {
            if (focused && 'navigate' in focused) {
              return focused.navigate(url.href).catch(() => focused);
            }
            return focused;
          });
        }
      }

      return self.clients.openWindow(url.href);
    }),
  );
});
