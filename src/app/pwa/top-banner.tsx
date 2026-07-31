import type { ReactNode } from 'react';

import { cn } from '@/design-system/cn';

/**
 * The chrome shared by the app's two top banners.
 *
 * It exists because there is exactly one slot: a fixed strip at the top of the
 * viewport, opposite the toast region that owns the bottom. Two components
 * drawing their own `fixed top-0` is how you end up with an update prompt
 * printed over an offline warning, and the bug is invisible until the day both
 * are true at once — which is a day the app is already having a bad time.
 *
 * Sharing the container does not by itself prevent the overlap; it just makes
 * the slot a thing that can be reasoned about. Who yields to whom is decided by
 * the callers, and written down in `offline-banner.tsx`.
 */
export function TopBanner({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      // `polite`, not `assertive`: neither banner is urgent enough to interrupt
      // whatever a screen reader is in the middle of.
      aria-live="polite"
      // The `max()` keeps the banner below the notch when the app is installed
      // and painting under it; without a safe area it is exactly `p-4`.
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))]"
    >
      <div
        className={cn(
          'border-outline bg-surface-container-high text-on-surface pointer-events-auto flex w-full max-w-[460px] flex-wrap items-center gap-3 rounded-l border px-4 py-3 text-sm shadow-lg',
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
