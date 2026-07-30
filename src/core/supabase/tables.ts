/**
 * Table names, in one place.
 *
 * Port of `SupabaseTable` from the Flutter app, and worth keeping for the same
 * reason: a typo in `.from('patietns')` is not a compile error, it is a runtime
 * PostgREST 404 that reads like a permissions problem. Going through this object
 * makes the typo fail at build time instead.
 */
export const Table = {
  patients: 'patients',
  appointments: 'appointments',
  appointmentFinances: 'appointment_finances',
  profiles: 'profiles',
  doctorSecretaries: 'doctor_secretaries',
  secretaryInvites: 'secretary_invites',
} as const;

export type TableName = (typeof Table)[keyof typeof Table];
