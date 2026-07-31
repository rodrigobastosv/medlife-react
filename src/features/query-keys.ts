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
    /**
     * "Is this CPF already taken?", keyed by the digits rather than by what was
     * typed — "123.456.789-01" and "12345678901" are one question, and keying
     * by the raw text would ask it twice and cache two answers to it.
     *
     * Under the `patients` prefix on purpose: saving a patient invalidates the
     * prefix, so the CPF just consumed stops being reported as free.
     */
    byCpf: (ownerId: string, cpfDigits: string) => ['patients', ownerId, 'cpf', cpfDigits] as const,
  },
  appointments: {
    /** The root every appointment query hangs off — invalidate this after a write. */
    all: (ownerId: string) => ['appointments', ownerId] as const,
    forPatient: (ownerId: string, patientId: string) =>
      ['appointments', ownerId, 'patient', patientId] as const,
    recalls: (ownerId: string) => ['appointments', ownerId, 'recalls'] as const,
    // The day is in the key so that crossing midnight with the app open is a
    // different query rather than a stale one — the cache cannot know the date
    // moved on its own.
    onDay: (ownerId: string, day: Date) =>
      ['appointments', ownerId, 'day', toDateColumn(day)] as const,
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
  notifications: {
    /**
     * Whether *this browser* is registered to receive push.
     *
     * Not server state at all — the answer comes from `pushManager`, and the
     * browser is the authority on it. It is cached here anyway because it is
     * async state with the same loading and invalidation needs as a query, and
     * because a mutation elsewhere (subscribing) has to be able to name it. The
     * `userId` is in the key so signing in as somebody else does not inherit the
     * previous user's answer.
     */
    pushRegistration: (userId: string) => ['push-registration', userId] as const,
    /**
     * The one key in this file with no `ownerId`, and on purpose.
     *
     * Rule 1 above says everything the query depends on goes in the key — and
     * this query does not depend on the active doctor. Notification preferences
     * belong to the *person signed in*, so a secretary linked to three doctors
     * has one set of them; keying by owner would refetch the same row under
     * three names and, worse, imply she can be reachable differently depending
     * on whose agenda she happens to be looking at.
     *
     * If you are here to "fix" the missing `ownerId`: this is the rule working,
     * not an omission.
     */
    preferences: (userId: string) => ['notification-preferences', userId] as const,
  },
} as const;
