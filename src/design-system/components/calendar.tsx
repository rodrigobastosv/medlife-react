import type { ReactNode } from 'react';

import { dateOnly, formatMonthYear, isSameDay } from '@/core/format';
import { cn } from '@/design-system/cn';

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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Mês anterior"
          className="hover:bg-surface-container size-9 cursor-pointer rounded-full"
          onClick={() => onChangeMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
        >
          ‹
        </button>
        <span className="font-display font-semibold">{formatMonthYear(month)}</span>
        <button
          type="button"
          aria-label="Próximo mês"
          className="hover:bg-surface-container size-9 cursor-pointer rounded-full"
          onClick={() => onChangeMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
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
              type="button"
              // Tells assistive tech which day is chosen — the ring alone is
              // only visible information.
              aria-pressed={isSelected}
              aria-label={date.toLocaleDateString('pt-BR', { dateStyle: 'full' })}
              onClick={() => onSelectDay(date)}
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
