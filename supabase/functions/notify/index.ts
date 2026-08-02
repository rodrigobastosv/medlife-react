import type { SupabaseClient } from '@supabase/supabase-js';
import type { ApplicationServer } from '@negrel/webpush';

import {
  isBirthdayDigestDue,
  planNotifications,
  type DueNotification,
  type PatientRecord,
} from './plan.ts';
import { applicationServer, pathFor, sendPush } from './push.ts';
import {
  claimDelivery,
  deleteSubscription,
  fetchAppointments,
  fetchCandidates,
  fetchDelivered,
  fetchPatientsWithBirthDate,
  fetchSubscriptions,
  recordFailure,
  recordSuccess,
  releaseDelivery,
  serviceClient,
  type Candidate,
  type StoredSubscription,
} from './queries.ts';

/**
 * The notification sender. Invoked once a minute by `pg_cron`.
 *
 * One run is: work out whose clock has reached something, ask the planner what
 * is due, claim it in the database, and push it to every browser that user has
 * registered. Nothing here is stateful — the state is `notification_deliveries`,
 * and it is what makes running this twice harmless.
 *
 * Once a minute, and not less often, because that is the resolution of what is
 * being decided: the summaries are configured to the minute and the reminder
 * lead times are 15, 30 and 60 of them. It is also the tick the rules were
 * written and verified against when they ran in the browser.
 */
