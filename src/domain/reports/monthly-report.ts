import { appointmentAmount, type Appointment } from '@/domain/appointments/appointment';
import type { PaymentMethod } from '@/domain/appointments/appointment-enums';

/* ------------------------------------------------------------------------- */
/* Period                                                                    */
/* ------------------------------------------------------------------------- */

export const REPORT_PERIODS = ['this_year', 'last_12_months'] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];

export const reportPeriodLabel: Record<ReportPeriod, string> = {
  this_year: 'Este ano',
  last_12_months: 'Últimos 12 meses',
};

/**
 * The bounds of the period, relative to a reference date (normally today).
 *
 * `new Date(year, month + 1, 0)` is the idiomatic "last day of that month": day
 * zero of the next month is the previous month's last day, and the constructor
 * rolls a month index of 12 into January of the next year on its own.
 */
export function reportPeriodRange(
  period: ReportPeriod,
  reference: Date = new Date(),
): { from: Date; to: Date } {
  switch (period) {
    case 'this_year':
      return {
        from: new Date(reference.getFullYear(), 0, 1),
        to: new Date(reference.getFullYear(), 11, 31),
      };
    case 'last_12_months':
      return {
        from: new Date(reference.getFullYear(), reference.getMonth() - 11, 1),
        to: new Date(reference.getFullYear(), reference.getMonth() + 1, 0),
      };
  }
}

/* ------------------------------------------------------------------------- */
/* Report                                                                    */
/* ------------------------------------------------------------------------- */

/** One month's aggregate: revenue, appointment count, new patients. */
export interface MonthlyStat {
  readonly month: Date;
  readonly revenue: number;
  readonly count: number;
  /** Patients whose *first ever* appointment fell in this month. */
  readonly newPatients: number;
}

export interface MonthlyReport {
  readonly months: readonly MonthlyStat[];
  readonly totalRevenue: number;
  readonly totalCount: number;
  /** Appointments with amount > 0 — the base of the average ticket. */
  readonly paidCount: number;
  readonly totalNewPatients: number;
  readonly paymentCounts: ReadonlyMap<PaymentMethod, number>;
}

export const averageTicket = (report: MonthlyReport): number =>
  report.paidCount === 0 ? 0 : report.totalRevenue / report.paidCount;

/**
 * No appointment in the period means no report at all: every first visit is also
 * a visit, so a zero `totalCount` implies zero new patients too.
 */
export const isReportEmpty = (report: MonthlyReport): boolean => report.totalCount === 0;

/**
 * Builds the report from the two reads it needs.
 *
 * `firstAppointmentDates` is one date per patient — the earliest appointment in
 * that patient's **entire** history, not just within the period. That is
 * deliberate: a patient from two years ago who came back this month is not a new
 * patient, and a query scoped to the period would count them as one. Dates that
 * fall before the period simply land in no bucket and are ignored, which is why
 * the total is only incremented alongside a bucket.
 *
 * This is a pure function: same inputs, same output, no clock and no network.
 * That is what makes the whole reporting rule testable in isolation — and it is
 * the React equivalent of the Flutter app's use case.
 */
export function buildMonthlyReport(input: {
  appointments: readonly Appointment[];
  firstAppointmentDates: readonly Date[];
  from: Date;
  to: Date;
}): MonthlyReport {
  const { appointments, firstAppointmentDates, from, to } = input;

  // One bucket per month in the range, including months with no movement — a
  // gap in a chart has to be drawn as a zero, not skipped.
  const buckets = new Map<
    number,
    { month: Date; revenue: number; count: number; newPatients: number }
  >();
  const lastMonth = new Date(to.getFullYear(), to.getMonth(), 1);
  for (
    let month = new Date(from.getFullYear(), from.getMonth(), 1);
    month <= lastMonth;
    month = new Date(month.getFullYear(), month.getMonth() + 1, 1)
  ) {
    buckets.set(month.getTime(), { month, revenue: 0, count: 0, newPatients: 0 });
  }

  let totalRevenue = 0;
  let totalCount = 0;
  let paidCount = 0;
  const paymentCounts = new Map<PaymentMethod, number>();

  for (const appointment of appointments) {
    const amount = appointmentAmount(appointment);
    const bucket = buckets.get(monthKey(appointment.scheduledDate));
    if (bucket !== undefined) {
      bucket.revenue += amount;
      bucket.count += 1;
    }
    totalRevenue += amount;
    totalCount += 1;
    if (amount > 0) paidCount += 1;

    const method = appointment.finance?.paymentMethod;
    if (method != null) paymentCounts.set(method, (paymentCounts.get(method) ?? 0) + 1);
  }

  let totalNewPatients = 0;
  for (const date of firstAppointmentDates) {
    const bucket = buckets.get(monthKey(date));
    if (bucket !== undefined) {
      bucket.newPatients += 1;
      totalNewPatients += 1;
    }
  }

  const months = [...buckets.values()]
    .map(({ month, revenue, count, newPatients }) => ({ month, revenue, count, newPatients }))
    .sort((a, b) => a.month.getTime() - b.month.getTime());

  return { months, totalRevenue, totalCount, paidCount, totalNewPatients, paymentCounts };
}

/** Milliseconds at midnight on the 1st — a comparable identity for "which month". */
const monthKey = (date: Date): number => new Date(date.getFullYear(), date.getMonth(), 1).getTime();
