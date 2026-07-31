import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { z } from 'zod';

import { useSession } from '@/app/providers/session-context';
import { useToast } from '@/app/providers/toast-context';
import { routes } from '@/app/routing/routes';
import { messageOf } from '@/core/errors';
import { dateOnly, fromDateColumn, toDateColumn } from '@/core/format';
import type { Appointment, AppointmentDraft } from '@/domain/appointments/appointment';
import {
  APPOINTMENT_LOCATIONS,
  APPOINTMENT_STATUSES,
  APPOINTMENT_TYPES,
  INVOICE_STATUSES,
  PAYMENT_METHODS,
  appointmentLocationLabel,
  appointmentStatusLabel,
  appointmentTypeLabel,
  invoiceStatusLabel,
  paymentMethodLabel,
  supportsInstallments,
} from '@/domain/appointments/appointment-enums';
import {
  useDeleteAppointmentMutation,
  usePatientAppointmentsQuery,
  useSaveAppointmentMutation,
} from '@/features/appointments/use-appointments';
import { BackLink } from '@/features/navigation/back-link';
import { UnsavedChangesDialog } from '@/features/navigation/unsaved-changes-dialog';
import { useUnsavedChangesGuard } from '@/features/navigation/use-unsaved-changes-guard';
import { usePatientQuery } from '@/features/patients/use-patients';
import { Button } from '@/design-system/components/button';
import { Card, CardTitle } from '@/design-system/components/card';
import { ConfirmDialog } from '@/design-system/components/confirm-dialog';
import { SelectField, TextAreaField, TextField } from '@/design-system/components/form-fields';
import { Page, PageHeader } from '@/design-system/components/page';
import { PageSpinner } from '@/design-system/components/spinner';

/**
 * Dates and the money are strings in the form and typed values in the domain.
 *
 * `amount` is a string because `<input type="number">` reports `''` for an empty
 * field, and coercing that to `0` while the user is mid-edit makes the field
 * fight back as they type. It is converted once, at submit.
 */
const schema = z.object({
  scheduledDate: z.string().min(1, 'Informe a data da consulta'),
  // Required, and that is the point of the change: an appointment without a
  // time is what stopped the app from being able to warn anyone about the day.
  scheduledTime: z.string().min(1, 'Informe o horário da consulta'),
  type: z.enum(APPOINTMENT_TYPES),
  location: z.enum(APPOINTMENT_LOCATIONS),
  status: z.enum(APPOINTMENT_STATUSES),
  nextReturnDate: z.string(),
  recallDate: z.string(),
  notes: z.string(),
  amount: z.string(),
  paymentMethod: z.string(),
  paymentInstallments: z.string(),
  invoiceStatus: z.enum(INVOICE_STATUSES),
});

type AppointmentForm = z.infer<typeof schema>;

export function AppointmentFormPage() {
  const { patientId, appointmentId } = useParams();
  const [searchParams] = useSearchParams();
  const patient = usePatientQuery(patientId ?? '');

  // Editing reads the appointment out of the patient's history, which the
  // detail page has almost always already loaded — so opening the form is
  // usually instant and costs no request. Arriving by a direct URL simply
  // fetches the list first.
  const appointments = usePatientAppointmentsQuery(patientId ?? '');

  if (patientId === undefined) return <Navigate to={routes.patients} replace />;
  if (patient.isPending || (appointmentId !== undefined && appointments.isPending)) {
    return <PageSpinner />;
  }

  const existing =
    appointmentId === undefined
      ? undefined
      : appointments.data?.find((appointment) => appointment.id === appointmentId);

  // An id that matches nothing means a deleted appointment or a bad link. There
  // is nothing to edit, so the record is the honest place to land.
  if (appointmentId !== undefined && existing === undefined) {
    return <Navigate to={routes.patient(patientId)} replace />;
  }

  return (
    <AppointmentFormView
      patientId={patientId}
      patientName={patient.data?.fullName ?? 'Paciente'}
      appointment={existing}
      // Only meaningful when creating: an existing appointment carries its own
      // date, and a `?on=` left in the URL must not overwrite it.
      initialDate={existing === undefined ? parseDateParam(searchParams.get('on')) : undefined}
    />
  );
}

/**
 * The `?on=yyyy-MM-dd` the agenda schedules with, or `undefined` if it is
 * missing or not a real date.
 *
 * A query parameter is user-editable, so it is treated as untrusted input: the
 * shape is checked before parsing, and `getTime()` catches the values that pass
 * the regex but are not days — `2026-02-31` rolls over in `Date` rather than
 * failing. Anything rejected falls through to the normal default of today,
 * which is why nothing here reports an error: a broken link should still open a
 * usable form.
 */
