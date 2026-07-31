import { useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { routes } from '@/app/routing/routes';
import { Button } from '@/design-system/components/button';
import { buttonClasses } from '@/design-system/components/button-classes';

/**
 * What the user sees when a screen throws while rendering.
 *
 * Without this, React unmounts the whole tree on the first exception and leaves
 * a blank document — no message, no way back, and nothing to tell the user that
 * anything is recoverable. In a browser open during a consultation that is the
 * worst possible failure mode, and it is also the cheapest one to fix: a route
 * with an `errorElement` catches everything rendered beneath it.
 *
 * **What this does not cover, and why that is fine.** `errorElement` catches
 * render, loader and action errors. It does *not* catch an error thrown inside
 * an event handler or an async callback — a failed save, a refused query — and
 * it should not: those already carry a Portuguese sentence via `AppError` and
 * reach the user as a toast (`messageOf`), which leaves the screen they were
 * working on intact. The split is deliberate. A boundary that swallowed them too
 * would replace a full page of context with an apology every time a request
 * failed.
 *
 * **No stack trace, and no error text either.** `useRouteError()` is available
 * here, but what it holds is almost always a `TypeError` or a `RangeError`
 * phrased in English by a library — "Invalid time value" tells a doctor nothing
 * and tells an attacker slightly too much. React Router already logs the error
 * to the console for whoever is debugging, so printing it a second time on
 * screen buys nothing.
 */
export function RouteErrorPage() {
  return <RouteErrorFallback backLabel="Voltar ao início" backTo={routes.home} />;
}

/**
 * The same fallback for the sign-in and sign-up routes.
 *
 * It differs only in where it sends the user: Início is behind the auth guard,
 * so offering it to someone who is not signed in would bounce them straight back
 * to the screen that just failed.
 */
export function GuestRouteErrorPage() {
  return <RouteErrorFallback backLabel="Voltar para o login" backTo={routes.signIn} />;
}

function RouteErrorFallback({ backLabel, backTo }: { backLabel: string; backTo: string }) {
  const retry = useRetryCurrentRoute();

  return (
    // `role="alert"` because this replaces the page's content without a
    // navigation: a screen reader would otherwise announce nothing at all and
    // leave the user reading a screen that is no longer there.
    <div
      role="alert"
      className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-24 text-center"
    >
      <h1 className="font-display text-xl font-bold">Algo deu errado</h1>
      <p className="text-on-surface-variant text-sm">
        Um erro inesperado impediu a exibição desta tela. Você pode tentar de novo ou voltar e
        seguir por outro caminho.
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <Button size="sm" onClick={retry}>
          Tentar de novo
        </Button>
        <Link to={backTo} className={buttonClasses({ variant: 'outline', size: 'sm' })}>
          {backLabel}
        </Link>
      </div>
    </div>
  );
}

/**
 * "Tentar de novo": drop what the crashed screen was built from, then re-render
 * the same URL.
 *
 * Both halves are needed. Navigating is what clears the boundary — React Router
 * resets it when the location object changes, which is why this replaces the
 * current entry instead of pushing a new one. But a re-render alone would
 * usually reproduce the crash immediately: the row that broke the formatter is
 * still in the query cache, and TanStack Query serves cached data before it
 * refetches. A retry button that reliably fails is worse than none.
 *
 * Dropping *inactive* queries rather than calling `queryClient.clear()` is the
 * precise version of "forget this screen". When the boundary caught the error it
 * unmounted the page, so the queries that fed it are exactly the ones that just
 * became inactive; the session's profile and linked-doctors queries live in a
 * provider above the router and stay active. Clearing everything would take
 * those with it, drop the app back to `status: 'loading'`, and answer a render
 * error with a full-page spinner. Other screens' cached rows go too, which costs
 * one refetch when they are next opened.
 */
function useRetryCurrentRoute() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();

  return () => {
    queryClient.removeQueries({ type: 'inactive' });
    // Rebuilt field by field rather than passing `location` straight through:
    // that object carries the history entry's `key`, and reusing it would give
    // two entries the same identity.
    void navigate(
      { pathname: location.pathname, search: location.search, hash: location.hash },
      { replace: true },
    );
  };
}
