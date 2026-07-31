import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

import { useToast } from '@/app/providers/toast-context';
import { Button } from '@/design-system/components/button';

/**
 * How often an open tab asks the server whether a newer worker exists. The
 * browser only checks on navigation, and this app is a SPA that is left open for
 * a whole shift — without this, a deploy at 09:00 would not be offered until the
 * tab is closed. An hour is short enough that a fix lands the same day and long
 * enough that it is not traffic anybody notices.
 */
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Module scope, not a ref: `onRegisteredSW` fires from inside the hook's own
 * effect, so StrictMode's deliberate double-mount runs it twice and there is no
 * cleanup phase to cancel the first interval from. One flag for the lifetime of
 * the document is the honest scope for a timer that is meant to exist once.
 */
let isUpdateCheckScheduled = false;

/**
 * The two moments a service worker has to say something out loud.
 *
 * They get different surfaces on purpose. "Já funciona offline" is information
 * that expires — a toast, which is the app's existing channel for that. "There
 * is a new version" needs a decision, and a message that disappears after four
 * seconds is not how you ask for one, so it is a banner that stays until the
 * user answers either way.
 *
 * The banner sits at the top because the toast region owns the bottom of the
 * screen; two overlapping notifications is the failure mode of adding a second
 * one without looking at the first.
 */
export function PwaUpdatePrompt() {
  const { showToast } = useToast();

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (registration === undefined || isUpdateCheckScheduled) return;
      isUpdateCheckScheduled = true;
      window.setInterval(() => {
        // `update()` while offline is a guaranteed rejected fetch, and it logs
        // in the console every hour for as long as the connection is down.
        if (navigator.onLine) void registration.update();
      }, UPDATE_CHECK_INTERVAL_MS);
    },
  });

  useEffect(() => {
    if (!offlineReady) return;
    showToast({ tone: 'success', message: 'O MedLife já funciona offline.' });
    // Cleared right after showing it: the flag is latched by the hook, and
    // leaving it set fires the toast again on the next render.
    setOfflineReady(false);
  }, [offlineReady, setOfflineReady, showToast]);

  if (!needRefresh) return null;

  return (
    <div
      // `polite`, not `assertive`: a pending update is never urgent enough to
      // interrupt whatever a screen reader is in the middle of.
      aria-live="polite"
      // The `max()` keeps the banner below the notch when the app is installed
      // and painting under it; without a safe area it is exactly `p-4`.
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))]"
    >
      <div className="border-outline bg-surface-container-high text-on-surface pointer-events-auto flex w-full max-w-[460px] flex-wrap items-center gap-3 rounded-l border px-4 py-3 text-sm shadow-lg">
        <span className="min-w-40 flex-1">Uma nova versão do MedLife está disponível.</span>
        <Button
          size="sm"
          onClick={() => {
            // This reloads the page: the waiting worker takes control and the
            // new bundle is what comes back. Nothing to do afterwards, which is
            // why the result is deliberately dropped.
            void updateServiceWorker();
          }}
        >
          Atualizar
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setNeedRefresh(false)}>
          Agora não
        </Button>
      </div>
    </div>
  );
}
