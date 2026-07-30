/** How the patient found the doctor (the spreadsheet's ORIGEM column). */
export const PATIENT_ORIGINS = [
  'networking',
  'patient',
  'insurance',
  'colleague',
  'doctoralia',
  'google',
  'plan',
  'clinic',
  'other',
] as const;

export type PatientOrigin = (typeof PATIENT_ORIGINS)[number];

/**
 * Labels live next to the type, not inside the components that render them —
 * so "Convênio" is spelled once for the list, the form and the detail page.
 * `Record` makes the map exhaustive: add an origin above and this stops
 * compiling until it has a label.
 */
export const patientOriginLabel: Record<PatientOrigin, string> = {
  networking: 'Networking',
  patient: 'Indicação de paciente',
  insurance: 'Convênio',
  colleague: 'Colega',
  doctoralia: 'Doctoralia',
  google: 'Google',
  plan: 'Plano',
  clinic: 'Clínica',
  other: 'Outra',
};

export function toPatientOrigin(wire: string | null | undefined): PatientOrigin {
  return PATIENT_ORIGINS.includes(wire as PatientOrigin) ? (wire as PatientOrigin) : 'other';
}
