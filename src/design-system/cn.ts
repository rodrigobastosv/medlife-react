import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Joins class names, letting the last one win on conflicts.
 *
 * Two libraries, two jobs:
 * - `clsx` flattens conditionals: `cn('p-4', isActive && 'bg-primary')`.
 * - `tailwind-merge` resolves *conflicting* Tailwind utilities. Plain string
 *   concatenation leaves `"px-4 px-8"` in the class list, and which one applies
 *   then depends on their order in the generated stylesheet — not on the order
 *   you wrote them. `twMerge` drops the loser, so a `className` prop passed by a
 *   caller reliably overrides the component's own default.
 *
 * This helper is why every component below accepts `className`: overriding one
 * detail at a call site never requires a new prop.
 */
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));
