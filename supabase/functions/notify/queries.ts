import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Appointment, NotificationPreferences, UserRole } from './plan.ts';

/**
 * Everything this function reads and writes, in one place.
 *
 * It runs with the **service role**, which bypasses row-level security — it has
 * to, because its job is to look at every user's data and decide who to tell
 * what. That makes this the one place in the whole project where the database's
 * own protection is switched off, so the reads below are written to be explicit
 * about scope rather than relying on a policy to bound them.
 *
 * The reads are **batched across users**, not run per user. A cron that fires
 * every minute must not issue a handful of queries per account per minute; the
 * shape here is a fixed handful of queries per *run*, regardless of how many
 * people are subscribed.
 */

export function serviceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (url === undefined || key === undefined) {
    throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios');
  }

  return createClient(url, key, {
    // No session to persist and no token to refresh: this client is created per
    // invocation and authenticates with a static key. Leaving the defaults on
    // makes it try to use storage that does not exist in the worker.
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface Candidate {
  readonly userId: string;
  readonly role: UserRole;
  readonly preferences: NotificationPreferences;
  readonly timezone: string;
  /**
   * Whose agenda this user is notified about.
   *
   * A doctor's own, for a doctor. For a secretary, **every** doctor she is
   * actively linked to — not the one the app happens to have selected. That
   * selection is a piece of UI state living in one browser's `localStorage`, and
   * a notification sent while nothing is open cannot consult it. It is also the
   * better answer on its own terms: she has patients to call back for each
   * doctor she works for, and a backlog hidden behind a dropdown is a backlog
   * nobody calls.
   */
  readonly ownerIds: readonly string[];
}

/** Everyone who has turned push on and asked for at least one kind. */
export async function fetchCandidates(db: SupabaseClient): Promise<Candidate[]> {
  const { data: prefs, error } = await db
    .from('notification_preferences')
    .select('*')
    .eq('push_enabled', true)
    .or(
      'daily_agenda_enabled.eq.true,recalls_enabled.eq.true,' +
        'new_appointment_enabled.eq.true,upcoming_visit_enabled.eq.true,' +
        'follow_ups_enabled.eq.true',
    );

  if (error !== null) throw new Error(`preferências: ${error.message}`);
  if (prefs === null || prefs.length === 0) return [];

  const userIds = prefs.map((row) => row.user_id as string);

  // The role decides which kinds apply, and for a secretary it also decides that
  // a second lookup is needed. Two small queries rather than an embed: there is
  // no foreign key from `notification_preferences` to `profiles` — both point at
  // `auth.users` — so PostgREST has no relationship to follow.
  const { data: profiles, error: profilesError } = await db
    .from('profiles')
    .select('id, role')
    .in('id', userIds);

  if (profilesError !== null) throw new Error(`perfis: ${profilesError.message}`);

  const roleById = new Map<string, UserRole>(
    (profiles ?? []).map((row) => [row.id as string, toRole(row.role as string | null)]),
  );

  const { data: links, error: linksError } = await db
    .from('doctor_secretaries')
    .select('doctor_id, secretary_id')
    .in('secretary_id', userIds)
    .eq('status', 'active');

  if (linksError !== null) throw new Error(`vínculos: ${linksError.message}`);

  const doctorsBySecretary = new Map<string, string[]>();
  for (const link of links ?? []) {
    const secretaryId = link.secretary_id as string;
    const list = doctorsBySecretary.get(secretaryId) ?? [];
    list.push(link.doctor_id as string);
    doctorsBySecretary.set(secretaryId, list);
  }

  return prefs.flatMap((row) => {
    const userId = row.user_id as string;
    const role = roleById.get(userId) ?? 'doctor';
    const ownerIds = role === 'doctor' ? [userId] : (doctorsBySecretary.get(userId) ?? []);

    // A secretary whose links have all been revoked has no agenda to report on.
    // Dropping her here rather than sending an empty summary is the same rule the
    // planner applies to a day with no consults: silence, not a zero.
    if (ownerIds.length === 0) return [];

    return [
      {
        userId,
        role,
        ownerIds,
        timezone: (row.timezone as string | null) ?? 'America/Sao_Paulo',
        preferences: {
          dailyAgendaEnabled: row.daily_agenda_enabled === true,
          dailyAgendaTime: trimTime(row.daily_agenda_time as string | null, '07:30'),
          recallsEnabled: row.recalls_enabled === true,
          recallsTime: trimTime(row.recalls_time as string | null, '09:00'),
          newAppointmentEnabled: row.new_appointment_enabled === true,
          upcomingVisitEnabled: row.upcoming_visit_enabled === true,
          upcomingLeadMinutes: (row.upcoming_lead_minutes as number | null) ?? 30,
          followUpsEnabled: row.follow_ups_enabled === true,
        },
      },
    ];
  });
}

/**
 * How far back "somebody else marked a consulta" still counts as news.
 *
 * This notification is about something having just happened. A booking from last
 * week is not news — it is in the agenda, where the doctor will see it — and
 * announcing it would be the app catching up out loud on things nobody is
 * waiting for. Two days is enough to cover a weekend when nothing was sent.
 */
const NEW_APPOINTMENT_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

/** How much of the delivery log is still capable of matching a live key. */
const DELIVERY_LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000;

const since = (windowMs: number): string => new Date(Date.now() - windowMs).toISOString();

export interface AppointmentsByOwner {
  readonly onDay: ReadonlyMap<string, Appointment[]>;
  readonly recalls: ReadonlyMap<string, Appointment[]>;
  readonly followUps: ReadonlyMap<string, Appointment[]>;
  readonly foreign: ReadonlyMap<string, Appointment[]>;
}

/**
 * All four appointment reads, for every owner in the run, in four queries.
 *
 * `localDates` is the set of distinct "today"s across the candidates — normally
 * one, more only if users are in different timezones. Passing the set rather
 * than a date per user is what keeps this to one query instead of one per
 * person.
 */
export async function fetchAppointments(
  db: SupabaseClient,
  ownerIds: readonly string[],
  localDates: readonly string[],
): Promise<AppointmentsByOwner> {
  const columns =
    'id, owner_id, patient_id, scheduled_date, scheduled_time, status, created_by, ' +
    'follow_up_date, follow_up_time, patients(full_name)';
  const latestDate = [...localDates].sort().at(-1) ?? localDates[0]!;

  const [onDayResult, recallsResult, followUpsResult, foreignResult] = await Promise.all([
    db
      .from('appointments')
      .select(columns)
      .in('owner_id', ownerIds)
      .in('scheduled_date', localDates),
    db
      .from('appointments')
      .select(columns)
      .in('owner_id', ownerIds)
      .not('recall_date', 'is', null)
      .lte('recall_date', latestDate),
    db
      .from('appointments')
      .select(columns)
      .in('owner_id', ownerIds)
      .not('follow_up_date', 'is', null)
      .lte('follow_up_date', latestDate),
    db
      .from('appointments')
      .select(columns)
      .in('owner_id', ownerIds)
      .not('created_by', 'is', null)
      .gt('created_at', since(NEW_APPOINTMENT_WINDOW_MS)),
  ]);

  for (const result of [onDayResult, recallsResult, followUpsResult, foreignResult]) {
    if (result.error !== null) throw new Error(`consultas: ${result.error.message}`);
  }

  return {
    onDay: groupByOwner(onDayResult.data ?? []),
    recalls: groupByOwner(recallsResult.data ?? []),
    followUps: groupByOwner(followUpsResult.data ?? []),
    // The "created by somebody else" test cannot be expressed as a filter across
    // many owners — PostgREST compares a column to a literal, not to another
    // column — so the row is fetched and the comparison happens here.
    foreign: groupByOwner(
      (foreignResult.data ?? []).filter((row) => row.created_by !== row.owner_id),
    ),
  };
}

/** Keys already sent, for the users in this run. */
export async function fetchDelivered(
  db: SupabaseClient,
  userIds: readonly string[],
): Promise<Map<string, Set<string>>> {
  const { data, error } = await db
    .from('notification_deliveries')
    .select('user_id, dedupe_key')
    .in('user_id', userIds)
    // Bounded, not the whole table. Every live key names either today or an
    // appointment from the last couple of days, so anything older cannot match —
    // and an unbounded read would grow with the project forever.
    .gt('sent_at', since(DELIVERY_LOOKBACK_MS));

  if (error !== null) throw new Error(`entregas: ${error.message}`);

  const byUser = new Map<string, Set<string>>();
  for (const row of data ?? []) {
    const userId = row.user_id as string;
    const set = byUser.get(userId) ?? new Set<string>();
    set.add(row.dedupe_key as string);
    byUser.set(userId, set);
  }
  return byUser;
}

/**
 * Claims the keys for a notification, atomically. Returns whether this run won.
 *
 * This is the heart of the deduplication, and the reason it moved out of the
 * browser. `on conflict do nothing` combined with `returning` makes claiming and
 * recording the *same statement*: two overlapping runs both try to insert, one
 * gets rows back and the other gets none, and only the winner sends. The
 * `localStorage` version could only ever check and then write, with a window in
 * between where both copies believed they were first.
 *
 * All of a notification's keys are claimed together, and a partial win is
 * treated as a loss — the grouped "N novas consultas" must not be sent by one
 * run while another sends the individual notices it was standing in for.
 */
export async function claimDelivery(
  db: SupabaseClient,
  userId: string,
  dedupeKeys: readonly string[],
): Promise<boolean> {
  const { data, error } = await db
    .from('notification_deliveries')
    .upsert(
      dedupeKeys.map((dedupeKey) => ({ user_id: userId, dedupe_key: dedupeKey })),
      { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true },
    )
    .select('dedupe_key');

  if (error !== null) throw new Error(`reserva de envio: ${error.message}`);
  return (data ?? []).length === dedupeKeys.length;
}

/** Releases a claim whose notification could not be sent, so it can be retried. */
export async function releaseDelivery(
  db: SupabaseClient,
  userId: string,
  dedupeKeys: readonly string[],
): Promise<void> {
  await db
    .from('notification_deliveries')
    .delete()
    .eq('user_id', userId)
    .in('dedupe_key', dedupeKeys);
}

export interface StoredSubscription {
  readonly endpoint: string;
  readonly userId: string;
  readonly p256dh: string;
  readonly auth: string;
  readonly failureCount: number;
}

export async function fetchSubscriptions(
  db: SupabaseClient,
  userIds: readonly string[],
): Promise<Map<string, StoredSubscription[]>> {
  const { data, error } = await db
    .from('push_subscriptions')
    .select('endpoint, user_id, p256dh, auth, failure_count')
    .in('user_id', userIds);

  if (error !== null) throw new Error(`inscrições: ${error.message}`);

  const byUser = new Map<string, StoredSubscription[]>();
  for (const row of data ?? []) {
    const userId = row.user_id as string;
    const list = byUser.get(userId) ?? [];
    list.push({
      endpoint: row.endpoint as string,
      userId,
      p256dh: row.p256dh as string,
      auth: row.auth as string,
      failureCount: (row.failure_count as number | null) ?? 0,
    });
    byUser.set(userId, list);
  }
  return byUser;
}

/**
 * A subscription the push service says is gone (410) or unknown (404).
 *
 * Deleted rather than marked. The browser threw this registration away — it will
 * never accept another message — so a row that is kept is a request made on
 * every cron run for the rest of the project's life.
 */
export async function deleteSubscription(db: SupabaseClient, endpoint: string): Promise<void> {
  await db.from('push_subscriptions').delete().eq('endpoint', endpoint);
}

/**
 * Past this many consecutive failures a subscription is dropped.
 *
 * These are the errors that are *not* a clean "gone" — a push service that is
 * down, a network fault, a malformed key. Retrying forever would keep a dead
 * endpoint in every run; giving up on the first failure would drop a live one
 * over a blip. Ten runs of a once-a-minute cron is ten minutes of patience.
 */
const MAX_FAILURES = 10;

export async function recordFailure(
  db: SupabaseClient,
  subscription: StoredSubscription,
): Promise<void> {
  const next = subscription.failureCount + 1;
  if (next >= MAX_FAILURES) {
    await deleteSubscription(db, subscription.endpoint);
    return;
  }
  await db
    .from('push_subscriptions')
    .update({ failure_count: next })
    .eq('endpoint', subscription.endpoint);
}

/** A delivery that worked clears the count and marks the endpoint as alive. */
export async function recordSuccess(db: SupabaseClient, endpoint: string): Promise<void> {
  await db
    .from('push_subscriptions')
    .update({ failure_count: 0, last_seen_at: new Date().toISOString() })
    .eq('endpoint', endpoint);
}

/* ------------------------------------------------------------------------- */

function groupByOwner(rows: readonly Record<string, unknown>[]): Map<string, Appointment[]> {
  const byOwner = new Map<string, Appointment[]>();
  for (const row of rows) {
    const ownerId = row.owner_id as string;
    const list = byOwner.get(ownerId) ?? [];
    const patients = row.patients as { full_name: string | null } | null | undefined;
    list.push({
      id: row.id as string,
      patientId: row.patient_id as string,
      scheduledDate: row.scheduled_date as string,
      scheduledTime: trimTimeOrNull(row.scheduled_time as string | null),
      status: (row.status as string | null) ?? 'scheduled',
      patientName: patients?.full_name ?? null,
      followUpDate: (row.follow_up_date as string | null) ?? null,
      followUpTime: trimTimeOrNull(row.follow_up_time as string | null),
    });
    byOwner.set(ownerId, list);
  }
  return byOwner;
}

/** Postgres sends a `time` as `HH:mm:ss`; everything downstream wants `HH:mm`. */
function trimTimeOrNull(wire: string | null): string | null {
  if (wire === null) return null;
  const match = /^(\d{2}):(\d{2})/.exec(wire);
  return match === null ? null : `${match[1]}:${match[2]}`;
}

function trimTime(wire: string | null, fallback: string): string {
  return trimTimeOrNull(wire) ?? fallback;
}

const toRole = (wire: string | null): UserRole => (wire === 'secretary' ? 'secretary' : 'doctor');
