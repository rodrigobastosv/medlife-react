import { cn } from '@/design-system/cn';

export type ButtonVariant = 'primary' | 'accent' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

/**
 * `accent` is the warm coral from the palette, for the one action on a screen
 * that creates something ("Nova consulta", "Novo paciente").
 *
 * The token existed from the first port, described as "warm coral for highlights
 * and actions", and was used in exactly one place: a bar colour in the revenue
 * chart. Everything else on every screen was the same teal, which is most of the
 * reason the app read as untouched Material. One warm action per screen against
 * a teal field is the whole point of having a secondary in the scheme.
 *
 * `primary` stays teal, and stays the default. This is an addition, not a
 * repaint: a screen with two coral buttons has lost the emphasis again.
 */
const variantClasses: Record<ButtonVariant, string> = {
  // `color-mix` toward black rather than `brightness-110`. Brightness on a
  // saturated teal or red desaturates toward grey and shifts hue; mixing keeps
  // the brand colour and just darkens it, which is what a hover should do.
  primary: 'bg-primary text-on-primary hover:bg-[color-mix(in_oklab,var(--ml-primary),black_12%)]',
  accent:
    'bg-secondary text-on-secondary hover:bg-[color-mix(in_oklab,var(--ml-secondary),black_12%)]',
  outline: 'border border-outline text-primary hover:bg-surface-container',
  // A ghost button with no resting affordance is indistinguishable from a label.
  // The hairline gives it an edge without competing with `outline`.
  ghost: 'border border-transparent text-on-surface-variant hover:bg-surface-container',
  danger: 'bg-error text-on-error hover:bg-[color-mix(in_oklab,var(--ml-error),black_12%)]',
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
    'transition-[background-color,transform] duration-150',
    // A press should feel like one. Nothing in the app had an :active state, so
    // every click landed with no acknowledgement until the request came back.
    'active:scale-[0.98]',
    variantClasses[variant],
    sizeClasses[size],
    className,
  );
}
