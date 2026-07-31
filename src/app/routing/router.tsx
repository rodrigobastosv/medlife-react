import { createBrowserRouter } from 'react-router-dom';

import { AppShell } from '@/app/layout/app-shell';
import { NotFoundPage } from '@/app/routing/not-found-page';
import {
  RequireActiveDoctor,
  RequireAuth,
  RequireDoctor,
  RequireGuest,
} from '@/app/routing/guards';
import { GuestRouteErrorPage, RouteErrorPage } from '@/app/routing/route-error-page';
import { routePatterns, routes } from '@/app/routing/routes';
import { PageSpinner } from '@/design-system/components/spinner';

/**
 * The route table. Port of `AppRouter._routes`.
 *
 * Guards are **layout routes** — a route with no path of its own whose only job
 * is to wrap its children. Reading the nesting top to bottom gives the access
 * rules of the whole app on one screen:
 *
 *   RequireGuest    → sign-in, sign-up
 *   RequireAuth     → AppShell → Ajustes (sem guard: é por onde se sai)
 *                                RequireActiveDoctor → the working screens
 *                                RequireDoctor       → reports, secretaries
 *
 * A screen added under the wrong parent is a visible mistake here, where a
 * missing `if` at the top of a page component is not.
 *
 * The `errorElement`s follow the same idea, and are left out of the sketch above
 * because they are not access rules: declared here, they cover every screen
 * underneath at once, and a new page inherits the fallback without having to
 * remember it. See `route-error-page.tsx` for what they do and do not catch.
 *
 * ## Why the pages arrive by `lazy`
 *
 * Every screen used to be a static import, so the bundle was one 775 KB chunk
 * and someone who only ever reaches the sign-in form still downloaded the
 * appointment form, the report screen and Zod. `lazy` turns each page into its
 * own chunk, fetched on the navigation that first needs it: the entry is now
 * 608 KB (179 KB gzip), and Ajustes or a patient list costs roughly 5–13 KB
 * more rather than the whole app.
 *
 * **Every** leaf page is lazy, not a chosen few, and that is a measured result
 * rather than a preference. Splitting only the expensive-looking screens — the
 * report, the appointment form, the two auth pages — moved 16 KB, because Zod
 * is imported by *five* forms and Rolldown keeps a module in the entry chunk
 * for as long as one eager route still reaches it. One eager form is enough to
 * hold 90 KB of schema compiler on the sign-in screen's critical path. The
 * pages that looked too small to bother with were measured too, by making each
 * one eager again: the cheapest of them, the report screen, still holds 15 KB
 * out of the entry, because a page drags its query hooks and repository along
 * with it. None came near the point where the extra request stops paying.
 *
 * Three things are deliberately **not** lazy:
 *
 * - **The guards.** They are what decides where you go; deferring them would
 *   put a network round-trip in front of every navigation *decision*, including
 *   the redirect away from a page whose chunk then turns out to be useless.
 * - **`AppShell`.** It renders on every authenticated screen, so splitting it
 *   only moves bytes from the entry chunk to a chunk that is always fetched
 *   immediately afterwards — the same total, one more request.
 * - **`NotFoundPage`.** A few hundred bytes, and it is the one screen that has
 *   to render when the URL is wrong, which is exactly when a chunk fetch is
 *   most likely to 404 as well.
 *
 * `HydrateFallback` below is the counterpart to that. React Router resolves a
 * route's `lazy` before it renders the route, so a `<Suspense>` boundary never
 * sees anything to wait on — the state to cover is the router's own
 * uninitialised one, when the app is *booted* straight onto a lazy route. With
 * no fallback declared React Router renders `null` there and warns about it,
 * which reads as a blank page for as long as the chunk takes. Declaring it on
 * the two top-level layout routes covers everything nested under them, and
 * `PageSpinner` is what those screens show while their first query resolves
 * anyway, so the boot sequence looks like one wait rather than two.
 */

// `/patients/new` and `/patients/:id/edit` are the same screen, and so are the
// two appointment-form routes. Sharing one loader per component keeps the two
// routes pointing at a single chunk instead of asking Rolldown to notice they
// are the same import.
const patientForm = () =>
  import('@/features/patients/patient-form-page').then((m) => ({ Component: m.PatientFormPage }));

const appointmentForm = () =>
  import('@/features/appointments/appointment-form-page').then((m) => ({
    Component: m.AppointmentFormPage,
  }));

