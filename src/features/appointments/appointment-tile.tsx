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
import { PatientContactActions } from '@/features/patients/patient-contact-actions';
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
    // The card is a wrapper around the link rather than being the link, because
    // the contact actions are anchors too and an <a> inside an <a> is invalid
    // HTML that browsers resolve unpredictably. `overflow-hidden` is what lets
    // the inner link keep square corners and still be clipped by the rounded
    // border, so the hover fill reaches the edge without a gap.
    <div className="bg-surface-container-low border-outline/70 flex flex-col overflow-hidden rounded-l border">
      <Link
        to={to ?? routes.patient(appointment.patientId)}
        className="hover:bg-surface-container-high flex flex-col gap-2 p-4 transition-colors"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold">
            {showPatientName
              ? (appointment.patientName ?? 'Paciente')
              : formatDateTime(appointment)}
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

        {(appointment.nextReturnDate !== null ||
          appointment.recallDate !== null ||
          appointment.followUpDate !== null) && (
          <div className="flex flex-wrap gap-2">
            {appointment.nextReturnDate !== null && (
              <Tag tone="primary">Retorno em {formatDate(appointment.nextReturnDate)}</Tag>
            )}
            {appointment.recallDate !== null && (
              <Tag tone="neutral">Recall em {formatDate(appointment.recallDate)}</Tag>
            )}
            {appointment.followUpDate !== null && (
              // The hour is appended only when there is one, rather than shown
              // as "00:00" or an em dash: a follow-up with just a day is a
              // complete instruction, and padding it would invent a precision
              // the doctor did not ask for.
              <Tag tone="warning">
                Acompanhamento em {formatDate(appointment.followUpDate)}
                {appointment.followUpTime === null ? '' : ` às ${appointment.followUpTime}`}
              </Tag>
            )}
          </div>
        )}
      </Link>

      {/* Below the link, in its own bar: the row is "open this appointment" and
          these two are "reach this patient" — two different destinations, so
          they must not share one hit area. The phone is only on the appointment
          when the listing joined the patient, so on a screen that did not (the
          patient's own history, where the number is already in the header) this
          renders nothing and the card is exactly what it was. */}
      <PatientContactActions
        phone={appointment.patientPhone}
        patientName={appointment.patientName}
        className="border-outline/70 border-t px-4 py-2"
      />
    </div>
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