function parseDateParam(value: string | null): Date | undefined {
  if (value === null || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = fromDateColumn(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return toDateColumn(date) === value ? date : undefined;
}

function AppointmentFormView({
  patientId,
  patientName,
  appointment,
  initialDate,
}: {
  patientId: string;
  patientName: string;
  appointment: Appointment | undefined;
  initialDate: Date | undefined;
}) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { canSeeFinances } = useSession();
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const saveMutation = useSaveAppointmentMutation(appointment?.id ?? null);
  const deleteMutation = useDeleteAppointmentMutation();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isDirty },
  } = useForm<AppointmentForm>({
    resolver: zodResolver(schema),
    defaultValues: toFormValues(appointment, initialDate),
  });

  // Subscribing to `isDirty` costs one extra render of the form, and only one:
  // it flips on the first edit and then stays true. That is a different thing
  // from `watch()`, which would re-render on every keystroke.
  const unsavedChanges = useUnsavedChangesGuard(isDirty);

  // `useWatch` subscribes to a single field, so typing in it re-renders only
  // what depends on it. Reading `watch('paymentMethod')` instead would re-render
  // the entire form on every keystroke in *any* field.
  const paymentMethod = useWatch({ control, name: 'paymentMethod' });
  const showInstallments =
    paymentMethod !== '' && supportsInstallments(paymentMethod as (typeof PAYMENT_METHODS)[number]);

  const onSubmit = handleSubmit((values) => {
    saveMutation.mutate(toDraft(values, { patientId, canSeeFinances }), {
      onSuccess: () => {
        showToast({ tone: 'success', message: 'Consulta salva' });
        // Before the redirect, never after: the form is still dirty as far as
        // react-hook-form is concerned, so without this the guard would ask
        // whether to discard the changes that were just written to the database.
        unsavedChanges.allowNavigation();
        void navigate(routes.patient(patientId), { replace: true });
      },
      onError: (error) => showToast({ tone: 'error', message: messageOf(error) }),
    });
  });

  return (
    <Page>
      <PageHeader
        title={appointment === undefined ? 'Nova consulta' : 'Editar consulta'}
        subtitle={patientName}
        back={<BackLink to={routes.patient(patientId)} />}
        actions={
          appointment !== undefined && (
            <Button variant="ghost" size="sm" onClick={() => setIsConfirmingDelete(true)}>
              Excluir
            </Button>
          )
        }
      />

      <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
        <Card className="grid gap-4 sm:grid-cols-2">
          <CardTitle className="sm:col-span-2">Atendimento</CardTitle>
          <TextField
            label="Data"
            type="date"
            error={errors.scheduledDate?.message}
            {...register('scheduledDate')}
          />
          <TextField
            label="Horário"
            type="time"
            error={errors.scheduledTime?.message}
            hint={
              appointment !== undefined && appointment.scheduledTime === null
                ? 'Esta consulta foi registrada antes do horário existir. Informe um para salvar.'
                : undefined
            }
            {...register('scheduledTime')}
          />
          <SelectField
            label="Tipo"
            options={APPOINTMENT_TYPES.map((value) => ({
              value,
              label: appointmentTypeLabel[value],
            }))}
            {...register('type')}
          />
          <SelectField
            label="Local"
            options={APPOINTMENT_LOCATIONS.map((value) => ({
              value,
              label: appointmentLocationLabel[value],
            }))}
            {...register('location')}
          />
          <SelectField
            label="Situação"
            options={APPOINTMENT_STATUSES.map((value) => ({
              value,
              label: appointmentStatusLabel[value],
            }))}
            {...register('status')}
          />
        </Card>

        <Card className="grid gap-4 sm:grid-cols-2">
          <CardTitle className="sm:col-span-2">Acompanhamento</CardTitle>
          <TextField
            label="Retorno agendado"
            type="date"
            hint="Aparece na agenda e nos próximos retornos."
            {...register('nextReturnDate')}
          />
          <TextField
            label="Recall"
            type="date"
            hint="Data para entrar em contato com o paciente."
            {...register('recallDate')}
          />
          <TextAreaField
            label="Observações"
            containerClassName="sm:col-span-2"
            {...register('notes')}
          />
        </Card>

        {/* The financial block is rendered only for a doctor.
            This is UI, not enforcement: the RLS policy on `appointment_finances`
            is what refuses the row to a secretary, and the repository skips the
            write entirely when the draft carries no finance. Hiding it here just
            keeps her from filling in fields whose values would be discarded. */}
        {canSeeFinances && (
          <Card className="grid gap-4 sm:grid-cols-2">
            <CardTitle className="sm:col-span-2">Financeiro</CardTitle>
            <TextField
              label="Valor (R$)"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              {...register('amount')}
            />
            <SelectField
              label="Forma de pagamento"
              placeholder="Não informado"
              options={PAYMENT_METHODS.map((value) => ({
                value,
                label: paymentMethodLabel[value],
              }))}
              {...register('paymentMethod')}
            />
            {showInstallments && (
              <TextField
                label="Parcelas"
                type="number"
                min="1"
                max="12"
                {...register('paymentInstallments')}
              />
            )}
            <SelectField
              label="Nota / recibo"
              options={INVOICE_STATUSES.map((value) => ({
                value,
                label: invoiceStatusLabel[value],
              }))}
              {...register('invoiceStatus')}
            />
          </Card>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => void navigate(routes.patient(patientId))}>
            Cancelar
          </Button>
          <Button type="submit" isLoading={saveMutation.isPending}>
            Salvar
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={isConfirmingDelete}
        title="Excluir consulta"
        message="A consulta e seu financeiro serão removidos. Não dá para desfazer."
        isPending={deleteMutation.isPending}
        onCancel={() => setIsConfirmingDelete(false)}
        onConfirm={() => {
          if (appointment === undefined) return;
          deleteMutation.mutate(appointment.id, {
            onSuccess: () => {
              showToast({ tone: 'success', message: 'Consulta excluída' });
              // Same reason as the save, and here it is not even a trade-off:
              // the appointment no longer exists, so there is nothing left for
              // the unsaved edits to be saved into.
              unsavedChanges.allowNavigation();
              void navigate(routes.patient(patientId), { replace: true });
            },
            onError: (error) => {
              setIsConfirmingDelete(false);
              showToast({ tone: 'error', message: messageOf(error) });
            },
          });
        }}
      />

      <UnsavedChangesDialog guard={unsavedChanges} />
    </Page>
  );
}

