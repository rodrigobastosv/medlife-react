import { cn } from '@/design-system/cn';

export interface BarChartEntry {
  /** Axis caption under the bar ("jul"). */
  label: string;
  value: number;
  /** Shown on hover/focus — the formatted figure, built by the caller. */
  tooltip: string;
}

/**
 * Port of `MLBarChart`: a plain vertical bar chart, hand-built from divs.
 *
 * No charting library, for the same reason the Flutter app hand-rolls its
 * charts: the whole requirement is "n bars on a shared scale", and a library
 * would be a dependency to theme, override and keep up to date in exchange for
 * features this screen does not use.
 *
 * The bars are `height: %` inside a fixed-height flex row, so the browser does
 * the scaling and nothing needs to measure the container. Formatting stays with
 * the caller (`tooltip` arrives as a finished string) — a chart that knows what
 * Brazilian currency looks like is a chart that can only draw money.
 */
export function BarChart({
  entries,
  className,
  emptyMessage = 'Nada no período.',
}: {
  entries: readonly BarChartEntry[];
  className?: string;
  emptyMessage?: string;
}) {
  const max = Math.max(...entries.map((entry) => entry.value), 0);

  if (entries.length === 0 || max === 0) {
    return <p className="text-on-surface-variant py-8 text-center text-sm">{emptyMessage}</p>;
  }

  return (
    <div className={cn('flex h-44 items-end gap-1', className)}>
      {entries.map((entry) => (
        <div key={entry.label} className="flex h-full flex-1 flex-col justify-end gap-2">
          <div className="flex h-full items-end" title={entry.tooltip}>
            <div
              className="bg-primary hover:bg-primary/80 rounded-t-s w-full transition-[height,background-color]"
              // A zero-height bar is invisible and reads as a rendering bug, so
              // an empty month keeps a 2px stub — a gap you can see is data.
              style={{
                height: `${Math.max((entry.value / max) * 100, entry.value === 0 ? 1 : 4)}%`,
              }}
            />
          </div>
          <span className="text-on-surface-variant truncate text-center text-[11px]">
            {entry.label}
          </span>
        </div>
      ))}
    </div>
  );
}
