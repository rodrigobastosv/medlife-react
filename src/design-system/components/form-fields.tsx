import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

import { cn } from '@/design-system/cn';
import { ChevronRightIcon } from '@/design-system/components/icons';

/**
 * The three form controls the app uses, each wrapped in the same label/error
 * shell.
 *
 * Two things they all do, and both are about accessibility rather than looks:
 *
 * - **`useId()` ties the label to the control.** A `<label>` that is not linked
 *   to its input is decoration: clicking it does not focus the field and a
 *   screen reader announces the input as unlabelled. `useId` generates an id
 *   that is stable across re-renders and unique per instance, which is exactly
 *   what a hand-written `id="email"` fails at the moment the field is used twice
 *   on one page.
 * - **The error is announced.** `aria-invalid` marks the control as wrong and
 *   `aria-describedby` points at the message, so the reason is read out with the
 *   field instead of being a red string only sighted users get. `role="alert"`
 *   makes it announce the moment it appears.
 *
 * They accept every native attribute, so `react-hook-form`'s `register()` spread
 * (`{...register('email')}` — which passes `name`, `onChange`, `onBlur`, `ref`)
 * lands straight on the underlying element.
 */

/**
 * A field is `bg-surface` with a border, **not** `bg-surface-container`.
 *
 * The container tone is what cards use, and a filled input in the same tone as
 * the card it sits on is invisible — the field reads as a gap in the layout
 * until you click where you guess it is. Contrasting against the card *and*
 * carrying a border means the control is visible on either background: on a card
 * the fill does the work, on the bare page the border does.
 */
const controlClasses = (hasError: boolean): string =>
  cn(
    'bg-surface text-on-surface w-full rounded-m border border-outline px-4 py-2.5 text-base',
    'placeholder:text-on-surface-variant/70',
    'focus:outline-primary focus:outline-2 focus:-outline-offset-1',
    'disabled:opacity-60',
    hasError && 'border-error outline-error outline-1 -outline-offset-1',
  );

interface FieldShellProps {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  className?: string | undefined;
  children: (ids: { controlId: string; describedBy: string | undefined }) => ReactNode;
}

function FieldShell({ label, error, hint, className, children }: FieldShellProps) {
  const controlId = useId();
  const messageId = `${controlId}-message`;
  const message = error ?? hint;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={controlId} className="text-on-surface-variant text-sm font-medium">
        {label}
      </label>
      {children({ controlId, describedBy: message === undefined ? undefined : messageId })}
      {message !== undefined && (
        <p
          id={messageId}
          role={error !== undefined ? 'alert' : undefined}
          className={cn('text-xs', error !== undefined ? 'text-error' : 'text-on-surface-variant')}
        >
          {message}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------- */

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  containerClassName?: string;
}

export function TextField({
  label,
  error,
  hint,
  containerClassName,
  className,
  ...rest
}: TextFieldProps) {
  return (
    <FieldShell label={label} error={error} hint={hint} className={containerClassName}>
      {({ controlId, describedBy }) => (
        <input
          id={controlId}
          aria-invalid={error !== undefined}
          aria-describedby={describedBy}
          className={cn(controlClasses(error !== undefined), className)}
          {...rest}
        />
      )}
    </FieldShell>
  );
}

/* ------------------------------------------------------------------------- */

export interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  /** Rendered before the options — use it for a "not chosen yet" entry. */
  placeholder?: string;
  options: readonly { value: string; label: string }[];
  containerClassName?: string;
}

/**
 * The chevron is **ours**, not the browser's.
 *
 * The native one cannot be positioned: `padding-right` moves it in Firefox and
 * is ignored by Chrome, which pins its arrow a fixed few pixels off the border
 * box — which is the cramped look this replaces. Its colour is equally out of
 * reach, so on the dark theme it stayed a system grey next to `on-surface`
 * text.
 *
 * `appearance-none` removes the native control's chrome only; the popup, the
 * keyboard behaviour and the form semantics are the browser's own and are
 * untouched. The icon is `pointer-events-none` so clicking it still falls
 * through and opens the select, and `pr-11` reserves the lane it sits in so a
 * long option is clipped by the fade of the border rather than running under
 * the arrow.
 */
export function SelectField({
  label,
  error,
  hint,
  placeholder,
  options,
  containerClassName,
  className,
  ...rest
}: SelectFieldProps) {
  return (
    <FieldShell label={label} error={error} hint={hint} className={containerClassName}>
      {({ controlId, describedBy }) => (
        <div className="relative">
          <select
            id={controlId}
            aria-invalid={error !== undefined}
            aria-describedby={describedBy}
            className={cn(
              controlClasses(error !== undefined),
              'h-[46px] appearance-none pr-11',
              className,
            )}
            {...rest}
          >
            {placeholder !== undefined && <option value="">{placeholder}</option>}
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronRightIcon
            className="text-on-surface-variant pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 rotate-90"
            aria-hidden
          />
        </div>
      )}
    </FieldShell>
  );
}

/* ------------------------------------------------------------------------- */

export interface TextAreaFieldProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'id'
> {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  containerClassName?: string;
}

export function TextAreaField({
  label,
  error,
  hint,
  containerClassName,
  className,
  ...rest
}: TextAreaFieldProps) {
  return (
    <FieldShell label={label} error={error} hint={hint} className={containerClassName}>
      {({ controlId, describedBy }) => (
        <textarea
          id={controlId}
          rows={3}
          aria-invalid={error !== undefined}
          aria-describedby={describedBy}
          className={cn(controlClasses(error !== undefined), 'resize-y', className)}
          {...rest}
        />
      )}
    </FieldShell>
  );
}
