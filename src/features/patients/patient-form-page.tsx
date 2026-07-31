import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';

import { useToast } from '@/app/providers/toast-context';
import { routes } from '@/app/routing/routes';
import { messageOf } from '@/core/errors';
import { fromDateColumn, toDateColumn } from '@/core/format';
import { patientToDraft, type PatientDraft } from '@/domain/patients/patient';
import { cpfDigits } from '@/domain/patients/patient-cpf';
import { PATIENT_ORIGINS, patientOriginLabel } from '@/domain/patients/patient-origin';
import {
  usePatientByCpfQuery,
  usePatientQuery,
  useSavePatientMutation,
} from '@/features/patients/use-patients';
import { BackLink } from '@/features/navigation/back-link';
import { Button } from '@/design-system/components/button';
import { buttonClasses } from '@/design-system/components/button-classes';
import { Card } from '@/design-system/components/card';
import { SelectField, TextAreaField, TextField } from '@/design-system/components/form-fields';
import { Page, PageHeader } from '@/design-system/components/page';
import { PageSpinner } from '@/design-system/components/spinner';

/**
 * The form's schema, which is also the form's type.
 *
 * Note `birthDate` is a **string** here, not a `Date`: an `<input type="date">`
 * speaks `yyyy-MM-dd`, and pretending otherwise means converting on every
 * keystroke. The conversion happens once, at submit, on the way to the draft —
 * the boundary where the domain starts.
 */
const schema = z.object({
  fullName: z.string().min(2, 'Informe o nome do paciente'),
  origin: z.enum(PATIENT_ORIGINS),
  birthDate: z.string(),
  cpf: z.string(),
  phone: z.string(),
  address: z.string(),
  invoiceName: z.string(),
  invoiceCpf: z.string(),
  notes: z.string(),
});

type PatientForm = z.infer<typeof schema>;

/**
 * One page for create and edit.
 *
 * The route decides which: `/patients/new` has no `:patientId`, so the param is
 * undefined and the mutation inserts. Two nearly identical pages would drift
 * apart the first time a field was added to only one of them.
 */
export function PatientFormPage() {
  const { patientId } = useParams();
  const isEditing = patientId !== undefined;

  const patientQuery = usePatientQuery(patientId ?? '');

  // Editing cannot render the form until the patient is loaded — react-hook-form
  // captures `defaultValues` when the form is *created*, so mounting it with
  // empty values and filling them in later would leave the fields blank (that is
  // what `reset()` is for, and avoiding the need for it is simpler). Gating the
  // render here means the form is built once, with the real values already in
  // hand.
  if (isEditing && patientQuery.isPending) return <PageSpinner />;

  return (
    <PatientForm
      patientId={patientId ?? null}
      initial={
        patientQuery.data === undefined
          ? emptyForm
          : toFormValues(patientToDraft(patientQuery.data))
      }
    />
  );
}

