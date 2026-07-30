import { cn } from '@/design-system/cn';

/**
 * A pulsing placeholder for content that is still loading.
 *
 * It is used for a **first read** — where the app already knows the shape of
 * what it is about to draw — and never for a write. A spinner is right when
 * something is being submitted and the outcome is unknown; a skeleton is right
 * when a known layout is being filled in, because it shows the page arriving
 * rather than blocking it.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      // Decorative: the loading state is already announced by the region that
      // owns the data, and a screen reader reading out five grey boxes is noise.
      aria-hidden
      className={cn('bg-on-surface/10 rounded-m animate-pulse', className)}
    />
  );
}

/** A stack of card-shaped skeletons — the common "list is loading" case. */
export function SkeletonList({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-20 w-full rounded-l" />
      ))}
    </div>
  );
}
