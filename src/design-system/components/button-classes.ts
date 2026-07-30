import { cn } from '@/design-system/cn';

export type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary hover:brightness-110',
  outline: 'border border-outline text-primary hover:bg-surface-container',
  ghost: 'text-on-surface-variant hover:bg-surface-container',
  danger: 'bg-error text-on-error hover:brightness-110',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-11 px-6 text-base gap-2',
};

/**
 * The button's styling, without the button.
 *
 * A `<Link>` that looks like a button must still *be* a link: it navigates, it
 * opens in a new tab on ctrl-click, and a screen reader announces it as a link.
 * Wrapping an `<a>` inside a `<button>` to get the styling produces invalid HTML
 * and breaks both behaviours, so call sites do `<Link className={buttonClasses()}>`
 * instead.
 *
 * It lives in its own file so `button.tsx` exports components and nothing else —
 * the Fast Refresh rule explained in `theme-context.ts`.
 */
export function buttonClasses({
  variant = 'primary',
  size = 'md',
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}): string {
  return cn(
    'inline-flex cursor-pointer items-center justify-center rounded-m font-semibold',
    'transition-[filter,background-color] duration-150',
    variantClasses[variant],
    sizeClasses[size],
    className,
  );
}
