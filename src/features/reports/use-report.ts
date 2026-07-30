import { useQuery } from '@tanstack/react-query';

import { useDataScope } from '@/app/providers/session-context';
import {
  fetchAppointmentsInRange,
  fetchFirstAppointmentDates,
} from '@/data/appointments-repository';
import {
  buildMonthlyReport,
  reportPeriodRange,
  type ReportPeriod,
} from '@/domain/reports/monthly-report';
import { queryKeys } from '@/features/query-keys';

/**
 * The monthly report: two reads, then a pure aggregation.
 *
 * The two requests are started together with `Promise.all` rather than awaited
 * one after the other — they do not depend on each other, so sequencing them
 * would make the page take the sum of their latencies instead of the larger of
 * the two.
 *
 * The aggregation itself is `buildMonthlyReport`, a pure domain function. It
 * lives outside this hook on purpose: the reporting rules (what counts as a new
 * patient, which months get a bucket) are the part most worth testing, and a
 * function that takes appointments and returns a report can be tested without
 * React, a server, or a mock.
 */
export function useMonthlyReportQuery(period: ReportPeriod) {
  const scope = useDataScope();

  return useQuery({
    queryKey: queryKeys.reports.monthly(scope.ownerId, period),
    queryFn: async () => {
      // The range is computed inside the query function so the reference date
      // is taken when the request runs, not on every render.
      const range = reportPeriodRange(period);
      const [appointments, firstAppointmentDates] = await Promise.all([
        fetchAppointmentsInRange(scope, range),
        fetchFirstAppointmentDates(scope, range.to),
      ]);
      return buildMonthlyReport({ appointments, firstAppointmentDates, ...range });
    },
  });
}
