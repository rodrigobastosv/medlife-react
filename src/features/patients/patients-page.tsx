import { useDeferredValue, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { routes } from '@/app/routing/routes';
import { messageOf } from '@/core/errors';
import { ageFromBirthDate } from '@/core/format';
import { patientInitials, type Patient } from '@/domain/patients/patient';
import {
  ageBandDescription,
  ageBandOfPatient,
  ageBandPhrase,
  findAgeBand,
  type AgeBand,
} from '@/domain/patients/patient-age-summary';
import { patientOriginLabel } from '@/domain/patients/patient-origin';
import { searchPatients } from '@/domain/patients/patient-search';
import { PatientsOverview } from '@/features/patients/patients-overview';
import { usePatientsQuery } from '@/features/patients/use-patients';
import { buttonClasses } from '@/design-system/components/button-classes';
import { EmptyState } from '@/design-system/components/empty-state';
import { TextField } from '@/design-system/components/form-fields';
import { CloseIcon, PeopleIcon, PlusIcon } from '@/design-system/components/icons';
import { Page, PageHeader } from '@/design-system/components/page';
import { Skeleton, SkeletonList } from '@/design-system/components/skeleton';
import { Tag } from '@/design-system/components/tag';

export function PatientsPage() {
  const patients = usePatientsQuery();
  const [search, setSearch] = useState('');

  // The age band clicked on the chart above, as a band label. It lives here
  // rather than inside `PatientsOverview` because it filters *this* list — the
  // chart only reports which bar was pressed.
  const [selectedBandLabel, setSelectedBandLabel] = useState<string | null>(null);
  const selectedBand = selectedBandLabel === null ? undefined : findAgeBand(selectedBandLabel);

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
    () => filterPatients(patients.data ?? [], deferredSearch, selectedBandLabel),
    [patients.data, deferredSearch, selectedBandLabel],
  );

  // The two filters are independent, and the empty state has to tell "no
  // patients at all" apart from "the filters hid them" — which is not the same
  // question as whether the search box has text in it.
  const isFiltered = search.trim() !== '' || selectedBandLabel !== null;

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
        <Skeleton className="mb-6 h-20 w-full rounded-l" />
      ) : patients.isError ? null : (
        <PatientsOverview
          patients={patients.data}
          selectedBandLabel={selectedBandLabel}
          onSelectBand={setSelectedBandLabel}
          className="mb-6"
        />
      )}

      <TextField
        label="Buscar"
        placeholder="Nome, CPF ou telefone"
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        containerClassName="mb-6"
      />

      {/* The band filter is set from a chart that may well be collapsed by the
          time the user reads the list, so it needs a visible home of its own —
          otherwise the list is silently short and nothing on screen says why. */}
      {selectedBand !== undefined && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-on-surface-variant text-sm">Faixa etária:</span>
          <button
            type="button"
            onClick={() => setSelectedBandLabel(null)}
            aria-label={`Remover filtro de faixa etária: ${ageBandDescription(selectedBand)}`}
            className="bg-primary-container text-on-primary-container focus-visible:outline-primary hover:bg-primary-container/70 inline-flex cursor-pointer items-center gap-1 rounded-full py-1 pr-2 pl-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {ageBandDescription(selectedBand)}
            <CloseIcon className="size-4" />
          </button>
        </div>
      )}

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
        // hiding things — and it names *which* filter, since the age band can be
        // the one at fault while the search box sits empty.
        !isFiltered ? (
          <EmptyState
            icon={<PeopleIcon />}
            title="Nenhum paciente ainda"
            message="Cadastre o primeiro paciente para começar a registrar consultas."
          />
        ) : (
          <EmptyState
            icon={<PeopleIcon />}
            title="Nada encontrado"
            message={noMatchMessage(search, selectedBand)}
            actionLabel="Limpar filtros"
            onAction={() => {
              setSearch('');
              setSelectedBandLabel(null);
            }}
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

/** "Nenhum paciente de 70 a 79 anos corresponde a "ana"." and its simpler forms. */
function noMatchMessage(search: string, band: AgeBand | undefined): string {
  const term = search.trim();
  const who = band === undefined ? 'paciente' : `paciente ${ageBandPhrase(band)}`;
  return term === '' ? `Nenhum ${who} cadastrado.` : `Nenhum ${who} corresponde a "${term}".`;
}

/**
 * The text search, narrowed to an age band.
 *
 * The two are ANDed: the band comes from the chart above and the term from the
 * field, and a user who has both set is asking for the intersection. Matching a
 * term against a patient is `searchPatients` in the domain — the picker dialog
 * on the agenda searches the same register, and one rule serves both.
 */
function filterPatients(
  patients: readonly Patient[],
  search: string,
  bandLabel: string | null,
): Patient[] {
  // One reference date for the whole pass. Reading the clock per patient would
  // be both wasteful and, at midnight on someone's birthday, inconsistent.
  const now = new Date();
  const byBand =
    bandLabel === null
      ? patients
      : patients.filter((patient) => ageBandOfPatient(patient, now)?.label === bandLabel);

  return searchPatients(byBand, search);
}
