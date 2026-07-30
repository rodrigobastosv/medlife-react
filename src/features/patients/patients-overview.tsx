import { useMemo } from 'react';

import { formatAge } from '@/core/format';
import type { Patient } from '@/domain/patients/patient';
import {
  ageBandDescription,
  hasAgeData,
  summarizePatientAges,
} from '@/domain/patients/patient-age-summary';
import { BarChart } from '@/design-system/components/bar-chart';
import { Card, CardTitle } from '@/design-system/components/card';
import { cn } from '@/design-system/cn';
import { Tag } from '@/design-system/components/tag';

/**
 * The at-a-glance block above the patient list: a handful of figures and the age
 * distribution.
 *
 * It answers the question the list cannot — "who are these people, roughly?" —
 * without becoming a second reports page. The rule applied here was to show only
 * what a doctor would otherwise work out by scrolling: the spread of ages, where
 * the middle of it sits, and the two ends. Anything that needs a period filter
 * or a currency belongs on Relatórios.
 *
 * All of the arithmetic is `summarizePatientAges`; this component only decides
 * how it is worded and laid out.
 */
export function PatientsOverview({
  patients,
  className,
}: {
  patients: readonly Patient[];
  className?: string;
}) {
  // The summary walks every patient, so it is tied to the list identity rather
  // than recomputed on each keystroke in the search field above it.
  const summary = useMemo(() => summarizePatientAges(patients), [patients]);

  // Nothing to summarise about nobody. Rendering the card anyway would mean a
  // row of dashes and an empty chart on the screen that most needs to say
  // "cadastre o primeiro paciente".
  if (summary.total === 0) return null;

  const knowsAges = hasAgeData(summary);

  return (
    <Card className={cn('flex flex-col gap-5', className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <CardTitle>Perfil dos pacientes</CardTitle>
        {/* Said out loud, not hidden: the figures below describe only the
            patients whose birth date is filled in, and this is how many they
            leave out. Without it the average silently describes a subset. */}
        {summary.withoutBirthDate > 0 && (
          <Tag tone="warning">
            {summary.withoutBirthDate === 1
              ? '1 sem data de nascimento'
              : `${summary.withoutBirthDate} sem data de nascimento`}
          </Tag>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Figure label="Cadastrados" value={String(summary.total)} />
        <Figure
          label="Idade média"
          value={summary.averageAge === null ? null : formatAge(summary.averageAge)}
          unit="anos"
        />
        <Figure
          label="Idade mediana"
          value={summary.medianAge === null ? null : formatAge(summary.medianAge)}
          unit="anos"
        />
        <Figure
          label="Do mais novo ao mais velho"
          value={
            summary.youngestAge === null || summary.oldestAge === null
              ? null
              : // An en dash with thin spaces around it, not a hyphen: this is a
                // range, and "34-89" reads as a subtraction at this size.
                `${summary.youngestAge} – ${summary.oldestAge}`
          }
          unit="anos"
        />
      </dl>

      <div className="flex flex-col gap-3">
        <h3 className="text-on-surface-variant text-sm font-semibold">Faixa etária</h3>
        <BarChart
          entries={summary.bands.map(({ band, count }) => ({
            label: band.label,
            value: count,
            // The chart is handed a finished sentence — it never has to know
            // what a band is or how to pluralise "paciente".
            tooltip: `${ageBandDescription(band)}: ${count} ${count === 1 ? 'paciente' : 'pacientes'}${
              knowsAges ? ` (${Math.round((count / summary.withBirthDate) * 100)}%)` : ''
            }`,
          }))}
          emptyMessage="Nenhum paciente tem data de nascimento cadastrada."
        />
      </div>
    </Card>
  );
}

/**
 * One figure in the stat row.
 *
 * `value` is `null` when the figure cannot be computed — an em dash is the
 * honest rendering of "not known", and it keeps the row's height and rhythm
 * instead of collapsing a tile and reflowing the grid.
 */
function Figure({ label, value, unit }: { label: string; value: string | null; unit?: string }) {
  return (
    <div className="bg-surface-container rounded-l p-3">
      <dt className="text-on-surface-variant text-xs">{label}</dt>
      <dd className="font-display nums mt-1 text-xl font-bold">
        {value ?? '—'}
        {value !== null && unit !== undefined && (
          <span className="text-on-surface-variant ml-1 text-sm font-medium">{unit}</span>
        )}
      </dd>
    </div>
  );
}
