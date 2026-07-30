import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/design-system/cn';

/**
 * The app's one surface. Everything that is "a block of content on the page"
 * uses this, so radius, padding and background are decided once.
 */
export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        // A hairline rather than a shadow. This palette has no elevation shadow
        // token, and a border is the honest way to separate a surface from the
        // page in both themes: on the dark theme a drop shadow has nothing
        // lighter to fall against and simply disappears, which is why the
        // single-level version read as flat there.
        'bg-surface-container-low border-outline/70 rounded-l border p-4 sm:p-6',
        className,
      )}
      {...rest}
    >
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
        'bg-surface-container-low border-outline/70 rounded-l border p-4 text-left transition-colors sm:p-6',
        // Hover steps up one surface level instead of jumping to the accent
        // container. The old jump changed hue as well as lightness, which read
        // as a selection rather than as a pointer being over something.
        'hover:bg-surface-container-high cursor-pointer',
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
