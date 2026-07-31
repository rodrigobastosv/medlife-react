import { useSyncExternalStore } from 'react';

/**
 * Whether the browser believes it has a network.
 *
 * `useSyncExternalStore` rather than `useState` + `useEffect` because
 * `navigator.onLine` is exactly what that hook is for: a value that lives
 * outside React and changes without React being told. Read in an effect
 * instead, the first paint always claims "online" and then corrects itself —
 * which for a banner means a flash of the wrong answer on every load of an app
 * that was opened offline, the one case this whole feature exists to serve.
 *
 * The caveat worth repeating at the call site: `navigator.onLine` is optimistic.
 * It reports a connection to a captive portal, or to a router with no uplink, as
 * being online. `false` is trustworthy — nothing is going anywhere — but `true`
 * only means "an interface is up". That asymmetry is why this drives a message
 * and never a decision: showing the banner is safe when it is right, and nothing
 * breaks when it is wrong.
 */
export function useOnlineStatus() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function subscribe(onStoreChange: () => void) {
  window.addEventListener('online', onStoreChange);
  window.addEventListener('offline', onStoreChange);
  return () => {
    window.removeEventListener('online', onStoreChange);
    window.removeEventListener('offline', onStoreChange);
  };
}

function getSnapshot() {
  return navigator.onLine;
}

// There is no server render here, but the hook demands the argument and the
// honest default is the optimistic one: a document that has just been served
// arrived over a network.
function getServerSnapshot() {
  return true;
}