function PatientForm({ patientId, initial }: { patientId: string | null; initial: PatientForm }) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const saveMutation = useSavePatientMutation(patientId);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PatientForm>({ resolver: zodResolver(schema), defaultValues: initial });

  /**
   * The CPF the register has been asked about, set when the field is left.
   *
   * On blur rather than on change, because a CPF is only meaningful once it is
   * whole and a request per keystroke would ask eleven questions to get one
   * answer. It starts empty even when editing: the patient's own CPF is already
   * in the field, and looking it up on mount would spend a request to discover
   * that they are themselves.
   */
  const [checkedCpf, setCheckedCpf] = useState('');
  const cpfField = register('cpf');
  const cpfMatch = usePatientByCpfQuery(checkedCpf).data ?? null;

  // Editing a patient must not accuse them of being their own duplicate — the
  // match found *is* the record being edited, and warning about it would make
  // the CPF field unusable on every edit.
  const duplicate = cpfMatch !== null && cpfMatch.id !== patientId ? cpfMatch : null;

  const onSubmit = handleSubmit((values) => {
    saveMutation.mutate(toDraft(values), {
      onSuccess: (patient) => {
        showToast({ tone: 'success', message: 'Paciente salvo' });
        void navigate(routes.patient(patient.id), { replace: true });
      },
      onError: (error) => showToast({ tone: 'error', message: messageOf(error) }),
    });
  });

  return (
    <Page>
      <PageHeader
        title={patientId === null ? 'Novo paciente' : 'Editar paciente'}
        back={<BackLink to={patientId === null ? routes.patients : routes.patient(patientId)} />}
      />

      <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
        <Card className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Nome completo"
            containerClassName="sm:col-span-2"
            autoComplete="name"
            error={errors.fullName?.message}
            {...register('fullName')}
          />
          <TextField label="Data de nascimento" type="date" {...register('birthDate')} />
          <SelectField
            label="Origem"
            options={PATIENT_ORIGINS.map((origin) => ({
              value: origin,
              label: patientOriginLabel[origin],
            }))}
            {...register('origin')}
          />
          {/* The field and its answer are one cell, so the notice appears under
              the CPF it is about instead of at the bottom of the card. */}
          <div className="flex flex-col gap-2">
            <TextField
              label="CPF"
              inputMode="numeric"
              {...cpfField}
              onBlur={(event) => {
                // react-hook-form's own `onBlur` is what marks the field touched
                // and runs its validation; overriding the prop without calling it
                // would quietly disable both.
                void cpfField.onBlur(event);
                setCheckedCpf(cpfDigits(event.target.value));
              }}
            />

            {duplicate !== null && (
              // A notice, not a validation error. The save is still allowed:
              // refusing it would leave whoever is at the desk with a filled
              // form, a red field and nowhere to go — and the case where the
              // duplicate is genuinely a different person (a typo in the other
              // record) would be unresolvable from here. Offering the existing
              // record is the useful half; the unique index is what makes the
              // rule true.
              <div
                // Announced when it appears — it shows up after the field has
                // been left, so nobody is looking at it.
                role="status"
                className="bg-warning-container text-on-warning-container rounded-m flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <span>Já existe um paciente com esse CPF: {duplicate.fullName}</span>
                {/* A link rather than a button: opening a record in a new tab
                    is exactly what someone comparing the two will want.
                    `border-current` and `text-inherit` because the outline
                    variant's teal is legible on a surface, and this one is the
                    warning container. */}
                <Link
                  to={routes.patient(duplicate.id)}
                  className={buttonClasses({
                    variant: 'outline',
                    size: 'sm',
                    className: 'hover:bg-on-warning-container/10 border-current text-inherit',
                  })}
                >
                  Abrir cadastro
                </Link>
              </div>
            )}
          </div>
          <TextField label="Telefone" type="tel" inputMode="tel" {...register('phone')} />
          <TextField label="Endereço" containerClassName="sm:col-span-2" {...register('address')} />
        </Card>

        <Card className="grid gap-4 sm:grid-cols-2">
          <h2 className="font-display text-base font-semibold sm:col-span-2">
            Dados de faturamento
          </h2>
          <p className="text-on-surface-variant -mt-2 text-sm sm:col-span-2">
            Preencha apenas se a nota for emitida para outra pessoa.
          </p>
          <TextField label="Nome na nota" {...register('invoiceName')} />
          <TextField label="CPF na nota" inputMode="numeric" {...register('invoiceCpf')} />
        </Card>

        <Card>
          <TextAreaField label="Observações" rows={4} {...register('notes')} />
        </Card>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => void navigate(-1)}>
            Cancelar
          </Button>
          <Button type="submit" isLoading={saveMutation.isPending}>
            Salvar
          </Button>
        </div>
      </form>
    </Page>
  );
}

const emptyForm: PatientForm = {
  fullName: '',
  origin: 'other',
  birthDate: '',
  cpf: '',
  phone: '',
  address: '',
  invoiceName: '',
  invoiceCpf: '',
  notes: '',
};

const toFormValues = (draft: PatientDraft): PatientForm => ({
  ...draft,
  birthDate: draft.birthDate === null ? '' : toDateColumn(draft.birthDate),
});

const toDraft = (values: PatientForm): PatientDraft => ({
  ...values,
  birthDate: values.birthDate === '' ? null : fromDateColumn(values.birthDate),
});