/** Strictly after today — today itself is a visit that may well have happened. */
const isFutureDay = (date: Date): boolean => dateOnly(date) > dateOnly(new Date());

function toFormValues(
  appointment: Appointment | undefined,
  initialDate: Date | undefined,
): AppointmentForm {
  if (appointment === undefined) {
    const scheduledFor = initialDate ?? new Date();
    return {
      // A new appointment defaults to today, because that is when it is being
      // recorded in nearly every case. Arriving from the agenda overrides that
      // with the day the user was looking at.
      scheduledDate: toDateColumn(scheduledFor),
      // Deliberately blank rather than a guess like "09:00". A pre-filled time
      // is one the user can accept without reading, and a wrong time recorded
      // confidently is worse than an empty field the form refuses to submit.
      // The agenda supplies the day; only the clock is still missing.
      scheduledTime: '',
      type: 'visit',
      location: 'other',
      // "Realizada" is right for the usual case — recording a visit that has
      // already happened — but wrong for the one this form is now also used
      // for. A consultation booked for a future day has not happened yet, and
      // defaulting it to done would quietly file it into the reports as
      // revenue that was never earned.
      status: isFutureDay(scheduledFor) ? 'scheduled' : 'completed',
      nextReturnDate: '',
      recallDate: '',
      notes: '',
      amount: '',
      paymentMethod: '',
      paymentInstallments: '',
      invoiceStatus: 'none',
    };
  }

  const { finance } = appointment;
  return {
    scheduledDate: toDateColumn(appointment.scheduledDate),
    scheduledTime: appointment.scheduledTime ?? '',
    type: appointment.type,
    location: appointment.location,
    status: appointment.status,
    nextReturnDate:
      appointment.nextReturnDate === null ? '' : toDateColumn(appointment.nextReturnDate),
    recallDate: appointment.recallDate === null ? '' : toDateColumn(appointment.recallDate),
    notes: appointment.notes ?? '',
    amount: finance === null ? '' : String(finance.amount),
    paymentMethod: finance?.paymentMethod ?? '',
    paymentInstallments: finance?.paymentInstallments?.toString() ?? '',
    invoiceStatus: finance?.invoiceStatus ?? 'none',
  };
}

function toDraft(
  values: AppointmentForm,
  context: { patientId: string; canSeeFinances: boolean },
): AppointmentDraft {
  return {
    patientId: context.patientId,
    scheduledDate: fromDateColumn(values.scheduledDate),
    scheduledTime: values.scheduledTime,
    type: values.type,
    location: values.location,
    status: values.status,
    nextReturnDate: values.nextReturnDate === '' ? null : fromDateColumn(values.nextReturnDate),
    recallDate: values.recallDate === '' ? null : fromDateColumn(values.recallDate),
    notes: values.notes,
    // Null, not a zeroed finance: a secretary's appointment is saved with no row
    // in `appointment_finances` at all, so the doctor can fill it in later
    // without an empty record standing in the way.
    finance: context.canSeeFinances
      ? {
          amount: Number(values.amount === '' ? 0 : values.amount),
          invoiceStatus: values.invoiceStatus,
          paymentMethod:
            values.paymentMethod === ''
              ? null
              : (values.paymentMethod as (typeof PAYMENT_METHODS)[number]),
          paymentInstallments:
            values.paymentInstallments === '' ? null : Number(values.paymentInstallments),
        }
      : null,
  };
}
