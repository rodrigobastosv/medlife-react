import { createBrowserRouter } from 'react-router-dom';

import { AppShell } from '@/app/layout/app-shell';
import { NotFoundPage } from '@/app/routing/not-found-page';
import {
  RequireActiveDoctor,
  RequireAuth,
  RequireDoctor,
  RequireGuest,
} from '@/app/routing/guards';
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
 */
export const router = createBrowserRouter([
  {
    element: <RequireGuest />,
    children: [
      { path: routes.signIn, element: <SignInPage /> },
      { path: routes.signUp, element: <SignUpPage /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        // The shell renders the sidebar and an <Outlet /> for the page, so the
        // navigation is mounted once and does not re-render on every route
        // change — which is also what preserves its scroll position.
        element: <AppShell />,
        children: [
          // Ajustes fica fora do RequireActiveDoctor de propósito, e é a única
          // rota do shell que fica. É a tela que tem o botão Sair: dentro do
          // guard, uma secretária sem vínculo ativo via a mensagem de "nenhum
          // médico vinculado" em *todas* as telas, inclusive nesta, e não tinha
          // como sair da conta pela interface — só limpando o localStorage.
          //
          // A página aguenta a situação: `canSwitchDoctor` é falso com a lista
          // de médicos vazia, então o card de médico ativo simplesmente não
          // aparece, e nada mais aqui depende de um owner.
          { path: routes.settings, element: <SettingsPage /> },
          {
            element: <RequireActiveDoctor />,
            children: [
              { path: routes.home, element: <HomePage /> },
              { path: routes.agenda, element: <AgendaPage /> },
              { path: routes.patients, element: <PatientsPage /> },
              // `/patients/new` is declared before `/patients/:patientId` for
              // readability only — React Router ranks by specificity, not by
              // order, so a static segment already wins over a dynamic one.
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
  { path: '*', element: <NotFoundPage /> },
]);
