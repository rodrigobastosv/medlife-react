import { toDateColumn } from '@/core/format';
import type { ReportPeriod } from '@/domain/reports/monthly-report';

/**
 * Every cache key in the app, built here.
 *
 * A query key is what TanStack Query caches by, and what a mutation names when
 * it invalidates. Two rules make the difference between a cache that works and
 * one that serves the wrong data:
 *
 * 1. **Everything the query depends on goes in the key.** Every key below starts
 *    with `ownerId`, because these rows belong to a specific doctor. Leave it out
 *    and a secretary switching doctors keeps seeing the first one's patients —
 *    the request would never even be made, since the cache thinks it already has
 *    the answer.
 * 2. **Keys are hierarchical, from general to specific.** `['patients', owner]`
 *    is a *prefix* of `['patients', owner, id]`, so invalidating the first also
 *    invalidates every patient detail under it. That is why `all` and `detail`
 *    below are built from one another instead of being separate strings.
 *
 * Centralising them also removes the failure mode where a mutation invalidates
 * `['patients']` while the query registered `['patient-list']`, and the screen
 * silently stops refreshing after a save.
 */
export const queryKeys = {
  patients: {
    all: (ownerId: string) => ['patients', ownerId] as const,
    detail: (ownerId: string, patientId: string) => ['patients', ownerId, patientId] as const,
    count: (ownerId: string) => ['patients', ownerId, 'count'] as const,
  },
  appointments: {
    /** The root every appointment query hangs off — invalidate this after a write. */
    all: (ownerId: string) => ['appointments', ownerId] as const,
    forPatient: (ownerId: string, patientId: string) =>
      ['appointments', ownerId, 'patient', patientId] as const,
    recalls: (ownerId: string) => ['appointments', ownerId, 'recalls'] as const,
    returns: (ownerId: string) => ['appointments', ownerId, 'returns'] as const,
    // The month is part of the key: paging the agenda is a different query, not
    // a refetch of the same one — which is what lets the previous month stay
    // cached while the next loads.
    agenda: (ownerId: string, month: Date) =>
      ['appointments', ownerId, 'agenda', toDateColumn(month)] as const,
  },
  reports: {
    monthly: (ownerId: string, period: ReportPeriod) => ['reports', ownerId, period] as const,
  },
  secretaries: {
    all: (doctorId: string) => ['secretaries', doctorId] as const,
  },
} as const;
