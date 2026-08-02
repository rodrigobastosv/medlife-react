/**
 * Deciding what to notify, separated from delivering it.
 *
 * This module moved here from `src/domain/notifications/notification-plan.ts`
 * when notifications stopped being fired by the browser and started being sent
 * by the server. It is a **move, not a copy** — the browser version was deleted
 * in the same change, because two copies of a rule are two rules the moment one
 * of them is edited.
 *
 * It could not simply be imported: the Supabase CLI bundles the function's own
 * directory, and reaching up into `src/` is not something a deploy should
 * depend on. So the rules live here now, and the client keeps only the parts it
 * still needs (the kinds, the preferences, the permission wrapper).
 *
 * One thing did change in the move, and it is worth knowing about: the clock is
 * no longer a `Date`. On the server "now" is meaningless until a timezone is
 * named — the appointments are recorded in clinic wall-clock time — so Postgres
 * resolves each user's local date and local time-of-day, and this module
 * receives them already resolved. Everything downstream is string and integer
 * comparison, with no timezone left to get wrong.
 */

export type UserRole = 'doctor' | 'secretary';

export const NOTIFICATION_KINDS = [
  'dailyAgenda',
  'recalls',
  'birthdays',
  'newAppointment',
  'upcomingVisit',
  'followUps',
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/**
 * Which roles each kind is offered to. Mirrors `notificationKindRoles` in
 * `src/domain/notifications/notification-kind.ts`, which is what the settings
 * screen renders from.
 *
 * The duplication is deliberate and small: it is a *shape* crossing a
 * client/server boundary that cannot import across itself, not a second copy of
 * a rule. Checking it here as well is the point — a preference row outlives the
 * role that wrote it, and a switch merely hidden in the UI is not a switch that
 * is off.
 */
const KIND_ROLES: Record<NotificationKind, readonly UserRole[]> = {
  dailyAgenda: ['doctor', 'secretary'],
  recalls: ['doctor', 'secretary'],
  birthdays: ['doctor', 'secretary'],
  newAppointment: ['doctor'],
  upcomingVisit: ['doctor', 'secretary'],
  // Doctor-only, and checked here rather than trusted from the client: an
  // acompanhamento is the doctor asking a patient how they are, which is not
  // work a secretary can take over. A preference row outlives the role that
  // wrote it, so a switch merely hidden in the UI is not a switch that is off.
  followUps: ['doctor'],
};

export interface NotificationPreferences {
  readonly dailyAgendaEnabled: boolean;
  /** `HH:mm` in the user's own timezone. */
  readonly dailyAgendaTime: string;
  readonly recallsEnabled: boolean;
  readonly recallsTime: string;
  readonly birthdaysEnabled: boolean;
  /** `HH:mm` — a birthday is a date with no hour, so the digest needs one. */
  readonly birthdaysTime: string;
  readonly newAppointmentEnabled: boolean;
  readonly upcomingVisitEnabled: boolean;
  readonly upcomingLeadMinutes: number;
  /** No companion time: each acompanhamento carries its own. */
  readonly followUpsEnabled: boolean;
}

/**
 * An appointment, as this module needs it.
 *
 * Dates are `yyyy-MM-dd` strings and times are `HH:mm` strings, exactly as the
 * columns hold them, and deliberately not parsed into `Date`. A `date` column is
 * a calendar day with no instant attached; turning it into a `Date` on a server
 * running in UTC invents a midnight and then compares it against a clinic's
 * wall clock, which is the classic way this kind of code goes wrong by a day.
 */
export interface Appointment {
  readonly id: string;
  readonly patientId: string;
  /** `yyyy-MM-dd`. */
  readonly scheduledDate: string;
  /** `HH:mm`, or null on rows written before the column existed. */
  readonly scheduledTime: string | null;
  readonly status: string;
  readonly patientName: string | null;
  /** `yyyy-MM-dd`, or null when no acompanhamento was marked. */
  readonly followUpDate: string | null;
  /** `HH:mm`, or null — the form leaves the hour optional. */
  readonly followUpTime: string | null;
}

/**
 * A patient, as the birthday digest needs them.
 *
 * `birthDate` is a `yyyy-MM-dd` string and stays one, for the same reason the
 * appointment dates do — but here the argument is stronger. A birth date is a
 * calendar day whose *year* belongs to a different era from the comparison being
 * made: matching it against today means comparing the month and the day and
 * nothing else. Parsing it into a `Date` would invite exactly the mistake of
 * building "this year's birthday" and comparing whole instants, which matches
 * nobody. Rows with no birth date never reach this type.
 */
export interface PatientRecord {
  readonly id: string;
  readonly fullName: string | null;
  /** `yyyy-MM-dd`, never null — the query filters the empty ones out. */
  readonly birthDate: string;
}

/** Where clicking the notification should land, in domain terms. */
export type NotificationTarget =
  | { readonly screen: 'home' }
  | { readonly screen: 'agenda' }
  | { readonly screen: 'patient'; readonly patientId: string };

export interface DueNotification {
  readonly kind: NotificationKind;
  readonly title: string;
  readonly body: string;
  /**
   * The browser's `tag`. Two notifications with the same tag replace each other
   * instead of stacking.
   */
  readonly tag: string;
  /**
   * What to claim in `notification_deliveries` before sending. Usually one key;
   * the grouped "N novas consultas" carries one per appointment it stands for,
   * so none of them can come back individually on the next run.
   */
  readonly dedupeKeys: readonly string[];
  readonly target: NotificationTarget;
}

/**
 * What `planBirthdays` needs to know before anyone has looked at a patient.
 *
 * Split out of the snapshot so `index.ts` can ask "is this digest due?" *before*
 * deciding to read the register — see `isBirthdayDigestDue`.
 */
export interface BirthdayDigestContext {
  readonly localDate: string;
  readonly localMinutes: number;
  readonly role: UserRole;
  readonly preferences: Pick<NotificationPreferences, 'birthdaysEnabled' | 'birthdaysTime'>;
  readonly delivered: ReadonlySet<string>;
}

export interface NotificationSnapshot extends BirthdayDigestContext {
  /** Today in the user's timezone, `yyyy-MM-dd`, resolved by Postgres. */
  readonly localDate: string;
  /** Minutes since local midnight, resolved by Postgres. */
  readonly localMinutes: number;
  readonly role: UserRole;
  readonly preferences: NotificationPreferences;
  /** Everything scheduled for the user's local today. */
  readonly todayAppointments: readonly Appointment[];
  /** Recalls whose date has already arrived. */
  readonly pendingRecalls: readonly Appointment[];
  /** Acompanhamentos whose date has already arrived. */
  readonly pendingFollowUps: readonly Appointment[];
  /** Appointments on this doctor's agenda that somebody else created. */
  readonly foreignAppointments: readonly Appointment[];
  /**
   * Every patient of this user's doctors who has a birth date recorded — *not*
   * only today's birthdays. Which of them is celebrating is a rule, and it is
   * `birthdaysOn` below rather than a query.
   *
   * Empty on the runs where no birthday digest is due, because the register is
   * not read at all then. That is safe precisely because the emptiness and the
   * skip are decided by the same predicate.
   */
  readonly patients: readonly PatientRecord[];
  /** Keys already in `notification_deliveries` for this user. */
  readonly delivered: ReadonlySet<string>;
}

/**
 * Past this many at once, the individual "Fulana marcou uma consulta" notices
 * collapse into a single count.
 *
 * Less critical than it was when the browser had to catch up on a week of
 * missed events, but still real: a secretary filling a morning's agenda in one
 * sitting produces a burst, and three is about where a stack of notices stops
 * being information and starts being something you swipe away without reading.
 */
const MAX_INDIVIDUAL_NEW_APPOINTMENTS = 3;

export function planNotifications(snapshot: NotificationSnapshot): DueNotification[] {
  const due = [
    ...planDailyAgenda(snapshot),
    ...planRecalls(snapshot),
    ...planBirthdays(snapshot),
    ...planNewAppointments(snapshot),
    ...planUpcomingVisits(snapshot),
    ...planFollowUps(snapshot),
  ];

  return due.filter(
    (notification) =>
      KIND_ROLES[notification.kind].includes(snapshot.role) &&
      // Due only if no key it stands for has been claimed yet. The claim itself
      // happens in Postgres, atomically — this is the cheap filter that keeps
      // the function from trying to claim what it already knows is taken.
      notification.dedupeKeys.every((key) => !snapshot.delivered.has(key)),
  );
}

/* ------------------------------------------------------------------------- */
/* The kinds                                                                 */
/* ------------------------------------------------------------------------- */

function planDailyAgenda(snapshot: NotificationSnapshot): DueNotification[] {
  const { localDate, localMinutes, preferences, todayAppointments } = snapshot;
  if (!preferences.dailyAgendaEnabled) return [];
  if (!hasReached(localMinutes, preferences.dailyAgendaTime)) return [];

  // Cancelled consults are not part of "your day". Counting them would have the
  // app announce four appointments to someone whose morning has two.
  const count = todayAppointments.filter(isActive).length;
  // Nothing scheduled is not news. A push that says "nenhuma consulta hoje" is a
  // phone buzzing to report the absence of an event, which is the fastest way to
  // teach someone to turn notifications off.
  if (count === 0) return [];

  return [
    {
      kind: 'dailyAgenda',
      title: 'Consultas de hoje',
      body: count === 1 ? 'Você tem 1 consulta hoje.' : `Você tem ${String(count)} consultas hoje.`,
      // The day, not the moment: this is what makes the rule "once per calendar
      // day" rather than "once per cron run", so the run at 07:31 does not
      // repeat what the run at 07:30 already said.
      tag: `agenda:${localDate}`,
      dedupeKeys: [`agenda:${localDate}`],
      target: { screen: 'home' },
    },
  ];
}

function planRecalls(snapshot: NotificationSnapshot): DueNotification[] {
  const { localDate, localMinutes, preferences, pendingRecalls } = snapshot;
  if (!preferences.recallsEnabled) return [];
  if (!hasReached(localMinutes, preferences.recallsTime)) return [];

  const count = pendingRecalls.length;
  if (count === 0) return [];

  return [
    {
      kind: 'recalls',
      title: 'Pacientes para ligar',
      body:
        count === 1
          ? '1 paciente está esperando contato.'
          : `${String(count)} pacientes estão esperando contato.`,
      tag: `recalls:${localDate}`,
      dedupeKeys: [`recalls:${localDate}`],
      target: { screen: 'home' },
    },
  ];
}

/**
 * Whether today's birthday digest is still owed to this user.
 *
 * Exported because `index.ts` uses it as a gate on reading the patient register
 * at all: the answer is false on all but one run a day, and the read it saves is
 * "every patient of every subscribed doctor", once a minute, forever. Keeping
 * the test here rather than rewriting it at the call site is what guarantees the
 * gate and the planner cannot drift apart — a snapshot with no patients is only
 * ever produced when this said there was nothing to send.
 */
export function isBirthdayDigestDue(context: BirthdayDigestContext): boolean {
  if (!KIND_ROLES.birthdays.includes(context.role)) return false;
  if (!context.preferences.birthdaysEnabled) return false;
  if (!hasReached(context.localMinutes, context.preferences.birthdaysTime)) return false;
  return !context.delivered.has(birthdaysKey(context.localDate));
}

/**
 * "Quem faz aniversário hoje", once a day, at the hour the user chose.
 *
 * A digest like the recalls one, and for the same reason: a birthday is a date
 * with no hour, so there is no moment of its own to fire at. The difference is
 * that a single birthday is worth naming — the useful next step is the patient's
 * record, where the phone number is — while four are worth counting, because a
 * notification listing four names is a paragraph on a lock screen.
 */
function planBirthdays(snapshot: NotificationSnapshot): DueNotification[] {
  if (!isBirthdayDigestDue(snapshot)) return [];

  const celebrating = birthdaysOn(snapshot.patients, snapshot.localDate);
  // A quiet day is silence, not a "nenhum aniversariante hoje" that buzzes a
  // phone to report the absence of an event — the same rule the daily agenda
  // applies to a day with no consults.
  if (celebrating.length === 0) return [];

  const first = celebrating[0]!;
  const single = celebrating.length === 1;

  return [
    {
      kind: 'birthdays',
      title: single ? 'Aniversariante de hoje' : 'Aniversariantes de hoje',
      body: single
        ? describeBirthday(first, snapshot.localDate)
        : `${String(celebrating.length)} pacientes fazem aniversário hoje.`,
      // The day, so the digest is once per calendar day rather than once per
      // cron run — and so the shape above (one name or a count) can change
      // between runs without either version being sent twice.
      tag: birthdaysKey(snapshot.localDate),
      dedupeKeys: [birthdaysKey(snapshot.localDate)],
      // One name earns a link to that record; a count has no single record to
      // open, and Início is where the month's list already lives.
      target: single ? { screen: 'patient', patientId: first.id } : { screen: 'home' },
    },
  ];
}

function planNewAppointments(snapshot: NotificationSnapshot): DueNotification[] {
  const { preferences, foreignAppointments, delivered } = snapshot;
  if (!preferences.newAppointmentEnabled) return [];

  // Filtered before the grouping decision, not after: five appointments of which
  // four are already known is one new appointment, and it should arrive as the
  // individual notice it is rather than as a count of five.
  const fresh = foreignAppointments.filter(
    (appointment) => !delivered.has(createdKey(appointment.id)),
  );
  if (fresh.length === 0) return [];

  if (fresh.length > MAX_INDIVIDUAL_NEW_APPOINTMENTS) {
    return [
      {
        kind: 'newAppointment',
        title: 'Novas consultas na sua agenda',
        body: `${String(fresh.length)} consultas foram marcadas por outra pessoa.`,
        tag: 'created:group',
        // Every id it stands for. Without this the group would be sent, and then
        // each appointment inside it would arrive again individually on the next
        // run — nothing would record that they were covered.
        dedupeKeys: fresh.map((appointment) => createdKey(appointment.id)),
        target: { screen: 'agenda' },
      },
    ];
  }

  return fresh.map((appointment) => ({
    kind: 'newAppointment' as const,
    title: 'Nova consulta marcada',
    body: describeNewAppointment(appointment),
    tag: createdKey(appointment.id),
    dedupeKeys: [createdKey(appointment.id)],
    // The patient's record, not the agenda: the question this notification
    // raises is "who is this and why are they coming", and that is one screen.
    target: { screen: 'patient', patientId: appointment.patientId },
  }));
}

function planUpcomingVisits(snapshot: NotificationSnapshot): DueNotification[] {
  const { localDate, localMinutes, preferences, todayAppointments } = snapshot;
  if (!preferences.upcomingVisitEnabled) return [];

  const lead = preferences.upcomingLeadMinutes;

  return todayAppointments.filter(isActive).flatMap((appointment) => {
    const minutesUntil = minutesUntilAppointment(appointment, localDate, localMinutes);
    // `null` covers both the rows written before `scheduled_time` existed and
    // anything scheduled for another day. A legacy row has no time to remind
    // anyone about, and treating its absence as midnight would fire a reminder
    // for every one of them at 00:00.
    if (minutesUntil === null) return [];
    // The lower bound is zero, not negative: a consult that has already started
    // does not need announcing.
    if (minutesUntil < 0 || minutesUntil > lead) return [];

    return [
      {
        kind: 'upcomingVisit' as const,
        title: 'Consulta em breve',
        body: describeUpcoming(appointment, minutesUntil),
        tag: upcomingKey(appointment.id),
        dedupeKeys: [upcomingKey(appointment.id)],
        target: { screen: 'patient', patientId: appointment.patientId },
      },
    ];
  });
}

/**
 * One notice per acompanhamento, at the hour the doctor chose for it.
 *
 * The shape is the opposite of `planRecalls` on purpose. A recall has only a
 * date, so its notification is a daily digest — "N pacientes esperando contato"
 * — sent at an hour configured once in Ajustes. An acompanhamento carries its
 * own hour, picked per patient because that is when the patient can talk, so a
 * digest would deliberately arrive at the wrong moment. Here the appointment's
 * own time is the schedule and the notice names the person.
 *
 * The dedupe key has no date in it, which makes this fire **once, ever**, rather
 * than every morning until the doctor clears the field. Nothing marks an
 * acompanhamento as done — the row simply keeps its date — so a key of
 * `followup:<id>:<day>` would nag daily about a call that was made on the first
 * one. The backlog on Início is what remembers; this only says "now".
 */
function planFollowUps(snapshot: NotificationSnapshot): DueNotification[] {
  const { localDate, localMinutes, preferences, pendingFollowUps } = snapshot;
  if (!preferences.followUpsEnabled) return [];

  return pendingFollowUps.filter(isActive).flatMap((appointment) => {
    if (appointment.followUpDate === null) return [];

    // Only today's acompanhamentos wait for their hour. One left over from an
    // earlier day is already late, and holding it until its old time on a new
    // day would be an alarm for a moment that has passed.
    if (appointment.followUpDate === localDate) {
      // Null means the start of the day rather than a missing schedule, which is
      // the same reading the `nulls first` index and the form's hint give it.
      if (!hasReached(localMinutes, appointment.followUpTime ?? '00:00')) return [];
    }

    return [
      {
        kind: 'followUps' as const,
        title: 'Acompanhamento de paciente',
        body: describeFollowUp(appointment),
        tag: followUpKey(appointment.id),
        dedupeKeys: [followUpKey(appointment.id)],
        // The patient's record: the question is "what did we say last time",
        // and that is one screen away from the answer.
        target: { screen: 'patient', patientId: appointment.patientId },
      },
    ];
  });
}

/* ------------------------------------------------------------------------- */
/* Keys                                                                      */
/* ------------------------------------------------------------------------- */

/*
  A dedupe key names the *occurrence*, never the moment it was sent.

  That distinction is what makes a once-a-minute cron safe. If the log stored
  "last sent at 07:30" the code would have to reason about how much time has
  passed since; storing "the summary for 2026-07-31 has been sent" means the same
  occurrence recognises itself on the next run, and after a redeploy, and after
  the function times out halfway through — without any arithmetic at all.

  These strings are also the primary key of `notification_deliveries`, so the
  rule is not merely observed by this module: it is enforced by Postgres.
*/

const birthdaysKey = (localDate: string): string => `birthdays:${localDate}`;
const createdKey = (appointmentId: string): string => `created:${appointmentId}`;
const upcomingKey = (appointmentId: string): string => `upcoming:${appointmentId}`;
const followUpKey = (appointmentId: string): string => `followup:${appointmentId}`;

/* ------------------------------------------------------------------------- */
/* Clock and text                                                            */
/* ------------------------------------------------------------------------- */

/** `HH:mm` as minutes since midnight, or null if it is not a clock reading. */
function minutesOfDay(time: string): number | null {
  const match = /^(\d{2}):(\d{2})/.exec(time);
  if (match === null) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Whether the configured moment has arrived today, in the user's own timezone.
 *
 * Deliberately `>=` and not "is it exactly now": a cron run can be late — a
 * function cold start, a queued `pg_net` request, a redeploy — and an equality
 * test would silently drop every occurrence the minute hand stepped over.
 * Catching up late is the behaviour; the dedupe key is what keeps catching up
 * from meaning catching up repeatedly.
 */
function hasReached(localMinutes: number, time: string): boolean {
  const target = minutesOfDay(time);
  if (target === null) return false;
  return localMinutes >= target;
}

/** Minutes until the appointment starts, or null if it has no time today. */
function minutesUntilAppointment(
  appointment: Appointment,
  localDate: string,
  localMinutes: number,
): number | null {
  if (appointment.scheduledTime === null) return null;
  // String equality *is* the same-day test here: both sides are `yyyy-MM-dd` in
  // the same timezone, which is the whole reason the dates never became `Date`s.
  if (appointment.scheduledDate !== localDate) return null;
  const at = minutesOfDay(appointment.scheduledTime);
  if (at === null) return null;
  return at - localMinutes;
}

/**
 * The patients whose birthday is `localDate`, by month and day only.
 *
 * String comparison on the `MM-dd` tail, which is the whole rule: the year in a
 * birth date says when the patient was born and has nothing to do with whether
 * today is their birthday. Sorted by name so a run that has to describe one of
 * several always describes the same one.
 *
 * **29 February is greeted on the 28th in years that do not have a 29th.** The
 * card on Início can leave a leap-day patient sitting under "fevereiro" and let
 * a human work it out, because it shows a whole month at once. A daily notice
 * has no such luxury: the honest-looking option — match nothing — silently
 * skips those patients three years out of four, which is the one outcome
 * nobody would choose on purpose. The 28th is the last day their birthday month
 * actually has, and greeting somebody a day early beats not greeting them at all.
 */
function birthdaysOn(
  patients: readonly PatientRecord[],
  localDate: string,
): readonly PatientRecord[] {
  const today = localDate.slice(5);
  const alsoLeapDay = today === '02-28' && !isLeapYear(localDate);

  return patients
    .filter((patient) => {
      const born = patient.birthDate.slice(5);
      return born === today || (alsoLeapDay && born === '02-29');
    })
    .sort((a, b) => (a.fullName ?? '').localeCompare(b.fullName ?? '', 'pt-BR'));
}

const isLeapYear = (localDate: string): boolean => {
  const year = Number(localDate.slice(0, 4));
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
};

/**
 * A cancelled appointment is still a row on the day, and every count and
 * reminder here has to skip it. `no_show` is left in on purpose: it is recorded
 * after the fact, so a consult that is still ahead is never marked with it.
 */
const isActive = (appointment: Appointment): boolean => appointment.status !== 'cancelled';

function describeNewAppointment(appointment: Appointment): string {
  const who = appointment.patientName?.trim();
  const day = formatDayLabel(appointment.scheduledDate);
  const when = appointment.scheduledTime === null ? day : `${day} às ${appointment.scheduledTime}`;

  return who === undefined || who === ''
    ? `Uma consulta foi marcada para ${when}.`
    : `${who} — ${when}.`;
}

/**
 * "Ana Souza faz 78 anos hoje."
 *
 * The age is dropped rather than guessed when the arithmetic gives something
 * impossible — a birth date in the future is a typo, and "faz −2 anos" is a
 * worse answer than no answer. The patient is still greeted, which is the same
 * bargain the birthdays card on Início makes: the row stays, the age goes.
 */
function describeBirthday(patient: PatientRecord, localDate: string): string {
  const who = patient.fullName?.trim();
  if (who === undefined || who === '') return '1 paciente faz aniversário hoje.';

  const age = Number(localDate.slice(0, 4)) - Number(patient.birthDate.slice(0, 4));
  if (age <= 0) return `${who} faz aniversário hoje.`;
  return age === 1 ? `${who} faz 1 ano hoje.` : `${who} faz ${String(age)} anos hoje.`;
}

function describeFollowUp(appointment: Appointment): string {
  const who = appointment.patientName?.trim();
  return who === undefined || who === ''
    ? 'Está na hora de falar com um paciente.'
    : `Fale com ${who} para saber como está.`;
}

function describeUpcoming(appointment: Appointment, minutesUntil: number): string {
  const who = appointment.patientName?.trim();
  const subject = who === undefined || who === '' ? 'Sua próxima consulta' : `Consulta com ${who}`;

  if (minutesUntil === 0) return `${subject} começa agora.`;
  if (minutesUntil === 1) return `${subject} começa em 1 minuto.`;
  return `${subject} começa em ${String(minutesUntil)} minutos.`;
}

/** `yyyy-MM-dd` → `dd/MM`. A substring, now that the date never became a `Date`. */
function formatDayLabel(date: string): string {
  const [, month, day] = date.split('-');
  return `${day ?? '??'}/${month ?? '??'}`;
}
