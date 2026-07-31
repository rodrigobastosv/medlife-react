import { fromDateColumn, toDateColumn } from '@/core/format';
import {
  paymentMethodLabel,
  supportsInstallments,
  toAppointmentLocation,
  toAppointmentStatus,
  toAppointmentType,
  toInvoiceStatus,
  toPaymentMethod,
  type AppointmentLocation,
  type AppointmentStatus,
  type AppointmentType,
  type InvoiceStatus,
  type PaymentMethod,
} from '@/domain/appointments/appointment-enums';

/**
 * The money side of an appointment.
 *
 * It lives in its own table (`appointment_finances`) rather than in columns on
 * `appointments`, because Postgres row-level security filters **rows, not
 * columns**. Only by separating them can the database express "the secretary
 * sees the appointment but not the amount".
 *
 * When this is `null` on an `Appointment`, the two cases are indistinguishable
 * from here: either no finance row was ever recorded, or the reader is a
 * secretary and RLS filtered it out. The UI decides what to show from the user's
 * **role**, never from this field being null.
 */
export interface AppointmentFinance {
  readonly amount: number;
  readonly invoiceStatus: InvoiceStatus;
  readonly paymentMethod: PaymentMethod | null;
  readonly paymentInstallments: number | null;
}

export interface Appointment {
  readonly id: string;
  readonly patientId: string;
  readonly scheduledDate: Date;
  /**
   * `HH:mm`, or `null` on an appointment recorded before the column existed.
   *
   * Kept as a string rather than folded into `scheduledDate` because the
   * database keeps them apart: `scheduled_date` is a `date` and this is a
   * `time`. Combining them here would mean splitting them again on every write,
   * and would quietly invent a time — midnight — for every legacy row that has
   * none. The form requires it, so the null is a fact about the past, not a
   * value anyone is still allowed to create.
   */
  readonly scheduledTime: string | null;
  readonly type: AppointmentType;
  readonly location: AppointmentLocation;
  readonly status: AppointmentStatus;
  readonly finance: AppointmentFinance | null;
  /** Only populated when the appointment was loaded with the patient joined. */
  readonly patientName: string | null;
  readonly nextReturnDate: Date | null;
  readonly recallDate: Date | null;
  readonly notes: string | null;
  /** When the row was inserted — what the "nova consulta" notification reads. */
  readonly createdAt: Date;
  /**
   * Who inserted it, from `auth.uid()` at insert time.
   *
   * `null` on every row written before the column existed, and that null is load
   * bearing: it means "unknown", never "the owner". The notification that tells
   * a doctor somebody else booked into their agenda compares this against the
   * owner, so treating unknown as the owner would silence it and treating it as
   * a stranger would announce the entire history at once.
   */
  readonly createdBy: string | null;
}

export interface AppointmentFinanceRow {
  amount: number | null;
  invoice_status: string | null;
  payment_method: string | null;
  payment_installments: number | null;
}

export interface AppointmentRow {
  id: string;
  patient_id: string;
  scheduled_date: string;
  /** Postgres `time` arrives as `HH:mm:ss`; absent on rows written before it. */
  scheduled_time?: string | null;
  type: string | null;
  location: string | null;
  status: string | null;
  next_return_date: string | null;
  recall_date: string | null;
  notes: string | null;
  created_at: string;
  /** Absent on rows written before the column existed. */
  created_by?: string | null;
  /** Present only when the select asked for the embed; `null` when RLS hid it. */
  appointment_finances?: AppointmentFinanceRow | null;
  /** Present only when the select asked for `patients(full_name)`. */
  patients?: { full_name: string | null } | null;
}

