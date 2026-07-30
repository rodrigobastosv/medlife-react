import type { ReactNode } from 'react';

import { cn } from '@/design-system/cn';

/**
 * The page frame: a max-width column with a header row.
 *
 * `max-w-content` (1100px, from the tokens file) is the one rule here worth
 * stating: on a wide monitor, text that runs the full window width is genuinely
 * harder to read — the eye loses the line on the way back. Capping the column
 * and centring it is the same `MLContentWidth` decision the Flutter app makes.
 */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('max-w-content mx-auto w-full px-4 py-6 sm:px-6 sm:py-8', className)}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: string;
  subtitle?: ReactNode;
  /** Buttons for this page — rendered at the end of the header row. */
  actions?: ReactNode;
  /** A back link, when the page was pushed on top of another. */
  back?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {back}
        {/* One <h1> per page. Screen-reader users navigate by heading, and a
            page with none (or three) is a page they cannot skim. */}
        <h1 className="font-display truncate text-2xl font-bold">{title}</h1>
        {subtitle !== undefined && (
          <div className="text-on-surface-variant mt-1 text-sm">{subtitle}</div>
        )}
      </div>
      {actions !== undefined && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** A titled block inside a page. */
export function Section({
  title,
  actions,
  children,
  className,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}
