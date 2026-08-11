import { toDateColumn } from '@/core/format';

/**
 * Every path in the app, in one place. Port of the `AppRoute` enum.
 *
 * Paths are never written as string literals at a call site. The ones that take
 * an argument are **functions**, so a link is built by calling
 * `routes.patient(id)` rather than by interpolating a template that nothing
 * checks. Rename a segment here and every link follows; miss one and it is a
 * compile error, not a 404 someone finds in production.
 *
 * `pattern` holds the `:param` form the router needs to match; the function
 * beside it builds a real URL.
 */
export const routes = {
  home: '/',
  agenda: '/agenda',
  reports: '/reports',
  patients: '/patients',
  newPatient: '/patients/new',
  patient: (patientId: string) => `/patients/${patientId}`,
  editPatient: (patientId: string) => `/patients/${patientId}/edit`,
  /**
   * `on` pre-fills the form's date and `at` its time. They are query parameters
   * rather than path segments because they are optional and not part of the
   * resource's identity: the page addressed is "a new appointment for this
   * patient" either way, and a stripped or malformed `?on=` still lands
   * somewhere sensible.
   *
   * `at` only ever comes from clicking an empty slot on the day timeline, which
   * is why the form is willing to pre-fill a time it otherwise refuses to
   * guess: clicking 10:00 on the axis *is* the user saying 10:00.
   */
  newAppointment: (patientId: string, on?: Date, at?: string) => {
    const base = `/patients/${patientId}/appointments/new`;
    if (on === undefined) return base;
    const date = `${base}?on=${toDateColumn(on)}`;
    return at === undefined ? date : `${date}&at=${at}`;
  },
  editAppointment: (patientId: string, appointmentId: string) =>
    `/patients/${patientId}/appointments/${appointmentId}/edit`,
  secretaries: '/secretaries',
  settings: '/settings',
  availability: '/settings/availability',
  signIn: '/auth/sign-in',
  signUp: '/auth/sign-up',
} as const;

/**
 * The route patterns, for the router's definitions only.
 *
 * Note that the appointment form is addressed by URL rather than by handing the
 * page an object in navigation state. The Flutter app passes its form arguments
 * through go_router's `extra`, which does not survive a page reload — so those
 * routes have to redirect somewhere safe when it is missing. Putting the ids in
 * the path removes the problem instead of handling it: the form reloads, deep
 * links, and can be shared.
 */
export const routePatterns = {
  patient: '/patients/:patientId',
  editPatient: '/patients/:patientId/edit',
  newAppointment: '/patients/:patientId/appointments/new',
  editAppointment: '/patients/:patientId/appointments/:appointmentId/edit',
} as const;
