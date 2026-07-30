import { cn } from '@/design-system/cn';

/**
 * The one loading indicator. `currentColor` on the border means it inherits the
 * text colour of whatever it sits in, so it never has to be re-themed per
 * placement (inside a primary button, on a card, on the surface).
 */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      // `role="status"` announces it to screen readers; the label says what is
      // happening. A bare spinning div is silent to anyone not looking at it.
      role="status"
      aria-label="Carregando"
      className={cn(
        'inline-block size-6 animate-spin rounded-full border-2 border-current border-t-transparent',
        className,
      )}
    />
  );
}

/** Full-height centred spinner, for a page whose first read has not resolved. */
export function PageSpinner() {
  return (
    <div className="text-primary flex min-h-64 flex-1 items-center justify-center py-16">
      <Spinner className="size-8" />
    </div>
  );
}
