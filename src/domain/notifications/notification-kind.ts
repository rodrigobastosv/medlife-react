import type { UserRole } from '@/domain/auth/user-role';

/**
 * The four things the app is allowed to interrupt someone about.
 *
 * A string-literal union and a `Record` rather than a TypeScript `enum`, for the
 * reasons already written out in `domain/auth/user-role.ts`: the `Record` is
 * checked for exhaustiveness, so adding a kind here makes every label map below
 * fail to compile until it is filled in. That is the whole point of listing them
 * — a notification with no label is a notification nobody can turn off.
 */
export const NOTIFICATION_KINDS = [
  'dailyAgenda',
  'recalls',
  'newAppointment',
  'upcomingVisit',
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const notificationKindLabel: Record<NotificationKind, string> = {
  dailyAgenda: 'Consultas do dia',
  recalls: 'Pacientes para ligar',
  newAppointment: 'Nova consulta marcada',
  upcomingVisit: 'Lembrete antes da consulta',
};

/** The one-line explanation under each switch in Ajustes. */
export const notificationKindDescription: Record<NotificationKind, string> = {
  dailyAgenda: 'Um resumo com quantas consultas você tem hoje.',
  recalls: 'Quantos pacientes estão na fila de recall vencido.',
  newAppointment: 'Avisa quando outra pessoa marca uma consulta na sua agenda.',
  upcomingVisit: 'Um aviso pouco antes de cada consulta começar.',
};

/**
 * Which roles each kind is offered to.
 *
 * `newAppointment` is the doctor's alone, and not because a secretary would not
 * care: the notification means "someone else wrote into *your* agenda", and a
 * secretary's own bookings are the ones that trigger it. Offering it to her
 * would be an app telling her about the thing she just did.
 *
 * This map is read in two places on purpose — the settings screen, to decide
 * what to render, and `planNotifications`, to decide what to emit. The second is
 * not redundant: a preference row survives a role change and a hidden switch is
 * not a disabled one.
 */
export const notificationKindRoles: Record<NotificationKind, readonly UserRole[]> = {
  dailyAgenda: ['doctor', 'secretary'],
  recalls: ['doctor', 'secretary'],
  newAppointment: ['doctor'],
  upcomingVisit: ['doctor', 'secretary'],
};

export const isKindForRole = (kind: NotificationKind, role: UserRole): boolean =>
  notificationKindRoles[kind].includes(role);

/**
 * How long before a consult the reminder fires, in minutes.
 *
 * A closed list rather than a free number field, and the database repeats it as
 * a check constraint: these are the three answers the form can render back, and
 * a value it cannot render is a value the user can never correct.
 */
export const UPCOMING_LEAD_OPTIONS = [15, 30, 60] as const;

export type UpcomingLeadMinutes = (typeof UPCOMING_LEAD_OPTIONS)[number];

export const upcomingLeadLabel: Record<UpcomingLeadMinutes, string> = {
  15: '15 minutos antes',
  30: '30 minutos antes',
  60: '1 hora antes',
};

export const toUpcomingLeadMinutes = (wire: number | null | undefined): UpcomingLeadMinutes =>
  UPCOMING_LEAD_OPTIONS.includes(wire as UpcomingLeadMinutes) ? (wire as UpcomingLeadMinutes) : 30;
