import type { ReactNode } from 'react';

import { cn } from '@/design-system/cn';
import { Button } from '@/design-system/components/button';

/**
 * Port of `MLEmptyState`.
 *
 * It takes an optional action because an empty state that only apologises wastes
 * the moment: the user is on this screen precisely because they want the thing
 * that is not there yet, so the way to create it belongs right here.
 */
export function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
  className,
}: {
  icon?: ReactNode;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'bg-surface-container flex flex-col items-center gap-2 rounded-l px-6 py-10 text-center',
        className,
      )}
    >
      {icon !== undefined && <span className="text-on-surface-variant [&>svg]:size-8">{icon}</span>}
      <p className="font-display text-base font-semibold">{title}</p>
      {message !== undefined && (
        <p className="text-on-surface-variant max-w-prose text-sm">{message}</p>
      )}
      {actionLabel !== undefined && onAction !== undefined && (
        <Button className="mt-2" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
