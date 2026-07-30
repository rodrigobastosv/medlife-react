import { useState } from 'react';

import { messageOf } from '@/core/errors';
import { formatCurrency, formatMonthShort, formatMonthYear } from '@/core/format';
import { paymentMethodLabel, type PaymentMethod } from '@/domain/appointments/appointment-enums';
import {
  REPORT_PERIODS,
  averageTicket,
  isReportEmpty,
  reportPeriodLabel,
  type MonthlyReport,
  type ReportPeriod,
} from '@/domain/reports/monthly-report';
import { useMonthlyReportQuery } from '@/features/reports/use-report';
import { BarChart } from '@/design-system/components/bar-chart';
import { Card, CardTitle } from '@/design-system/components/card';
import { cn } from '@/design-system/cn';
import { EmptyState } from '@/design-system/components/empty-state';
import { ChartIcon } from '@/design-system/components/icons';
import { Page, PageHeader } from '@/design-system/components/page';
import { ProportionBar } from '@/design-system/components/proportion-bar';
import { Skeleton } from '@/design-system/components/skeleton';

/** Doctor-only: everything here is money. The route guard is what enforces that. */
export function ReportsPage() {
  const [period, setPeriod] = useState<ReportPeriod>('this_year');
  const report = useMonthlyReportQuery(period);

  return (
    <Page>
      <PageHeader
        title="Relatórios"
        subtitle="Receita, consultas e pacientes novos."
        actions={<PeriodSelector value={period} onChange={setPeriod} />}
      />

      {report.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-64 sm:col-span-2" />
        </div>
      ) : report.isError ? (
        <EmptyState
          title="Não foi possível carregar o relatório"
          message={messageOf(report.error)}
          actionLabel="Tentar de novo"
          onAction={() => void report.refetch()}
        />
      ) : isReportEmpty(report.data) ? (
        <EmptyState
          icon={<ChartIcon />}
          title="Nada no período"
          message="Registre consultas para ver receita, ticket médio e pacientes novos."
        />
      ) : (
        <ReportContent report={report.data} />
      )}
    </Page>
  );
}

/**
 * A radio group, not a row of buttons.
 *
 * `role="radiogroup"` plus `aria-checked` is what tells assistive tech these are
 * mutually exclusive options and which one is chosen. Styled buttons with only a
 * background colour to distinguish them convey none of that.
 */
function PeriodSelector({
  value,
  onChange,
}: {
  value: ReportPeriod;
  onChange: (period: ReportPeriod) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Período"
      className="bg-surface-container flex rounded-full p-1"
    >
      {REPORT_PERIODS.map((period) => (
        <button
          key={period}
          type="button"
          role="radio"
          aria-checked={value === period}
          onClick={() => onChange(period)}
          className={cn(
            'cursor-pointer rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
            value === period ? 'bg-primary text-on-primary' : 'text-on-surface-variant',
          )}
        >
          {reportPeriodLabel[period]}
        </button>
      ))}
    </div>
  );
}

function ReportContent({ report }: { report: MonthlyReport }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Receita" value={formatCurrency(report.totalRevenue)} highlight />
        <StatCard label="Consultas" value={String(report.totalCount)} />
        <StatCard label="Ticket médio" value={formatCurrency(averageTicket(report))} />
        <StatCard label="Pacientes novos" value={String(report.totalNewPatients)} />
      </div>

      <Card className="flex flex-col gap-4">
        <CardTitle>Receita por mês</CardTitle>
        <BarChart
          entries={report.months.map((month) => ({
            label: formatMonthShort(month.month),
            value: month.revenue,
            // The chart is handed a finished string, so it never has to know
            // about currency or locale.
            tooltip: `${formatMonthYear(month.month)}: ${formatCurrency(month.revenue)}`,
          }))}
        />
      </Card>

      <Card className="flex flex-col gap-4">
        <CardTitle>Consultas por mês</CardTitle>
        <BarChart
          entries={report.months.map((month) => ({
            label: formatMonthShort(month.month),
            value: month.count,
            tooltip: `${formatMonthYear(month.month)}: ${month.count} consultas · ${month.newPatients} novos`,
          }))}
        />
      </Card>

      {report.paymentCounts.size > 0 && (
        <Card className="flex flex-col gap-4">
          <CardTitle>Formas de pagamento</CardTitle>
          <ProportionBar
            segments={[...report.paymentCounts.entries()]
              .sort(([, a], [, b]) => b - a)
              .map(([method, count]) => ({
                label: paymentMethodLabel[method],
                value: count,
                color: paymentColors[method],
              }))}
          />
        </Card>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <Card className={cn('py-4', highlight && 'bg-primary text-on-primary')}>
      <span className="text-sm opacity-80">{label}</span>
      <span className="font-display mt-1 block text-2xl font-bold">{value}</span>
    </Card>
  );
}

/**
 * A fixed colour per payment method, so the same slice is the same colour every
 * time the report is opened. Deriving colours from the sort order would repaint
 * the chart whenever the ranking changed, which makes it unreadable at a glance.
 */
const paymentColors: Record<PaymentMethod, string> = {
  pix: 'var(--color-primary)',
  cash: 'var(--color-success)',
  credit: 'var(--color-secondary)',
  debit: 'var(--color-violet)',
  courtesy: 'var(--color-on-surface-variant)',
  plan: 'var(--color-warning)',
  insurance: 'var(--color-error)',
};
