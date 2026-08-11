/**
 * As regras de vaga e de choque, do lado do Deno.
 *
 * **Isto é uma cópia de `src/domain/agenda/availability.ts` e
 * `src/domain/agenda/slot-conflicts.ts`, e a duplicação é deliberada** — o
 * mesmo arranjo que `notify/plan.ts` tem com `expandAgendaEvents`. A função não
 * consegue importar `src/`: aqueles módulos usam o alias `@/` e importam sem
 * extensão de arquivo, e o Deno não resolve nenhum dos dois.
 *
 * O risco óbvio de duplicar é a divergência silenciosa: o app passa a achar que
 * 14:00 está livre e a IA continua achando que não. Por isso a duplicação vem
 * com uma prova em vez de com um pedido de atenção — o script em
 * `scripts/check-slot-parity.mjs` roda as duas versões sobre o mesmo conjunto
 * de casos e falha se elas discordarem em qualquer um. Ao mudar uma regra aqui
 * ou lá, é ele que diz se as duas ainda são a mesma regra.
 *
 * Puro: sem `Date.now()`, sem banco, sem rede.
 */

export const APPOINTMENT_LOCATIONS = [
  'oncovie',
  'idc',
  'home',
  'hospital',
  'teleconsult',
  'other',
] as const;
export type AppointmentLocation = (typeof APPOINTMENT_LOCATIONS)[number];

export const toAppointmentLocation = (wire: string | null | undefined): AppointmentLocation =>
  APPOINTMENT_LOCATIONS.includes(wire as AppointmentLocation)
    ? (wire as AppointmentLocation)
    : 'other';

export interface AvailabilityRule {
  readonly location: AppointmentLocation;
  /** 0 = domingo .. 6 = sábado, como `Date.getDay()` e `extract(dow ...)`. */
  readonly weekday: number;
  readonly startTime: string;
  readonly endTime: string;
  readonly slotDurationMinutes: number;
}

export interface AvailabilityException {
  /** `yyyy-MM-dd`. */
  readonly date: string;
  /** `null` = todos os locais (um feriado fecha tudo). */
  readonly location: AppointmentLocation | null;
  readonly isClosed: boolean;
  readonly startTime: string | null;
  readonly endTime: string | null;
  readonly slotDurationMinutes: number | null;
}

export interface BookedAppointment {
  readonly id: string;
  /** `HH:mm`, ou `null` numa linha registrada antes da coluna existir. */
  readonly scheduledTime: string | null;
  readonly location: AppointmentLocation;
  readonly status: string;
  readonly patientName: string | null;
}

interface OpenInterval {
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
}

/**
 * O que está aberto em `day` (`yyyy-MM-dd`) para `location`.
 *
 * Uma exceção **substitui** a regra semanal em vez de somar-se a ela, e um
 * fechamento geral (exceção sem local, fechada) ganha do horário especial de um
 * local no mesmo dia: estar de férias não é um fato que um local possa
 * contradizer. Ver `010_availability.sql` e `011_availability_by_location.sql`.
 */
function openIntervalFor(
  day: string,
  location: AppointmentLocation,
  rules: readonly AvailabilityRule[],
  exceptions: readonly AvailabilityException[],
): OpenInterval | null {
  const onDay = exceptions.filter((candidate) => candidate.date === day);
  const everywhere = onDay.find((candidate) => candidate.location === null);
  if (everywhere?.isClosed === true) return null;

  const exception = onDay.find((candidate) => candidate.location === location) ?? everywhere;
  if (exception !== undefined) {
    if (exception.isClosed) return null;
    if (
      exception.startTime === null ||
      exception.endTime === null ||
      exception.slotDurationMinutes === null
    ) {
      return null;
    }
    return {
      startTime: exception.startTime,
      endTime: exception.endTime,
      slotDurationMinutes: exception.slotDurationMinutes,
    };
  }

  const weekday = weekdayOf(day);
  return rules.find((rule) => rule.location === location && rule.weekday === weekday) ?? null;
}

