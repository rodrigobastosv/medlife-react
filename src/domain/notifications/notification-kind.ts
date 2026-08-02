import type { UserRole } from '@/domain/auth/user-role';

/**
 * The six things the app is allowed to interrupt someone about.
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
  'birthdays',
  'newAppointment',
  'upcomingVisit',
  'followUps',
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const notificationKindLabel: Record<NotificationKind, string> = {
  dailyAgenda: 'Consultas do dia',
  recalls: 'Pacientes para ligar',
  birthdays: 'Aniversariantes do dia',
  newAppointment: 'Nova consulta marcada',
  upcomingVisit: 'Lembrete antes da consulta',
  followUps: 'Acompanhamento de paciente',
};

/** The one-line explanation under each switch in Ajustes. */
export const notificationKindDescription: Record<NotificationKind, string> = {
  dailyAgenda: 'Um resumo com quantas consultas você tem hoje.',
  recalls: 'Quantos pacientes estão na fila de recall vencido.',
  // Says "hoje" out loud because the card on Início shows the whole month, and
  // somebody who has seen it will otherwise expect this to repeat that list.
  birthdays: 'Quais pacientes fazem aniversário hoje.',
  newAppointment: 'Avisa quando outra pessoa marca uma consulta na sua agenda.',
  upcomingVisit: 'Um aviso pouco antes de cada consulta começar.',
  followUps: 'Avisa na hora de falar com um paciente para saber como ele está.',
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
  // Both, unlike `followUps` — and the reason is who makes the call. Wishing a
  // patient a happy birthday is contact work, which is the secretary's, but it
  // is also the kind of thing a doctor in a small practice does personally. The
  // register is shared, so neither of them is being told about somebody else's
  // task; they are being told about the same one.
  birthdays: ['doctor', 'secretary'],
  newAppointment: ['doctor'],
  upcomingVisit: ['doctor', 'secretary'],
  // The doctor's alone, and that is the whole distinction between an
  // acompanhamento and a recall. A recall is the secretary's queue — call the
  // patient to book the next consultation — and she is offered it above. An
  // acompanhamento is the doctor asking how someone is, which is not work that
  // can be handed over, so telling the secretary about it would be telling her
  // about a task she cannot do.
  followUps: ['doctor'],
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