export function toAppointment(row: AppointmentRow): Appointment {
  const financeRow = row.appointment_finances ?? null;
  return {
    id: row.id,
    patientId: row.patient_id,
    scheduledDate: fromDateColumn(row.scheduled_date),
    scheduledTime: toTimeOfDay(row.scheduled_time),
    type: toAppointmentType(row.type),
    location: toAppointmentLocation(row.location),
    status: toAppointmentStatus(row.status),
    finance:
      financeRow === null
        ? null
        : {
            amount: financeRow.amount ?? 0,
            invoiceStatus: toInvoiceStatus(financeRow.invoice_status),
            paymentMethod: toPaymentMethod(financeRow.payment_method),
            paymentInstallments: financeRow.payment_installments,
          },
    patientName: row.patients?.full_name ?? null,
    nextReturnDate: row.next_return_date === null ? null : fromDateColumn(row.next_return_date),
    recallDate: row.recall_date === null ? null : fromDateColumn(row.recall_date),
    notes: row.notes,
    // Both come for free: every select in the repository is `*`, so these two
    // columns were already crossing the wire and being dropped on the floor.
    createdAt: fromDateColumn(row.created_at),
    createdBy: row.created_by ?? null,
  };
}

/**
 * `HH:mm:ss` (or `HH:mm`) from Postgres, trimmed to the `HH:mm` the UI shows and
 * `<input type="time">` expects.
 *
 * Anything that is not a time is treated as absent rather than passed through:
 * a malformed value would reach the form's `value` attribute, where the browser
 * silently discards it, and the field would look empty while the row still held
 * the bad data.
 */
export function toTimeOfDay(wire: string | null | undefined): string | null {
  if (wire === null || wire === undefined) return null;
  const match = /^(\d{2}):(\d{2})/.exec(wire);
  if (match === null) return null;
  const [, hours, minutes] = match;
  return Number(hours) > 23 || Number(minutes) > 59 ? null : `${hours}:${minutes}`;
}

/** Zero when there is no visible finance row. Convenience for summing. */
export const appointmentAmount = (appointment: Appointment): number =>
  appointment.finance?.amount ?? 0;

/** "Crédito 3x", "Pix", or an em dash when nothing was recorded. */
export function paymentLabel(finance: AppointmentFinance): string {
  const { paymentMethod, paymentInstallments } = finance;
  if (paymentMethod === null) return '—';
  if (supportsInstallments(paymentMethod) && paymentInstallments !== null) {
    return `${paymentMethodLabel[paymentMethod]} ${paymentInstallments}x`;
  }
  return paymentMethodLabel[paymentMethod];
}

/* ------------------------------------------------------------------------- */
/* Draft — what the form produces                                            */
/* ------------------------------------------------------------------------- */

/**
 * `finance` is null when a secretary fills the form: she neither sees nor enters
 * money. The appointment is then saved with no row in `appointment_finances`,
 * and the doctor records the money later.
 */
export interface AppointmentDraft {
  patientId: string;
  scheduledDate: Date;
  /** `HH:mm`. Required by the form, so a draft always carries one. */
  scheduledTime: string;
  type: AppointmentType;
  location: AppointmentLocation;
  status: AppointmentStatus;
  finance: AppointmentFinance | null;
  nextReturnDate: Date | null;
  recallDate: Date | null;
  notes: string;
}

/** Only the clinical columns — the money is written to the other table. */
export function appointmentDraftToColumns(draft: AppointmentDraft) {
  return {
    patient_id: draft.patientId,
    scheduled_date: toDateColumn(draft.scheduledDate),
    scheduled_time: draft.scheduledTime,
    type: draft.type,
    location: draft.location,
    status: draft.status,
    next_return_date: draft.nextReturnDate === null ? null : toDateColumn(draft.nextReturnDate),
    recall_date: draft.recallDate === null ? null : toDateColumn(draft.recallDate),
    notes: draft.notes.trim() === '' ? null : draft.notes.trim(),
  };
}

export function financeToColumns(finance: AppointmentFinance) {
  return {
    amount: finance.amount,
    invoice_status: finance.invoiceStatus,
    payment_method: finance.paymentMethod,
    // Instalments only mean something for credit; storing them for Pix would be
    // a number nothing reads and everything has to explain.
    payment_installments:
      finance.paymentMethod !== null && supportsInstallments(finance.paymentMethod)
        ? finance.paymentInstallments
        : null,
  };
}
