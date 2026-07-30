import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/design-system/cn';

/**
 * The app's one surface. Everything that is "a block of content on the page"
 * uses this, so radius, padding and background are decided once.
 */
export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('bg-surface-container rounded-l p-4 sm:p-6', className)} {...rest}>
      {children}
    </div>
  );
}

/**
 * A card that is a link/button.
 *
 * It is a separate component rather than an `onClick` prop on `Card` because the
 * element has to change: a clickable block must be a `<button>` (or an anchor)
 * to be reachable by keyboard and announced as interactive. A `<div onClick>`
 * looks identical and is invisible to anyone not using a mouse — the single most
 * common accessibility bug in React code.
 */
export function CardButton({
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      type="button"
      className={cn(
        'bg-surface-container rounded-l p-4 text-left transition-colors sm:p-6',
        'hover:bg-primary-container/60 cursor-pointer',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn('font-display text-lg font-semibold', className)}>{children}</h2>;
}
