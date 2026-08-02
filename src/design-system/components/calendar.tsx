import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';

import { dateOnly, formatMonthYear, isSameDay } from '@/core/format';
import { cn } from '@/design-system/cn';
import { ChevronLeftIcon, ChevronRightIcon } from '@/design-system/components/icons';

/**
 * Port of `MLCalendar`: a month grid whose cells the caller decorates.
 *
 * The calendar knows nothing about appointments. It renders days and calls
 * `renderDayContent` for each one — what a "busy" day looks like is the agenda's
 * business, not the grid's. Keeping that boundary is why the same component
 * could serve a different feature tomorrow without growing an option for it.
 */
export function Calendar({
  month,
  selectedDay,
  onSelectDay,
  onChangeMonth,
  renderDayContent,
}: {
  /** Any date inside the month being shown. */
  month: Date;
  selectedDay: Date | null;
  onSelectDay: (day: Date) => void;
  onChangeMonth: (month: Date) => void;
  renderDayContent?: (day: Date) => ReactNode;
}) {
  const today = dateOnly(new Date());
  const days = monthGrid(month);
  const gridRef = useRef<HTMLDivElement>(null);

  // The cell to focus once it exists. It cannot be focused inline in the key
  // handler, because an arrow key that crosses a month boundary re-renders the
  // whole grid first and the destination cell is not in the DOM yet. This effect
  // runs after that render, which is when it is.
  const pendingFocus = useRef<string | null>(null);
  useEffect(() => {
    const iso = pendingFocus.current;
    if (iso === null) return;
    pendingFocus.current = null;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${iso}"]`)?.focus();
  });

  // Roving tabindex: exactly one day is in the tab order and the arrow keys move
  // between the rest. A month is 42 cells, so without this, reaching the content
  // below the calendar by keyboard meant 42 presses of Tab — and paging to
  // another month meant doing it again.
  const tabbable =
    selectedDay !== null && isSameMonth(selectedDay, month)
      ? selectedDay
      : isSameMonth(today, month)
        ? today
        : new Date(month.getFullYear(), month.getMonth(), 1);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, from: Date) => {
    const target = destinationOf(event.key, from);
    if (target === null) return;

    // The browser would otherwise scroll the page on the arrow and Page keys.
    event.preventDefault();

    // Selection follows focus, rather than focus moving and Enter committing.
    // The selected day *is* the question this calendar asks — the list beside it
    // answers for that day — so a caret that moved without changing anything
    // would be a second, invisible cursor for the user to keep track of.
    if (!isSameMonth(target, month)) {
      onChangeMonth(new Date(target.getFullYear(), target.getMonth(), 1));
    }
    onSelectDay(target);
    pendingFocus.current = isoDay(target);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Mês anterior"
          className="hover:bg-surface-container flex size-9 cursor-pointer items-center justify-center rounded-full transition-colors"
          onClick={() => onChangeMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
        >
          {/* Icons, not the "‹" and "›" glyphs that used to be here. Those are
              punctuation: they render in the body font at whatever weight it
              happens to have, sit optically high in the button, and matched
              nothing else on the screen. */}
          <ChevronLeftIcon />
        </button>
        <span className="font-display font-semibold">{formatMonthYear(month)}</span>
        <button
          type="button"
          aria-label="Próximo mês"
          className="hover:bg-surface-container flex size-9 cursor-pointer items-center justify-center rounded-full transition-colors"
          onClick={() => onChangeMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
        >
          <ChevronRightIcon />
        </button>
      </div>

      <div ref={gridRef} className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((weekday) => (
          <div
            key={weekday}
            className="text-on-surface-variant pb-1 text-center text-[11px] font-semibold"
          >
            {weekday}
          </div>
        ))}

        {days.map(({ date, isCurrentMonth }) => {
          const isSelected = selectedDay !== null && isSameDay(date, selectedDay);
          const isToday = isSameDay(date, today);
          return (
            <button
              // The ISO day is a stable key; the index would re-key every cell
              // on a month change and throw away the DOM for no reason.
              key={date.toISOString()}
              data-day={isoDay(date)}
              type="button"
              tabIndex={isSameDay(date, tabbable) ? 0 : -1}
              // Tells assistive tech which day is chosen — the ring alone is
              // only visible information.
              aria-pressed={isSelected}
              aria-label={date.toLocaleDateString('pt-BR', { dateStyle: 'full' })}
              onClick={() => onSelectDay(date)}
              onKeyDown={(event) => handleKeyDown(event, date)}
              className={cn(
                'rounded-m flex aspect-square cursor-pointer flex-col items-center justify-start gap-0.5 p-1 text-sm transition-colors',
                'hover:bg-surface-container',
                !isCurrentMonth && 'text-on-surface-variant/40',
                isToday && 'ring-primary/50 ring-1',
                isSelected && 'bg-primary text-on-primary hover:bg-primary',
              )}
            >
              <span className={cn('leading-6', isToday && 'font-bold')}>{date.getDate()}</span>
              {renderDayContent?.(date)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;

/**
 * Where a key press lands, or `null` if it is not a key this grid handles.
 *
 * Home and End are the ends of the *week*, not of the month — that is what they
 * mean in every other grid, and a month has no single row to run to.
 */
function destinationOf(key: string, from: Date): Date | null {
  switch (key) {
    case 'ArrowLeft':
      return shiftDays(from, -1);
    case 'ArrowRight':
      return shiftDays(from, 1);
    case 'ArrowUp':
      return shiftDays(from, -7);
    case 'ArrowDown':
      return shiftDays(from, 7);
    case 'Home':
      return shiftDays(from, -from.getDay());
    case 'End':
      return shiftDays(from, 6 - from.getDay());
    case 'PageUp':
      return shiftMonths(from, -1);
    case 'PageDown':
      return shiftMonths(from, 1);
    default:
      return null;
  }
}

const shiftDays = (from: Date, days: number): Date =>
  new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);

/**
 * The same day number in another month, clamped to that month's length.
 *
 * Without the clamp `Date` rolls the overflow forward, and Page Up from 31 March
 * lands on 3 March — a month that did move, by a day count nobody asked for.
 */
function shiftMonths(from: Date, months: number): Date {
  const target = new Date(from.getFullYear(), from.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(from.getDate(), lastDay));
}

const isSameMonth = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

/**
 * A day as `YYYY-MM-DD` in *local* time, for the `data-day` lookup.
 *
 * Deliberately not `toISOString()`, which converts to UTC first and so names the
 * previous day for anyone west of Greenwich — which is every user of this app.
 */
const isoDay = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/**
 * The 6×7 grid for a month, padded with the neighbouring months' days.
 *
 * A fixed six-week grid means the calendar's height never changes between
 * months, so the content under it does not jump when the user pages through.
 */
function monthGrid(month: Date): { date: Date; isCurrentMonth: boolean }[] {
  const firstOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(1 - firstOfMonth.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(
      gridStart.getFullYear(),
      gridStart.getMonth(),
      gridStart.getDate() + index,
    );
    return { date, isCurrentMonth: date.getMonth() === month.getMonth() };
  });
}