/**
 * O dia da semana de um `yyyy-MM-dd`, sem passar por fuso.
 *
 * `new Date('2026-03-10')` é interpretado como UTC e, num fuso a oeste, volta
 * como o dia anterior — o que trocaria a regra de terça pela de segunda. Montar
 * a data pelos componentes a mantém local, que é o que a coluna `date` do
 * Postgres significa.
 */
function weekdayOf(day: string): number {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  return new Date(year, month - 1, date).getDay();
}

export const timeToMinutes = (time: string): number => {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

const minutesToTime = (total: number): string =>
  `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;

/** Quanto dura uma consulta em `location` nesse dia, ou `null` se nada foi declarado. */
export function slotDurationOn(
  day: string,
  location: AppointmentLocation,
  rules: readonly AvailabilityRule[],
  exceptions: readonly AvailabilityException[],
): number | null {
  return openIntervalFor(day, location, rules, exceptions)?.slotDurationMinutes ?? null;
}

/**
 * Os horários abertos em `day` para `location`, sem os já ocupados.
 *
 * `bookedTimes` tem de ser o dia **inteiro**, de qualquer local: a médica é uma
 * pessoa só, e um 09:00 na clínica é um 09:00 indisponível para domiciliar
 * também. Oferecer por local e subtrair por local a marcaria em dois lugares ao
 * mesmo tempo.
 */
export function freeSlots(params: {
  day: string;
  location: AppointmentLocation;
  rules: readonly AvailabilityRule[];
  exceptions: readonly AvailabilityException[];
  bookedTimes: readonly string[];
}): string[] {
  const interval = openIntervalFor(params.day, params.location, params.rules, params.exceptions);
  if (interval === null) return [];

  const booked = new Set(params.bookedTimes);
  const endMinutes = timeToMinutes(interval.endTime);
  const slots: string[] = [];
  for (
    let minutes = timeToMinutes(interval.startTime);
    minutes + interval.slotDurationMinutes <= endMinutes;
    minutes += interval.slotDurationMinutes
  ) {
    const slot = minutesToTime(minutes);
    if (!booked.has(slot)) slots.push(slot);
  }
  return slots;
}

export interface SlotConflict {
  readonly appointmentId: string;
  readonly time: string;
  readonly patientName: string | null;
}

/**
 * Quem já está no horário proposto.
 *
 * O local **não** filtra: decide só quanto dura cada consulta. Uma consulta na
 * clínica choca com uma domiciliar, e pior, porque há deslocamento no meio.
 * Onde nada foi declarado, cada consulta ocupa o próprio minuto — o que reduz a
 * regra a igualdade exata sem um segundo caminho no código.
 */
export function conflictsAt(params: {
  day: string;
  time: string;
  location: AppointmentLocation;
  appointments: readonly BookedAppointment[];
  rules: readonly AvailabilityRule[];
  exceptions: readonly AvailabilityException[];
  ignoreAppointmentId: string | null;
}): SlotConflict[] {
  const proposedStart = timeToMinutes(params.time);
  const lengthOf = (location: AppointmentLocation): number =>
    slotDurationOn(params.day, location, params.rules, params.exceptions) ?? 1;
  const proposedLength = lengthOf(params.location);

  return params.appointments
    .filter((appointment) => {
      if (appointment.id === params.ignoreAppointmentId) return false;
      if (appointment.scheduledTime === null) return false;
      if (appointment.status === 'cancelled') return false;

      const start = timeToMinutes(appointment.scheduledTime);
      return (
        start < proposedStart + proposedLength &&
        proposedStart < start + lengthOf(appointment.location)
      );
    })
    .map((appointment) => ({
      appointmentId: appointment.id,
      time: appointment.scheduledTime ?? '',
      patientName: appointment.patientName,
    }));
}
