import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from '@/design-system/cn';
import {
  buttonClasses,
  type ButtonSize,
  type ButtonVariant,
} from '@/design-system/components/button-classes';
import { Spinner } from '@/design-system/components/spinner';

/**
 * Extending `ButtonHTMLAttributes` rather than listing props by hand is the
 * point of this type: `type`, `disabled`, `aria-*`, `onClick`, `form` and every
 * other native attribute keep working, and the component only has to describe
 * what it *adds*. Wrapping a native element and accidentally hiding half its API
 * is the most common way a design system becomes something people work around.
 */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and blocks input. Use it for the duration of a mutation. */
  isLoading?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  icon,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      // A button inside a <form> defaults to type="submit", which submits the
      // form on click. Defaulting to "button" here means an action button can
      // never submit a form by accident; a real submit passes type="submit".
      type={type}
      disabled={disabled === true || isLoading}
      // Screen readers get told the control is busy; sighted users see the
      // spinner. Both need to know.
      aria-busy={isLoading}
      className={cn(
        buttonClasses({ variant, size }),
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...rest}
    >
      {isLoading ? <Spinner className="size-4" /> : icon}
      {children}
    </button>
  );
}
