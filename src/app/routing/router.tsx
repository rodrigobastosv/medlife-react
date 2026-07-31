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
import { AgendaPage } from '@/features/agenda/agenda-page';
import { AppointmentFormPage } from '@/features/appointments/appointment-form-page';
import { SignInPage } from '@/features/auth/sign-in-page';
import { SignUpPage } from '@/features/auth/sign-up-page';
import { HomePage } from '@/features/home/home-page';
import { PatientDetailPage } from '@/features/patients/patient-detail-page';
import { PatientFormPage } from '@/features/patients/patient-form-page';
import { PatientsPage } from '@/features/patients/patients-page';
import { ReportsPage } from '@/features/reports/reports-page';
import { SecretariesPage } from '@/features/secretaries/secretaries-page';
import { SettingsPage } from '@/features/settings/settings-page';

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
 */
export const router = createBrowserRouter([
  {
    element: <RequireGuest />,
    errorElement: <GuestRouteErrorPage />,
    children: [
      { path: routes.signIn, element: <SignInPage /> },
      { path: routes.signUp, element: <SignUpPage /> },
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
              { path: routes.settings, element: <SettingsPage /> },
              {
                element: <RequireActiveDoctor />,
                children: [
                  { path: routes.home, element: <HomePage /> },
                  { path: routes.agenda, element: <AgendaPage /> },
                  { path: routes.patients, element: <PatientsPage /> },
                  // `/patients/new` is declared before `/patients/:patientId`
                  // for readability only — React Router ranks by specificity,
                  // not by order, so a static segment already wins over a
                  // dynamic one.
                  { path: routes.newPatient, element: <PatientFormPage /> },
                  { path: routePatterns.patient, element: <PatientDetailPage /> },
                  { path: routePatterns.editPatient, element: <PatientFormPage /> },
                  { path: routePatterns.newAppointment, element: <AppointmentFormPage /> },
                  { path: routePatterns.editAppointment, element: <AppointmentFormPage /> },
                ],
              },
              {
                element: <RequireDoctor />,
                children: [
                  { path: routes.reports, element: <ReportsPage /> },
                  { path: routes.secretaries, element: <SecretariesPage /> },
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
