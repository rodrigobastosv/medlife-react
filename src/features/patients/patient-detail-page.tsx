import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';

import { useSession } from '@/app/providers/session-context';
import { useToast } from '@/app/providers/toast-context';
import { routes } from '@/app/routing/routes';
import { messageOf } from '@/core/errors';
import { ageFromBirthDate, formatCurrency, formatDate } from '@/core/format';
import { appointmentAmount, type Appointment } from '@/domain/appointments/appointment';
import type { Patient } from '@/domain/patients/patient';
import { patientOriginLabel } from '@/domain/patients/patient-origin';
import { AppointmentTile } from '@/features/appointments/appointment-tile';
import { usePatientAppointmentsQuery } from '@/features/appointments/use-appointments';
import { BackLink } from '@/features/navigation/back-link';
import { PatientContactActions } from '@/features/patients/patient-contact-actions';
import { useDeletePatientMutation, usePatientQuery } from '@/features/patients/use-patients';
import { Button } from '@/design-system/components/button';
import { buttonClasses } from '@/design-system/components/button-classes';
import { Card, CardTitle } from '@/design-system/components/card';
import { ConfirmDialog } from '@/design-system/components/confirm-dialog';
import { EmptyState } from '@/design-system/components/empty-state';
import { CalendarIcon, EditIcon, PlusIcon, TrashIcon } from '@/design-system/components/icons';
import { Page, PageHeader, Section } from '@/design-system/components/page';
import { SkeletonList } from '@/design-system/components/skeleton';
import { PageSpinner } from '@/design-system/components/spinner';
import { Tag } from '@/design-system/components/tag';

/**
 * A patient's record: their details, their appointment history, and the totals.
 *
 * The route is `/patients/:patientId`, so this page survives a reload and can be
 * bookmarked or shared — the reason the id lives in the URL rather than in
 * navigation state.
 */
export function PatientDetailPage() {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { canSeeFinances } = useSession();
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const patient = usePatientQuery(patientId ?? '');
  const appointments = usePatientAppointmentsQuery(patientId ?? '');
  const deleteMutation = useDeletePatientMutation();

  // A missing param means the route was reached with a malformed URL. Rendering
  // a redirect is cleaner than throwing: the user lands somewhere useful.
  if (patientId === undefined) return <Navigate to={routes.patients} replace />;

  if (patient.isPending) return <PageSpinner />;

  if (patient.isError) {
    return (
      <Page>
        <PageHeader title="Paciente" back={<BackLink to={routes.patients} />} />
        <EmptyState
          title="Não foi possível carregar"
          message={messageOf(patient.error)}
          actionLabel="Tentar de novo"
          onAction={() => void patient.refetch()}
        />
      </Page>
    );
  }

  const record = patient.data;
  const history = appointments.data ?? [];
  const revenue = history.reduce((sum, appointment) => sum + appointmentAmount(appointment), 0);

  return (
    <Page>
      <PageHeader
        title={record.fullName}
        back={<BackLink to={routes.patients} />}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Tag tone="neutral">{patientOriginLabel[record.origin]}</Tag>
            {record.birthDate !== null && (
              <span>
                {formatDate(record.birthDate)} · {ageFromBirthDate(record.birthDate)} anos
              </span>
            )}
          </span>
        }
        actions={
          <>
            {/* First, and before the edit/delete pair: on this screen the thing
                somebody came to do is usually call the patient, not change the
                record. It disappears entirely when there is no usable number. */}
            <PatientContactActions phone={record.phone} patientName={record.fullName} />
            <Link
              to={routes.editPatient(record.id)}
              className={buttonClasses({ variant: 'outline', size: 'sm', className: 'gap-1.5' })}
            >
              <EditIcon className="size-4" />
              Editar
            </Link>
            <Button
              variant="ghost"
              size="sm"
              icon={<TrashIcon className="size-4" />}
              onClick={() => setIsConfirmingDelete(true)}
            >
              Excluir
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-8">
        <PatientDetailsCard patient={record} />

        <Section
          title="Consultas"
          actions={
            <Link
              to={routes.newAppointment(record.id)}
              className={buttonClasses({ size: 'sm', className: 'gap-1.5' })}
            >
              <PlusIcon className="size-4" />
              Nova consulta
            </Link>
          }
        >
          {/* The totals are computed from the history already on screen rather
              than asked of the server: the rows are here, and a second query for
              a sum would be a round trip to recompute what the client can add
              up. Only a doctor sees them — a secretary's `finance` is filtered
              away by RLS, so her total would silently be zero. */}
          {canSeeFinances && history.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              <SummaryTile label="Consultas" value={String(history.length)} />
              <SummaryTile label="Total recebido" value={formatCurrency(revenue)} />
            </div>
          )}

          <AppointmentHistory
            isPending={appointments.isPending}
            error={appointments.error}
            appointments={history}
            patientId={record.id}
          />
        </Section>
      </div>

      <ConfirmDialog
        open={isConfirmingDelete}
        title="Excluir paciente"
        message={`Excluir ${record.fullName} apaga também todas as consultas registradas. Não dá para desfazer.`}
        isPending={deleteMutation.isPending}
        onCancel={() => setIsConfirmingDelete(false)}
        onConfirm={() =>
          deleteMutation.mutate(record.id, {
            onSuccess: () => {
              showToast({ tone: 'success', message: 'Paciente excluído' });
              void navigate(routes.patients, { replace: true });
            },
            onError: (error) => {
              setIsConfirmingDelete(false);
              showToast({ tone: 'error', message: messageOf(error) });
            },
          })
        }
      />
    </Page>
  );
}

