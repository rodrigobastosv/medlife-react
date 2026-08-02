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
            page with none (or three) is a page they cannot skim.

            `line-clamp-2` rather than `truncate`: a patient's full name is the
            title of their record, and a single clipped line ("Maria Aparecida
            dos S…") with no tooltip loses the part that tells two siblings
            apart. Two lines fit almost every name; `title` covers the rest. */}
        {/* The size steps up once there is room for it. At a flat 3xl the title
            was exactly the size of the patient-count figure beside it on Início,
            so the page opened with two things competing to be read first and no
            answer about which came first. */}
        <h1
          className="font-display line-clamp-2 text-3xl font-bold tracking-tight text-balance sm:text-4xl"
          title={title}
        >
          {title}
        </h1>
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
  id,
  title,
  actions,
  children,
  className,
}: {
  /**
   * An anchor target, when something higher up the page links down to this
   * section. `scroll-mt` keeps the heading clear of the sticky top bar on
   * narrow viewports, which would otherwise cover the thing just scrolled to.
   */
  id?: string;
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      {...(id === undefined ? {} : { id })}
      className={cn('flex scroll-mt-20 flex-col gap-3', className)}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}
