import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/**
 * Every currency and date string in the app is built here. Port of `MLFormat`.
 *
 * Centralising is not tidiness: `toLocaleDateString()` called ad hoc gives a
 * different result per machine locale, so the same screen reads `dd/mm/yyyy` for
 * one user and `mm/dd/yyyy` for another. This app is pt-BR everywhere, and that
 * is stated once, here.
 */

const currencyFormat = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export const formatCurrency = (value: number): string => currencyFormat.format(value);

/**
 * An age in years, for figures that are not whole — an average, or the median of
 * an even number of patients ("46", "46,5").
 *
 * One decimal at most: a mean age carries no useful precision beyond that, and
 * "46,3333333" reads as a bug. The comma comes from the pt-BR locale, which is
 * exactly why this is not `value.toFixed(1)`.
 */
const ageFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

export const formatAge = (years: number): string => ageFormat.format(years);

/** dd/MM/yyyy */
export const formatDate = (date: Date): string => format(date, 'dd/MM/yyyy', { locale: ptBR });

/** dd/MM */
export const formatDayMonth = (date: Date): string => format(date, 'dd/MM', { locale: ptBR });

/** "Julho de 2025" */
export const formatMonthYear = (date: Date): string =>
  capitalize(format(date, "MMMM 'de' yyyy", { locale: ptBR }));

/** "jul" — short month, no trailing dot. */
export const formatMonthShort = (date: Date): string =>
  format(date, 'MMM', { locale: ptBR }).replace('.', '');

/** "Segunda-feira, 21/07" */
export const formatWeekday = (date: Date): string =>
  capitalize(format(date, 'EEEE, dd/MM', { locale: ptBR }));

/**
 * Age in whole years — the birthday has to have happened this year already,
 * which is why the month/day comparison is there and a plain year subtraction
 * is not enough.
 */
export function ageFromBirthDate(birthDate: Date, reference: Date = new Date()): number {
  let age = reference.getFullYear() - birthDate.getFullYear();
  const hasHadBirthdayThisYear =
    reference.getMonth() > birthDate.getMonth() ||
    (reference.getMonth() === birthDate.getMonth() && reference.getDate() >= birthDate.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

/* ------------------------------------------------------------------------- */
/* Wire dates                                                                */
/* ------------------------------------------------------------------------- */

/**
 * A Postgres `date` column, as `yyyy-MM-dd`.
 *
 * Deliberately **not** `toISOString().split('T')[0]`: `toISOString` converts to
 * UTC first, so in Brazil (UTC−3) a date picked as the 1st at midnight local
 * time is sent as the *previous* month's last day. This formats the local
 * calendar fields as they are, which is what a date-without-time means.
 */
export const toDateColumn = (date: Date): string => format(date, 'yyyy-MM-dd');

/**
 * Reads a `date`/`timestamptz` column back into a `Date`.
 *
 * A bare `yyyy-MM-dd` string is parsed by `new Date()` as **UTC midnight**,
 * which renders as the day before in any negative offset — the same off-by-one
 * as above, in the other direction. `parseISO` treats a date-only string as
 * local, which is what the column means.
 */
export const fromDateColumn = (value: string): Date => parseISO(value);

/** Midnight local time — the comparable form of "which day is this". */
export const dateOnly = (value: Date): Date =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate());

export const isSameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const capitalize = (value: string): string =>
  value.length === 0 ? value : value[0]!.toUpperCase() + value.slice(1);
