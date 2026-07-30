import { useId, useMemo, useState } from 'react';

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
import { ChevronRightIcon } from '@/design-system/components/icons';
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
 * It starts **collapsed**, because the list is what the page is for and a chart
 * that pushes it below the fold on every visit is a chart that gets in the way.
 * The header keeps the headline figures on one line while collapsed, so the
 * block still says something useful without being opened.
 *
 * All of the arithmetic is `summarizePatientAges`; this component only decides
 * how it is worded and laid out.
 */
export function PatientsOverview({
  patients,
  selectedBandLabel,
  onSelectBand,
  className,
}: {
  patients: readonly Patient[];
  /** The band the list below is filtered to, or `null` for no filter. */
  selectedBandLabel: string | null;
  /** Called with a band's label to filter by it, or `null` to clear it. */
  onSelectBand: (label: string | null) => void;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();

  // The summary walks every patient, so it is tied to the list identity rather
  // than recomputed on each keystroke in the search field above it.
  const summary = useMemo(() => summarizePatientAges(patients), [patients]);

  // Nothing to summarise about nobody. Rendering the card anyway would mean a
  // row of dashes and an empty chart on the screen that most needs to say
  // "cadastre o primeiro paciente".
  if (summary.total === 0) return null;

  const knowsAges = hasAgeData(summary);
  const missing = summary.withoutBirthDate;
  const missingLabel =
    missing === 1 ? '1 sem data de nascimento' : `${missing} sem data de nascimento`;

  return (
    <Card className={cn('flex flex-col', className)}>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((open) => !open)}
        className="focus-visible:outline-primary -m-1 flex cursor-pointer items-center gap-3 rounded-s p-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <span className="min-w-0 flex-1">
          <CardTitle>Perfil dos pacientes</CardTitle>
          {/* The collapsed state still has to earn its line on the screen, so
              the two figures a geriatrician would open the card for are printed
              right here. Hidden when open, where the full row says it better. */}
          {!expanded && (
            <span className="text-on-surface-variant mt-0.5 block truncate text-sm">
              {headline(summary.total, summary.averageAge)}
            </span>
          )}
        </span>

        {missing > 0 && (
          // Said out loud, not hidden: the figures below describe only the
          // patients whose birth date is filled in, and this is how many they
          // leave out. Without it the average silently describes a subset.
          <Tag tone="warning" className="hidden sm:inline-flex">
            {missingLabel}
          </Tag>
        )}

        <ChevronRightIcon
          className={cn(
            'text-on-surface-variant shrink-0 transition-transform',
            expanded && 'rotate-90',
          )}
        />
      </button>

      {expanded && (
        <div id={panelId} className="mt-5 flex flex-col gap-5">
          {missing > 0 && (
            // The same warning the header carries, for the narrow screens it
            // does not fit on beside the title.
            <Tag tone="warning" className="self-start sm:hidden">
              {missingLabel}
            </Tag>
          )}

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
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-on-surface-variant text-sm font-semibold">Faixa etária</h3>
              {knowsAges && (
                <p className="text-on-surface-variant text-xs">
                  {selectedBandLabel === null
                    ? 'Toque numa faixa para ver os pacientes'
                    : 'Toque de novo para limpar'}
                </p>
              )}
            </div>
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
              selectedLabel={selectedBandLabel}
              // Clicking the band that is already filtered clears it, so the
              // same gesture that drilled in backs out of it.
              onSelect={(entry) =>
                onSelectBand(entry.label === selectedBandLabel ? null : entry.label)
              }
            />
          </div>
        </div>
      )}
    </Card>
  );
}

/** "128 pacientes · idade média 78 anos" — the collapsed one-liner. */
function headline(total: number, averageAge: number | null): string {
  const patients = total === 1 ? '1 paciente' : `${total} pacientes`;
  return averageAge === null ? patients : `${patients} · idade média ${formatAge(averageAge)} anos`;
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
