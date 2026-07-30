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
  onSelect,
  selectedLabel = null,
}: {
  entries: readonly BarChartEntry[];
  className?: string;
  emptyMessage?: string;
  /**
   * Makes the bars selectable. Omit it and the chart stays exactly what it was:
   * inert divs, no focus stops, no button semantics — a reader of a chart that
   * does nothing should not be told there are seven buttons on the screen.
   */
  onSelect?: (entry: BarChartEntry) => void;
  /** The `label` of the currently selected entry, when the chart is selectable. */
  selectedLabel?: string | null;
}) {
  const max = Math.max(...entries.map((entry) => entry.value), 0);

  if (entries.length === 0 || max === 0) {
    return <p className="text-on-surface-variant py-8 text-center text-sm">{emptyMessage}</p>;
  }

  const selectable = onSelect !== undefined;
  // Only dims the others once something is actually chosen — with nothing
  // selected every bar is equally interesting and dimming would be noise.
  const hasSelection = selectable && selectedLabel !== null;

  return (
    <div className={cn('flex h-44 items-end gap-1', className)}>
      {entries.map((entry) => {
        const selected = selectable && entry.label === selectedLabel;

        const column = (
          <>
            <span className="flex h-full items-end" title={entry.tooltip}>
              <span
                className={cn(
                  'bg-primary rounded-t-s hover:bg-primary/80 block w-full transition-[height,background-color,opacity]',
                  // Also on hovering the column's label, not just the bar itself:
                  // the whole column is one click target once it is selectable.
                  selectable && 'group-hover:bg-primary/80',
                  hasSelection && !selected && 'opacity-35',
                )}
                // A zero-height bar is invisible and reads as a rendering bug, so
                // an empty month keeps a 2px stub — a gap you can see is data.
                style={{
                  height: `${Math.max((entry.value / max) * 100, entry.value === 0 ? 1 : 4)}%`,
                }}
              />
            </span>
            <span
              className={cn(
                'truncate text-center text-[11px] transition-colors',
                selected ? 'text-primary font-semibold' : 'text-on-surface-variant',
              )}
            >
              {entry.label}
            </span>
          </>
        );

        const columnClasses = 'flex h-full flex-1 flex-col justify-end gap-2';

        return selectable ? (
          <button
            key={entry.label}
            type="button"
            // `aria-pressed` rather than a plain click target: this is a toggle
            // that stays on, and a screen reader has to be able to say which bar
            // the list below is currently filtered to.
            aria-pressed={selected}
            aria-label={entry.tooltip}
            onClick={() => onSelect(entry)}
            className={cn(
              columnClasses,
              'group focus-visible:outline-primary cursor-pointer rounded-s focus-visible:outline-2 focus-visible:outline-offset-2',
            )}
          >
            {column}
          </button>
        ) : (
          <div key={entry.label} className={columnClasses}>
            {column}
          </div>
        );
      })}
    </div>
  );
}
