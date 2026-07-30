import { useDeferredValue, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { routes } from '@/app/routing/routes';
import { messageOf } from '@/core/errors';
import { ageFromBirthDate } from '@/core/format';
import { patientInitials, type Patient } from '@/domain/patients/patient';
import { patientOriginLabel } from '@/domain/patients/patient-origin';
import { PatientsOverview } from '@/features/patients/patients-overview';
import { usePatientsQuery } from '@/features/patients/use-patients';
import { buttonClasses } from '@/design-system/components/button-classes';
import { EmptyState } from '@/design-system/components/empty-state';
import { TextField } from '@/design-system/components/form-fields';
import { PeopleIcon, PlusIcon } from '@/design-system/components/icons';
import { Page, PageHeader } from '@/design-system/components/page';
import { Skeleton, SkeletonList } from '@/design-system/components/skeleton';
import { Tag } from '@/design-system/components/tag';

export function PatientsPage() {
  const patients = usePatientsQuery();
  const [search, setSearch] = useState('');

  // `useDeferredValue` lets the input stay responsive while the (potentially
  // long) filtered list re-renders at a lower priority. The field updates on
  // every keystroke; the list catches up. On a few hundred patients this is
  // imperceptible — it is here because it is the right tool, and it costs one
  // line, where debouncing by hand costs a timer, a cleanup and a stale-closure
  // bug.
  const deferredSearch = useDeferredValue(search);

  // Filtering runs on every render otherwise — including renders caused by
  // something entirely unrelated. `useMemo` ties the work to its actual inputs.
  const filtered = useMemo(
    () => filterPatients(patients.data ?? [], deferredSearch),
    [patients.data, deferredSearch],
  );

  return (
    <Page>
      <PageHeader
        title="Pacientes"
        subtitle={patients.data === undefined ? undefined : `${patients.data.length} cadastrados`}
        actions={
          <Link to={routes.newPatient} className={buttonClasses({ className: 'gap-2' })}>
            <PlusIcon />
            Novo paciente
          </Link>
        }
      />

      {/* The overview describes the whole register, so it is deliberately
          outside the search field's influence: filtering to "Ana" should not
          redraw the practice's age profile. It is skipped entirely on error —
          the list below already explains what went wrong, and a second failure
          message would only repeat it — and `PatientsOverview` renders nothing
          when there are no patients at all. */}
      {patients.isPending ? (
        <Skeleton className="mb-6 h-64 w-full rounded-l" />
      ) : patients.isError ? null : (
        <PatientsOverview patients={patients.data} className="mb-6" />
      )}

      <TextField
        label="Buscar"
        placeholder="Nome, CPF ou telefone"
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        containerClassName="mb-6"
      />

      {patients.isPending ? (
        <SkeletonList rows={4} />
      ) : patients.error !== null ? (
        <EmptyState
          icon={<PeopleIcon />}
          title="Não foi possível carregar"
          message={messageOf(patients.error)}
          actionLabel="Tentar de novo"
          onAction={() => void patients.refetch()}
        />
      ) : filtered.length === 0 ? (
        // "Nothing yet" and "nothing matched" are different situations and read
        // differently: one invites a first record, the other says the filter is
        // hiding things.
        search.trim() === '' ? (
          <EmptyState
            icon={<PeopleIcon />}
            title="Nenhum paciente ainda"
            message="Cadastre o primeiro paciente para começar a registrar consultas."
          />
        ) : (
          <EmptyState
            icon={<PeopleIcon />}
            title="Nada encontrado"
            message={`Nenhum paciente corresponde a "${search}".`}
          />
        )
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map((patient) => (
            <li key={patient.id}>
              <PatientTile patient={patient} />
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}

function PatientTile({ patient }: { patient: Patient }) {
  return (
    <Link
      to={routes.patient(patient.id)}
      className="bg-surface-container hover:bg-primary-container/50 flex items-center gap-4 rounded-l p-4 transition-colors"
    >
      <span
        aria-hidden
        className="bg-primary-container text-on-primary-container flex size-11 shrink-0 items-center justify-center rounded-full font-semibold"
      >
        {patientInitials(patient)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{patient.fullName}</span>
        <span className="text-on-surface-variant block truncate text-sm">
          {[
            patient.birthDate === null ? null : `${ageFromBirthDate(patient.birthDate)} anos`,
            patient.phone,
          ]
            .filter((part) => part !== null && part !== '')
            .join(' · ') || 'Sem dados de contato'}
        </span>
      </span>
      <Tag tone="neutral" className="hidden sm:inline-flex">
        {patientOriginLabel[patient.origin]}
      </Tag>
    </Link>
  );
}

/**
 * Search over name, CPF and phone.
 *
 * `normalize` strips accents (via Unicode decomposition, which splits "á" into
 * "a" + a combining mark that the regex then removes) so "Jose" finds "José" —
 * without it a search for an accented name only works if the user types the
 * accent, which nobody does. Digits are stripped from CPF and phone so "11987"
 * matches "(11) 98765-4321".
 */
function filterPatients(patients: readonly Patient[], search: string): Patient[] {
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
