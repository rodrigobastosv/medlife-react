import type { ReactNode } from 'react';

import { cn } from '@/design-system/cn';

/**
 * Port of `MLTag` + `MLSeverity`: a pill for a short status word.
 *
 * Every tone is a *container* colour with its own ink (`bg-…-container` +
 * `text-on-…-container`), never an accent used as both background and text. That
 * pairing is what keeps the text readable — a 15%-opacity accent behind the
 * accent itself measures under 2:1 for the warning tone, which is unreadable in
 * exactly the place a warning most needs to be read.
 */
export type TagTone = 'neutral' | 'primary' | 'success' | 'warning' | 'error';

const toneClasses: Record<TagTone, string> = {
  neutral: 'bg-surface-container text-on-surface-variant',
  primary: 'bg-primary-container text-on-primary-container',
  // Success has no container token in the palette, so it is built from the
  // accent at low opacity over the surface, with the accent itself as ink —
  // safe here because `success` is dark enough in both themes.
  success: 'bg-success/15 text-success',
  warning: 'bg-warning-container text-on-warning-container',
  error: 'bg-error-container text-on-error-container',
};

export function Tag({
  tone = 'neutral',
  icon,
  children,
  className,
}: {
  tone?: TagTone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap',
        toneClasses[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
