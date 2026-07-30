import { Link } from 'react-router-dom';

import { routes } from '@/app/routing/routes';
import { formatCurrency, formatDate } from '@/core/format';
import {
  appointmentStatusLabel,
  appointmentTypeLabel,
  appointmentLocationLabel,
  invoiceStatusLabel,
  isInvoicePending,
  type AppointmentStatus,
} from '@/domain/appointments/appointment-enums';
import { paymentLabel, type Appointment } from '@/domain/appointments/appointment';
import { Tag, type TagTone } from '@/design-system/components/tag';

/**
 * One appointment as a row. Used by the home screen, the agenda and the patient
 * history — the three places an appointment is listed.
 *
 * The finance line is rendered from `finance !== null`, which is `null` in two
 * different situations: nothing was recorded, or the reader is a secretary and
 * row-level security filtered it away. Both should render the same thing here
 * (nothing), so this component does not need to know which — that distinction
 * only matters to the *form*, which asks the session for the role.
 */
export function AppointmentTile({
  appointment,
  showPatientName = false,
  /**
   * Where the row leads. Defaults to the patient's record, which is what the
   * home screen wants; the patient's own history overrides it to open the
   * appointment for editing. The caller decides, because the same row means
   * "who is this?" in one place and "change this" in another — and wrapping the
   * tile in an outer `<Link>` is not an option: nested anchors are invalid HTML
   * and browsers resolve them unpredictably.
   */
  to,
}: {
  appointment: Appointment;
  showPatientName?: boolean;
  to?: string;
}) {
  const { finance } = appointment;

  return (
    <Link
      to={to ?? routes.patient(appointment.patientId)}
      className="bg-surface-container-low border-outline/70 hover:bg-surface-container-high flex flex-col gap-2 rounded-l border p-4 transition-colors"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">
          {showPatientName ? (appointment.patientName ?? 'Paciente') : formatDateTime(appointment)}
        </span>
        <Tag tone={statusTone[appointment.status]}>
          {appointmentStatusLabel[appointment.status]}
        </Tag>
      </div>

      <div className="text-on-surface-variant flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        {showPatientName && <span>{formatDateTime(appointment)}</span>}
        <span aria-hidden>·</span>
        <span>{appointmentTypeLabel[appointment.type]}</span>
        <span aria-hidden>·</span>
        <span>{appointmentLocationLabel[appointment.location]}</span>
      </div>

      {finance !== null && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="nums font-semibold">{formatCurrency(finance.amount)}</span>
          <span className="text-on-surface-variant">{paymentLabel(finance)}</span>
          {finance.invoiceStatus !== 'none' && (
            <Tag tone={isInvoicePending(finance.invoiceStatus) ? 'warning' : 'success'}>
              {invoiceStatusLabel[finance.invoiceStatus]}
            </Tag>
          )}
        </div>
      )}

      {(appointment.nextReturnDate !== null || appointment.recallDate !== null) && (
        <div className="flex flex-wrap gap-2">
          {appointment.nextReturnDate !== null && (
            <Tag tone="primary">Retorno em {formatDate(appointment.nextReturnDate)}</Tag>
          )}
          {appointment.recallDate !== null && (
            <Tag tone="neutral">Recall em {formatDate(appointment.recallDate)}</Tag>
          )}
        </div>
      )}
    </Link>
  );
}

/**
 * "14/07/2026 · 09:30", or just the date on an appointment recorded before the
 * time column existed. No placeholder for the missing time: a row of dashes in
 * a list says nothing, and the form asks for one the moment it is edited.
 */
const formatDateTime = (appointment: Appointment): string =>
  appointment.scheduledTime === null
    ? formatDate(appointment.scheduledDate)
    : `${formatDate(appointment.scheduledDate)} · ${appointment.scheduledTime}`;

const statusTone: Record<AppointmentStatus, TagTone> = {
  scheduled: 'primary',
  completed: 'success',
  cancelled: 'error',
  no_show: 'warning',
};
