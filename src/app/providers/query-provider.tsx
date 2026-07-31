import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

/**
 * TanStack Query is this app's answer to the Flutter app's cubits — for the
 * *server* half of the state, which is nearly all of it.
 *
 * Every screen in MedLife loads rows from Supabase, shows them, and has to
 * refresh them after a write. A cubit models that by hand: a loading flag, an
 * error field, a `load()` to call again after every mutation. Query does the
 * same job declaratively (`useQuery` returns `{ data, isPending, error }`) and
 * adds caching, deduplication and invalidation on top. The remaining local state
 * — a selected month, whether a dialog is open — stays in `useState`, which is
 * the actual division: *server state* in Query, *UI state* in React.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  // Created inside `useState`'s initializer so it is built exactly once per app
  // instance. A `new QueryClient()` written straight in the component body would
  // be recreated on every render, throwing away the whole cache each time.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // How long data is considered fresh. With 0 (the default) every
            // remount refetches, which for a screen the user tabs back and forth
            // between is a request per visit for data that has not changed.
            // 30s is a compromise: the app feels instant when navigating back,
            // and a change made elsewhere still shows up quickly.
            staleTime: 30_000,
            // Retrying an authorisation or validation failure just delays the
            // error message — nothing about a second identical request will make
            // RLS change its mind. Only a genuinely flaky network deserves the
            // one retry.
            retry: 1,
            refetchOnWindowFocus: false,
            // The default, `'online'`, refuses to fire a query at all while the
            // browser reports no network: the query sits in `fetchStatus:
            // 'paused'` and every screen spins forever, which reads as a hang
            // rather than as an outage. `'offlineFirst'` lets the first attempt
            // go out — `navigator.onLine` is optimistic enough that "offline"
            // sometimes still has a service worker or a captive portal behind it
            // — and only *pauses the retries*, so the failure surfaces as the
            // error state the screens already know how to draw instead of
            // burning the retry budget against a network that is known to be
            // down. The banner is what turns that error into an explanation.
            networkMode: 'offlineFirst',
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