export const router = createBrowserRouter([
  {
    element: <RequireGuest />,
    errorElement: <GuestRouteErrorPage />,
    HydrateFallback: PageSpinner,
    children: [
      {
        path: routes.signIn,
        lazy: () =>
          import('@/features/auth/sign-in-page').then((m) => ({ Component: m.SignInPage })),
      },
      {
        path: routes.signUp,
        lazy: () =>
          import('@/features/auth/sign-up-page').then((m) => ({ Component: m.SignUpPage })),
      },
    ],
  },
  {
    element: <RequireAuth />,
    // The outer of the two boundaries, and the one that should never fire: it
    // catches the guard and the shell themselves, which is the only failure the
    // inner one cannot see. Without it, a sidebar that throws falls through to
    // React Router's built-in error page — an English stack trace on a white
    // background.
    errorElement: <RouteErrorPage />,
    HydrateFallback: PageSpinner,
    children: [
      {
        // The shell renders the sidebar and an <Outlet /> for the page, so the
        // navigation is mounted once and does not re-render on every route
        // change — which is also what preserves its scroll position.
        element: <AppShell />,
        children: [
          {
            // A layout route with no element of its own — React Router renders
            // an `<Outlet />` when a route omits one — whose entire purpose is
            // to own the error boundary one level *below* the shell.
            //
            // Placing it here rather than on the shell route is what keeps the
            // navigation on screen when a page throws. A boundary replaces the
            // element of the route that declares it, so an `errorElement` on the
            // shell would take the sidebar down with the page and leave the user
            // stranded on a dead end with one link out. Declared here, the shell
            // is rendered by an ancestor of the boundary and survives untouched:
            // the fallback appears in the content area, and Agenda, Pacientes
            // and Ajustes are still one click away.
            errorElement: <RouteErrorPage />,
            children: [
              // Ajustes fica fora do RequireActiveDoctor de propósito, e é a
              // única rota do shell que fica. É a tela que tem o botão Sair:
              // dentro do guard, uma secretária sem vínculo ativo via a mensagem
              // de "nenhum médico vinculado" em *todas* as telas, inclusive
              // nesta, e não tinha como sair da conta pela interface — só
              // limpando o localStorage.
              //
              // A página aguenta a situação: `canSwitchDoctor` é falso com a
              // lista de médicos vazia, então o card de médico ativo
              // simplesmente não aparece, e nada mais aqui depende de um owner.
              {
                path: routes.settings,
                lazy: () =>
                  import('@/features/settings/settings-page').then((m) => ({
                    Component: m.SettingsPage,
                  })),
              },
              {
                element: <RequireActiveDoctor />,
                children: [
                  {
                    path: routes.home,
                    lazy: () =>
                      import('@/features/home/home-page').then((m) => ({ Component: m.HomePage })),
                  },
                  {
                    path: routes.agenda,
                    lazy: () =>
                      import('@/features/agenda/agenda-page').then((m) => ({
                        Component: m.AgendaPage,
                      })),
                  },
                  {
                    path: routes.patients,
                    lazy: () =>
                      import('@/features/patients/patients-page').then((m) => ({
                        Component: m.PatientsPage,
                      })),
                  },
                  // `/patients/new` is declared before `/patients/:patientId`
                  // for readability only — React Router ranks by specificity,
                  // not by order, so a static segment already wins over a
                  // dynamic one.
                  { path: routes.newPatient, lazy: patientForm },
                  {
                    path: routePatterns.patient,
                    lazy: () =>
                      import('@/features/patients/patient-detail-page').then((m) => ({
                        Component: m.PatientDetailPage,
                      })),
                  },
                  { path: routePatterns.editPatient, lazy: patientForm },
                  { path: routePatterns.newAppointment, lazy: appointmentForm },
                  { path: routePatterns.editAppointment, lazy: appointmentForm },
                ],
              },
              {
                element: <RequireDoctor />,
                children: [
                  {
                    path: routes.reports,
                    lazy: () =>
                      import('@/features/reports/reports-page').then((m) => ({
                        Component: m.ReportsPage,
                      })),
                  },
                  {
                    path: routes.secretaries,
                    lazy: () =>
                      import('@/features/secretaries/secretaries-page').then((m) => ({
                        Component: m.SecretariesPage,
                      })),
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
