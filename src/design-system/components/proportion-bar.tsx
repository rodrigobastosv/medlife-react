import { cn } from '@/design-system/cn';

export interface ProportionSegment {
  label: string;
  value: number;
  /** A CSS colour — pass a token var, e.g. `var(--color-primary)`. */
  color: string;
}

/**
 * Port of `MLProportionBar`: one rounded bar showing what a total is made of,
 * with a legend under it.
 *
 * Percentages are computed from the segments' own sum rather than a total passed
 * in, so the bar can never render a gap it cannot explain.
 */
export function ProportionBar({
  segments,
  className,
}: {
  segments: readonly ProportionSegment[];
  className?: string;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  if (total === 0) return null;

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="bg-surface-container flex h-3 w-full overflow-hidden rounded-full">
        {segments.map((segment) => (
          <div
            key={segment.label}
            title={`${segment.label}: ${segment.value}`}
            style={{ width: `${(segment.value / total) * 100}%`, backgroundColor: segment.color }}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((segment) => (
          <li key={segment.label} className="flex items-center gap-1.5 text-xs">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: segment.color }}
            />
            <span className="text-on-surface-variant">{segment.label}</span>
            <span className="font-semibold">{Math.round((segment.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
