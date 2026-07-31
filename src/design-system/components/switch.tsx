import type { ReactNode } from 'react';

import { cn } from '@/design-system/cn';

/**
 * An on/off control with its label and description.
 *
 * A `<button role="switch">` rather than a styled `<input type="checkbox">`. The
 * two are not interchangeable: a checkbox says "include this in what I am about
 * to submit", a switch says "this takes effect now", and every setting in this
 * app saves the moment it is flipped. Screen readers announce the difference —
 * "ligado/desligado" against "marcado" — and `aria-checked` is what carries the
 * state, not the fact that the knob has slid to the right.
 *
 * The whole row is the target, not just the track. A 44-pixel switch is a hard
 * thing to hit on a phone, and the label beside it is dead space that could have
 * been part of the same tap.
 */
export function Switch({
  label,
  description,
  isOn,
  onToggle,
  isDisabled = false,
  className,
}: {
  label: string;
  description?: ReactNode;
  isOn: boolean;
  onToggle: (next: boolean) => void;
  isDisabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isOn}
      disabled={isDisabled}
      onClick={() => onToggle(!isOn)}
      className={cn(
        'rounded-m flex w-full items-start gap-4 px-4 py-3 text-left transition-colors',
        isDisabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-surface-container cursor-pointer',
        className,
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        {description !== undefined && (
          <span className="text-on-surface-variant mt-0.5 block text-sm">{description}</span>
        )}
      </span>

      {/* `aria-hidden`: the state is already on the button above, and a screen
          reader announcing the track as a second element would read the setting
          twice. `shrink-0` keeps the track from being squeezed by a long label,
          which is what turns a switch into a sliver. */}
      <span
        aria-hidden
        className={cn(
          'mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors',
          isOn ? 'bg-primary' : 'bg-outline',
        )}
      >
        <span
          className={cn(
            'size-5 rounded-full bg-white transition-transform',
            isOn && 'translate-x-5',
          )}
        />
      </span>
    </button>
  );
}
