import { fromDateColumn, toDateColumn } from '@/core/format';
import { toPatientOrigin, type PatientOrigin } from '@/domain/patients/patient-origin';

export interface Patient {
  readonly id: string;
  readonly fullName: string;
  readonly origin: PatientOrigin;
  readonly birthDate: Date | null;
  readonly cpf: string | null;
  readonly phone: string | null;
  readonly address: string | null;
  /** Billing name, when the invoice goes to someone other than the patient. */
  readonly invoiceName: string | null;
  readonly invoiceCpf: string | null;
  readonly notes: string | null;
  readonly createdAt: Date | null;
}

export interface PatientRow {
  id: string;
  full_name: string;
  origin: string | null;
  birth_date: string | null;
  cpf: string | null;
  phone: string | null;
  address: string | null;
  invoice_name: string | null;
  invoice_cpf: string | null;
  notes: string | null;
  created_at: string | null;
}

export function toPatient(row: PatientRow): Patient {
  return {
    id: row.id,
    fullName: row.full_name,
    origin: toPatientOrigin(row.origin),
    birthDate: row.birth_date === null ? null : fromDateColumn(row.birth_date),
    cpf: row.cpf,
    phone: row.phone,
    address: row.address,
    invoiceName: row.invoice_name,
    invoiceCpf: row.invoice_cpf,
    notes: row.notes,
    createdAt: row.created_at === null ? null : fromDateColumn(row.created_at),
  };
}

/** "Ana Maria Souza" → "AS". Falls back to "?" so an avatar is never blank. */
export function patientInitials(patient: Patient): string {
  const parts = patient.fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  const last = parts[parts.length - 1];
  if (first === undefined) return '?';
  if (parts.length === 1) return first[0]!.toUpperCase();
  return `${first[0]!}${last![0]!}`.toUpperCase();
}

/* ------------------------------------------------------------------------- */
/* Draft — what a form produces                                              */
/* ------------------------------------------------------------------------- */

/**
 * The write side of a patient: what the create/edit form collects, without an
 * `id` and without server-owned fields.
 *
 * Keeping it separate from `Patient` is what stops a component from "editing"
 * `createdAt`, and it lets the form model an empty text box as `''` while the
 * entity models an absent value as `null`.
 */
export interface PatientDraft {
  fullName: string;
  origin: PatientOrigin;
  birthDate: Date | null;
  cpf: string;
  phone: string;
  address: string;
  invoiceName: string;
  invoiceCpf: string;
  notes: string;
}

/** The columns half of an insert/update. `owner_id` is added by the repository. */
export function patientDraftToColumns(draft: PatientDraft) {
  return {
    full_name: draft.fullName.trim(),
    origin: draft.origin,
    birth_date: draft.birthDate === null ? null : toDateColumn(draft.birthDate),
    cpf: emptyToNull(draft.cpf),
    phone: emptyToNull(draft.phone),
    address: emptyToNull(draft.address),
    invoice_name: emptyToNull(draft.invoiceName),
    invoice_cpf: emptyToNull(draft.invoiceCpf),
    notes: emptyToNull(draft.notes),
  };
}

export function patientToDraft(patient: Patient): PatientDraft {
  return {
    fullName: patient.fullName,
    origin: patient.origin,
    birthDate: patient.birthDate,
    cpf: patient.cpf ?? '',
    phone: patient.phone ?? '',
    address: patient.address ?? '',
    invoiceName: patient.invoiceName ?? '',
    invoiceCpf: patient.invoiceCpf ?? '',
    notes: patient.notes ?? '',
  };
}

/**
 * An untouched text input yields `''`, and `''` stored in a nullable column is
 * not the same as "no value": it defeats `is null` filters and prints as an
 * empty line in the UI. Normalising here means no call site has to remember.
 */
function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
