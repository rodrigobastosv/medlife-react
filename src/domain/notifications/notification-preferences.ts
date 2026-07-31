import { toTimeOfDay } from '@/domain/appointments/appointment';
import {
  toUpcomingLeadMinutes,
  type UpcomingLeadMinutes,
} from '@/domain/notifications/notification-kind';

/**
 * What each user chose to be told about.
 *
 * Times are `HH:mm` strings rather than `Date`s, for the same reason
 * `Appointment.scheduledTime` is: the column is a Postgres `time`, which is a
 * clock reading with no day attached. Turning it into a `Date` here would invent
 * a date, and every comparison would then have to remember to ignore it.
 */
export interface NotificationPreferences {
  readonly dailyAgendaEnabled: boolean;
  /** `HH:mm` — when the day's summary is due. */
  readonly dailyAgendaTime: string;
  readonly recallsEnabled: boolean;
  /** `HH:mm` — when the recall backlog is due. */
  readonly recallsTime: string;
  readonly newAppointmentEnabled: boolean;
  readonly upcomingVisitEnabled: boolean;
  readonly upcomingLeadMinutes: UpcomingLeadMinutes;
  /**
   * Whether this person has ever opted in to push on any device.
   *
   * Separate from the four switches above, which say *what* to send. This says
   * whether there is anyone listening at all, and the server uses it to skip
   * accounts that never enabled anything without having to look for their
   * subscriptions first.
   */
  readonly pushEnabled: boolean;
  /**
   * IANA zone the times above are resolved in — `America/Sao_Paulo` and friends.
   *
   * The local scheduler never needed this: it ran on the device, so "07:30"
   * meant 07:30 by the clock the user was looking at. Sent from a server,
   * "07:30" means nothing until a zone is named. It is captured from the browser
   * when the user opts in and then left alone, because appointments are recorded
   * in clinic wall-clock time and the summary should follow the clinic rather
   * than wherever the person happens to be reading e-mail from.
   */
  readonly timezone: string;
}

export interface NotificationPreferencesRow {
  daily_agenda_enabled: boolean | null;
  daily_agenda_time: string | null;
  recalls_enabled: boolean | null;
  recalls_time: string | null;
  new_appointment_enabled: boolean | null;
  upcoming_visit_enabled: boolean | null;
  upcoming_lead_minutes: number | null;
  push_enabled: boolean | null;
  timezone: string | null;
}

/**
 * Everything off.
 *
 * This is what a user with no row reads back as, which is why the table is not
 * seeded: the absence of a row and a row full of `false` mean the same thing,
 * and only one of them can drift from the column defaults.
 */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  dailyAgendaEnabled: false,
  dailyAgendaTime: '07:30',
  recallsEnabled: false,
  recallsTime: '09:00',
  newAppointmentEnabled: false,
  upcomingVisitEnabled: false,
  upcomingLeadMinutes: 30,
  pushEnabled: false,
  // Matches the column default. A user who has not opted in has no timezone of
  // their own yet, and this is the one the clinic actually runs on.
  timezone: 'America/Sao_Paulo',
};

export function toNotificationPreferences(
  row: NotificationPreferencesRow,
): NotificationPreferences {
  return {
    dailyAgendaEnabled: row.daily_agenda_enabled ?? false,
    // `toTimeOfDay` is reused rather than reimplemented: Postgres sends a `time`
    // as `HH:mm:ss` from both columns, and the trimming — plus the rejection of
    // anything that is not a clock reading — is already solved there. The
    // fallback keeps a malformed value from reaching `<input type="time">`,
    // which discards it silently and leaves a field that looks empty while the
    // row still holds the bad data.
    dailyAgendaTime:
      toTimeOfDay(row.daily_agenda_time) ?? DEFAULT_NOTIFICATION_PREFERENCES.dailyAgendaTime,
    recallsEnabled: row.recalls_enabled ?? false,
    recallsTime: toTimeOfDay(row.recalls_time) ?? DEFAULT_NOTIFICATION_PREFERENCES.recallsTime,
    newAppointmentEnabled: row.new_appointment_enabled ?? false,
    upcomingVisitEnabled: row.upcoming_visit_enabled ?? false,
    upcomingLeadMinutes: toUpcomingLeadMinutes(row.upcoming_lead_minutes),
    pushEnabled: row.push_enabled ?? false,
    timezone: row.timezone ?? DEFAULT_NOTIFICATION_PREFERENCES.timezone,
  };
}

export function preferencesToColumns(preferences: NotificationPreferences) {
  return {
    daily_agenda_enabled: preferences.dailyAgendaEnabled,
    daily_agenda_time: preferences.dailyAgendaTime,
    recalls_enabled: preferences.recallsEnabled,
    recalls_time: preferences.recallsTime,
    new_appointment_enabled: preferences.newAppointmentEnabled,
    upcoming_visit_enabled: preferences.upcomingVisitEnabled,
    upcoming_lead_minutes: preferences.upcomingLeadMinutes,
    push_enabled: preferences.pushEnabled,
    timezone: preferences.timezone,
  };
}