Deno.serve(async (request: Request): Promise<Response> => {
  /*
    This function is a public URL. Without a check here, anyone who found it
    could make the app notify every one of its users, as often as they liked —
    so the shared secret is not belt-and-braces, it is the only thing standing
    between the endpoint and that. `pg_cron` sends it as a header; a caller
    without it gets a 401 and no hint about why.
  */
  const expected = Deno.env.get('NOTIFY_SECRET');
  if (expected === undefined || request.headers.get('x-notify-secret') !== expected) {
    return new Response('unauthorized', { status: 401 });
  }

  try {
    const summary = await run();
    return Response.json(summary);
  } catch (error) {
    // Logged and returned as a 500 so the failure shows up in the function logs
    // *and* in `cron.job_run_details`, rather than only in one of the two.
    console.error('notify falhou', error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
});

interface RunSummary {
  candidates: number;
  planned: number;
  sent: number;
  skipped: number;
  removed: number;
}

async function run(): Promise<RunSummary> {
  const db = serviceClient();
  const summary: RunSummary = { candidates: 0, planned: 0, sent: 0, skipped: 0, removed: 0 };

  const candidates = await fetchCandidates(db);
  summary.candidates = candidates.length;
  if (candidates.length === 0) return summary;

  const clocks = new Map(candidates.map((candidate) => [candidate.userId, localClock(candidate)]));
  const userIds = candidates.map((candidate) => candidate.userId);
  const ownerIds = [...new Set(candidates.flatMap((candidate) => candidate.ownerIds))];
  const localDates = [...new Set([...clocks.values()].map((clock) => clock.date))];

  const [appointments, deliveredByUser, subscriptionsByUser] = await Promise.all([
    fetchAppointments(db, ownerIds, localDates),
    fetchDelivered(db, userIds),
    fetchSubscriptions(db, userIds),
  ]);

  /*
    The patient register is read second, and usually not at all.

    Every other read above is bounded by a date — today's appointments, the last
    two days of bookings. "Everyone with a birth date" is bounded by nothing, and
    this function runs once a minute, so fetching it alongside the rest would
    mean pulling every subscribed doctor's whole register 1440 times a day to
    answer a question that changes once. Instead the run asks who is still owed
    today's digest — which needs `delivered`, hence the second round trip — and
    reads the register only for their doctors, on the one run that will actually
    send it.
  */
  const birthdayOwnerIds = [
    ...new Set(
      candidates
        .filter(
          (candidate) =>
            (subscriptionsByUser.get(candidate.userId)?.length ?? 0) > 0 &&
            isBirthdayDigestDue({
              localDate: clocks.get(candidate.userId)!.date,
              localMinutes: clocks.get(candidate.userId)!.minutes,
              role: candidate.role,
              preferences: candidate.preferences,
              delivered: deliveredByUser.get(candidate.userId) ?? new Set<string>(),
            }),
        )
        .flatMap((candidate) => candidate.ownerIds),
    ),
  ];

  const patientsByOwner =
    birthdayOwnerIds.length === 0
      ? new Map<string, PatientRecord[]>()
      : await fetchPatientsWithBirthDate(db, birthdayOwnerIds);

  // Built once for the whole run, not per message: importing the VAPID keys and
  // deriving the signing material is the expensive part of sending.
  const server = await applicationServer();

  for (const candidate of candidates) {
    const subscriptions = subscriptionsByUser.get(candidate.userId) ?? [];
    // A user with the switches on but no registered browser has nothing that can
    // receive this. Planning for them anyway would claim the dedupe keys and
    // burn the occurrence without anyone being told.
    if (subscriptions.length === 0) continue;

    const clock = clocks.get(candidate.userId)!;

    const due = planNotifications({
      localDate: clock.date,
      localMinutes: clock.minutes,
      role: candidate.role,
      preferences: candidate.preferences,
      // A secretary linked to two doctors sees both agendas as one list, which is
      // what her day actually looks like.
      todayAppointments: candidate.ownerIds.flatMap((id) => appointments.onDay.get(id) ?? []),
      pendingRecalls: candidate.ownerIds.flatMap((id) => appointments.recalls.get(id) ?? []),
      pendingFollowUps: candidate.ownerIds.flatMap((id) => appointments.followUps.get(id) ?? []),
      foreignAppointments: candidate.ownerIds.flatMap((id) => appointments.foreign.get(id) ?? []),
      // Empty unless this user's digest was the reason the register was read at
      // all — the planner reaches the same verdict from the same predicate, so
      // an empty list here is never a birthday that went missing.
      patients: candidate.ownerIds.flatMap((id) => patientsByOwner.get(id) ?? []),
      delivered: deliveredByUser.get(candidate.userId) ?? new Set<string>(),
    });

    summary.planned += due.length;

    for (const notification of due) {
      const outcome = await deliverToUser(db, server, candidate, subscriptions, notification);
      summary.sent += outcome.sent;
      summary.skipped += outcome.skipped;
      summary.removed += outcome.removed;
    }
  }

  return summary;
}

/**
 * Claims a notification, then pushes it to every browser the user has.
 *
 * The claim comes **first**, and losing it means another run got there — so this
 * one stops rather than sending a duplicate. The claim is released again if not
 * a single browser could be reached, because an occurrence that was never
 * delivered should be retried on the next run rather than marked as done.
 */
async function deliverToUser(
  db: SupabaseClient,
  server: ApplicationServer,
  candidate: Candidate,
  subscriptions: readonly StoredSubscription[],
  notification: DueNotification,
): Promise<{ sent: number; skipped: number; removed: number }> {
  const won = await claimDelivery(db, candidate.userId, notification.dedupeKeys);
  if (!won) return { sent: 0, skipped: 1, removed: 0 };

  const path = pathFor(notification.target);
  let sent = 0;
  let removed = 0;

  for (const subscription of subscriptions) {
    const outcome = await sendPush(server, subscription, notification, path);

    if (outcome === 'sent') {
      sent += 1;
      await recordSuccess(db, subscription.endpoint);
    } else if (outcome === 'gone') {
      removed += 1;
      await deleteSubscription(db, subscription.endpoint);
    } else {
      await recordFailure(db, subscription);
    }
  }

  if (sent === 0) {
    // Nothing got through. `gone` counts as a real outcome — the browser is
    // deliberately unsubscribed and there is nobody to tell — so only a run
    // where every attempt *failed* is worth retrying.
    if (removed === 0) await releaseDelivery(db, candidate.userId, notification.dedupeKeys);
    return { sent: 0, skipped: 1, removed };
  }

  return { sent, skipped: 0, removed };
}

/**
 * The user's own wall clock: today's date and how far into the day it is.
 *
 * Resolved with `Intl` against the timezone stored on their preferences, because
 * `scheduled_date` and `scheduled_time` are a bare `date` and `time` — clinic
 * wall-clock, with no instant attached. Comparing them against UTC, which is what
 * this function's `Date.now()` means, would shift the whole schedule by the
 * offset: in Brazil the 07:30 summary would arrive at 04:30 and the last
 * appointments of a day would belong to the next one.
 *
 * `en-CA` is not a stylistic choice — it is the locale whose short date format is
 * ISO `yyyy-MM-dd`, which is exactly the shape `scheduled_date` is compared
 * against.
 */
function localClock(candidate: Candidate): { date: string; minutes: number } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: candidate.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = new Map(formatter.formatToParts(new Date()).map((part) => [part.type, part.value]));
  const hour = Number(parts.get('hour') ?? '0');

  return {
    date: `${parts.get('year')}-${parts.get('month')}-${parts.get('day')}`,
    // `hour12: false` still renders midnight as "24" in some ICU versions, which
    // would put the first minute of the day past the end of it.
    minutes: (hour === 24 ? 0 : hour) * 60 + Number(parts.get('minute') ?? '0'),
  };
}