function PatientDetailsCard({ patient }: { patient: Patient }) {
  const entries: { label: string; value: string | null }[] = [
    { label: 'Telefone', value: patient.phone },
    { label: 'CPF', value: patient.cpf },
    { label: 'Endereço', value: patient.address },
    { label: 'Nome na nota', value: patient.invoiceName },
    { label: 'CPF na nota', value: patient.invoiceCpf },
  ];
  const filled = entries.filter((entry) => entry.value !== null && entry.value !== '');

  return (
    <Card className="flex flex-col gap-4">
      <CardTitle>Dados</CardTitle>
      {filled.length === 0 ? (
        <p className="text-on-surface-variant text-sm">Nenhum dado de contato cadastrado.</p>
      ) : (
        // A definition list is the right element for label/value pairs: it says
        // the two are related, where a stack of divs says nothing.
        <dl className="grid gap-4 sm:grid-cols-2">
          {filled.map((entry) => (
            <div key={entry.label}>
              <dt className="text-on-surface-variant text-xs font-semibold uppercase">
                {entry.label}
              </dt>
              <dd className="mt-0.5">{entry.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {patient.notes !== null && patient.notes !== '' && (
        <div>
          <h3 className="text-on-surface-variant text-xs font-semibold uppercase">Observações</h3>
          {/* `whitespace-pre-line` keeps the line breaks the user typed; without
              it a multi-line note collapses into one paragraph. */}
          <p className="mt-1 text-sm whitespace-pre-line">{patient.notes}</p>
        </div>
      )}
    </Card>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <Card className="bg-primary-container text-on-primary-container py-4">
      <span className="font-display block text-xl font-bold">{value}</span>
      <span className="text-sm">{label}</span>
    </Card>
  );
}

function AppointmentHistory({
  isPending,
  error,
  appointments,
  patientId,
}: {
  isPending: boolean;
  error: unknown;
  appointments: readonly Appointment[];
  patientId: string;
}) {
  const navigate = useNavigate();

  if (isPending) return <SkeletonList rows={2} />;
  if (error != null) {
    return <EmptyState title="Não foi possível carregar as consultas" message={messageOf(error)} />;
  }
  if (appointments.length === 0) {
    return (
      <EmptyState
        icon={<CalendarIcon />}
        title="Nenhuma consulta registrada"
        message="Registre a primeira consulta deste paciente."
        actionLabel="Nova consulta"
        onAction={() => void navigate(routes.newAppointment(patientId))}
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {appointments.map((appointment) => (
        <li key={appointment.id}>
          <AppointmentTile
            appointment={appointment}
            to={routes.editAppointment(patientId, appointment.id)}
          />
        </li>
      ))}
    </ul>
  );
}
