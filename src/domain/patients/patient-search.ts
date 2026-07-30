import type { Patient } from '@/domain/patients/patient';

/**
 * Free-text search over a patient's name, CPF and phone.
 *
 * It lives in the domain because two screens now search the same register — the
 * patients list and the picker that schedules an appointment from the agenda —
 * and "what counts as a match" is a rule about patients, not about either
 * screen. Two copies would be free to drift, and the one nobody is looking at
 * would be the one that stops finding accented names.
 *
 * `normalize` strips accents (via Unicode decomposition, which splits "á" into
 * "a" + a combining mark that the regex then removes) so "Jose" finds "José" —
 * without it a search for an accented name only works if the user types the
 * accent, which nobody does. Digits are stripped from CPF and phone so "11987"
 * matches "(11) 98765-4321".
 */
export function searchPatients(patients: readonly Patient[], search: string): Patient[] {
  const term = normalize(search);
  if (term === '') return [...patients];

  const digits = term.replace(/\D/g, '');

  return patients.filter((patient) => {
    if (normalize(patient.fullName).includes(term)) return true;
    if (digits === '') return false;
    return (
      (patient.cpf ?? '').replace(/\D/g, '').includes(digits) ||
      (patient.phone ?? '').replace(/\D/g, '').includes(digits)
    );
  });
}

const normalize = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
