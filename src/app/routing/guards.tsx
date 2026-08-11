import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useSession } from '@/app/providers/session-context';
import { routes } from '@/app/routing/routes';
import { PageSpinner } from '@/design-system/components/spinner';

/**
 * Route guards, as **layout routes**: they render an `<Outlet />` when access is
 * allowed and a `<Navigate />` when it is not.
 *
 * Doing it this way — rather than an `if` at the top of every page — means the
 * rule is declared once in the route table and cannot be forgotten when a screen
 * is added. It is the same shape as the Flutter router's redirect.
 */

/** Everything behind the sign-in wall. */
export function RequireAuth() {
  const { status } = useSession();
  const location = useLocation();

  // Three states, not two. Redirecting while the session is still being restored
  // would bounce a signed-in user to the sign-in screen on every reload — the
  // single most common bug in a hand-written auth guard.
  if (status === 'loading') return <PageSpinner />;

  if (status === 'signed-out') {
    // `state.from` remembers where they were headed, so signing in returns them
    // there instead of dumping them on the home screen. `replace` keeps the
    // guarded URL out of the history, so Back does not bounce off it again.
    return <Navigate to={routes.signIn} replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

/** The mirror image: keeps a signed-in user off the sign-in and sign-up pages. */
export function RequireGuest() {
  const { status } = useSession();

  if (status === 'loading') return <PageSpinner />;
  if (status !== 'signed-out') return <Navigate to={routes.home} replace />;

  return <Outlet />;
}

/**
 * Screens that read a doctor's records.
 *
 * A secretary whose links were all revoked is signed in and has nothing to
 * work on: every query would be scoped to a doctor that is not there. Rather
 * than let each page handle a null owner, this states the situation once and
 * keeps Ajustes reachable so she is not stuck on a dead screen.
 */
export function RequireActiveDoctor() {
  const { hasNoDoctor } = useSession();

  if (hasNoDoctor) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-24 text-center">
        <h1 className="font-display text-xl font-bold">Nenhum médico vinculado</h1>
        <p className="text-on-surface-variant text-sm">
          Sua conta ainda não está vinculada a nenhum médico, ou o acesso foi revogado. Peça um novo
          convite para começar.
        </p>
      </div>
    );
  }

  return <Outlet />;
}

/**
 * Doctor-only screens (reports, secretaries, availability).
 *
 * The sidebar already hides these links, so reaching this guard means a typed
 * URL or an old bookmark. It sends the user home rather than showing a refusal:
 * the screen is not *forbidden* to them so much as not part of their job, and
 * the data behind it is unreachable regardless — RLS answers a secretary's query
 * for finances with nothing.
 */
export function RequireDoctor() {
  const { role } = useSession();
  if (role !== 'doctor') return <Navigate to={routes.home} replace />;
  return <Outlet />;
}
