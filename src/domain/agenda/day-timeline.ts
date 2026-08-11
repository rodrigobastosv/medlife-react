import { slotDurationOn, timeToMinutes, workingSpanOn } from '@/domain/agenda/availability';
import type { AvailabilityException, AvailabilityRule } from '@/domain/agenda/availability';
import type { AgendaEvent, AppointmentAgendaEvent } from '@/domain/agenda/agenda-event';

/**
 * A day laid out on a clock: what to draw where, and what cannot be drawn there
 * at all.
 *
 * The agenda's day list says *what* is happening and in what order, and nothing
 * about *when* — or, far more usefully, when nothing is. The questions actually
 * asked of an agenda are "how much room is there before the 14:00?", "is the
 * morning full?", "can I fit an encaixe at 10:00?", and all of them are
 * questions about gaps. A list cannot draw a gap; a time axis draws it as the
 * biggest thing on screen.
 *
 * Pure, and it takes the day's events rather than fetching them, for the same
 * reason `freeSlots` and `conflictsAt` next door do.
 */

/**
 * How tall a block is drawn when nothing declares a length.
 *
 * A drawing decision, not a claim about the appointment: a block has to have
 * some height or it is not on the axis at all. Where the doctor has declared
 * hours for the location, the real slot duration is used instead — which is the
 * normal case, and the reason this constant is rarely the one on screen.
 */
export const DEFAULT_BLOCK_MINUTES = 30;

/** The axis when nothing else decides it — a plausible working day. */
const FALLBACK_SPAN = { startMinutes: 8 * 60, endMinutes: 18 * 60 };

export interface TimelineBlock {
  readonly event: AppointmentAgendaEvent;
  readonly startMinutes: number;
  readonly endMinutes: number;
  /**
   * Which side-by-side column this block sits in, and how many the cluster it
   * overlaps needs. Two patients *can* be booked into the same time — the form
   * warns and then allows it, because an encaixe is a real thing — so a
   * timeline that drew one block on top of another would hide exactly the
   * situation it was built to make visible.
   */
  readonly lane: number;
  readonly laneCount: number;
}

export interface DayTimeline {
  /** Axis bounds, always whole hours so the hour lines land on labels. */
  readonly startMinutes: number;
  readonly endMinutes: number;
  readonly blocks: readonly TimelineBlock[];
  /**
   * Everything with no time of day, for the strip *above* the axis.
   *
   * Recalls and returns are dates without an hour, a birthday is a fact about a
   * date, and a legacy appointment's null `scheduled_time` means "recorded
   * before the column existed". Dropping any of them at the top of the axis
   * would draw them as appointments at midnight, which is a claim the data does
   * not make — the same reading `008_appointment_follow_up.sql` settled for the
   * follow-up queue.
   */
  readonly untimed: readonly AgendaEvent[];
  /**
   * Whether the axis came from declared hours or from the fallback.
   *
   * The screen says so: an axis invented out of nothing looks identical to one
   * the doctor configured, and the difference is the difference between "there
   * is no room at 15:00" and "nobody ever said whether 15:00 exists".
   */
  readonly fromDeclaredHours: boolean;
}

export function buildDayTimeline(params: {
  day: Date;
  events: readonly AgendaEvent[];
  rules: readonly AvailabilityRule[];
  exceptions: readonly AvailabilityException[];
}): DayTimeline {
  const untimed: AgendaEvent[] = [];
  const timed: { event: AppointmentAgendaEvent; startMinutes: number; endMinutes: number }[] = [];

  for (const event of params.events) {
    // Split by type rather than by asking a helper for a time, so the branch
    // that keeps a block *is* the branch where TypeScript knows the event has
    // an appointment on it. Routing that through a `timeOf(event)` helper would
    // read better and then need a cast to get the narrowing back.
    //
    // An acompanhamento is the one type that lands on either side: its hour is
    // nullable because "ligar na quinta" is a complete instruction. A recall
    // and a return are dates with no hour column at all, and a birthday is not
    // scheduled by anyone.
    if (event.type === 'birthday' || event.type === 'return' || event.type === 'recall') {
      untimed.push(event);
      continue;
    }

    const time =
      event.type === 'consultation'
        ? event.appointment.scheduledTime
        : event.appointment.followUpTime;
    if (time === null) {
      untimed.push(event);
      continue;
    }

    const startMinutes = timeToMinutes(time);
    timed.push({ event, startMinutes, endMinutes: startMinutes + lengthOf(event, params) });
  }

  timed.sort((a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes);

  const span = workingSpanOn(params.day, params.rules, params.exceptions);
  const base = span ?? FALLBACK_SPAN;

  // The axis always grows to contain every block, declared hours or not. An
  // encaixe at 07:00 on a day that opens at 08:00 is precisely the thing
  // somebody opened this screen to see, and an axis that started at 08:00 would
  // position it above its own top edge.
  let startMinutes = base.startMinutes;
  let endMinutes = base.endMinutes;
  for (const block of timed) {
    if (block.startMinutes < startMinutes) startMinutes = block.startMinutes;
    if (block.endMinutes > endMinutes) endMinutes = block.endMinutes;
  }

  return {
    startMinutes: floorToHour(startMinutes),
    endMinutes: ceilToHour(endMinutes),
    blocks: assignLanes(timed),
    untimed,
    fromDeclaredHours: span !== null,
  };
}

/**
 * How long a block runs, in minutes.
 *
 * A consultation borrows the slot duration the doctor declared *for its own
 * location*, which is the whole point of availability being per location: a
 * home visit blocks a stretch of the afternoon that a teleconsultation does
 * not. An acompanhamento is a phone call with no declared length, and gets the
 * default like anything else nothing is known about.
 */
function lengthOf(
  event: AgendaEvent,
  availability: {
    day: Date;
    rules: readonly AvailabilityRule[];
    exceptions: readonly AvailabilityException[];
  },
): number {
  if (event.type !== 'consultation') return DEFAULT_BLOCK_MINUTES;
  return (
    slotDurationOn(
      availability.day,
      event.appointment.location,
      availability.rules,
      availability.exceptions,
    ) ?? DEFAULT_BLOCK_MINUTES
  );
}

/**
 * Splits overlapping blocks into side-by-side columns.
 *
 * Lanes are counted per *cluster* of transitively overlapping blocks, not once
 * for the whole day. A single encaixe at 09:00 should halve the width of the
 * two blocks that actually collide — not of every appointment from breakfast to
 * dinner, which is what one global lane count would do, and which would make
 * one double-booking redraw the entire day as though it were full.
 */
function assignLanes(
  timed: readonly { event: AppointmentAgendaEvent; startMinutes: number; endMinutes: number }[],
): TimelineBlock[] {
  const blocks: TimelineBlock[] = [];

  let cluster: TimelineBlock[] = [];
  // Where each lane in the current cluster is free from. A block takes the
  // first lane that has ended by the time it starts.
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;

  const closeCluster = () => {
    for (const block of cluster) blocks.push({ ...block, laneCount: laneEnds.length });
    cluster = [];
    laneEnds = [];
    clusterEnd = -Infinity;
  };

  for (const entry of timed) {
    // Half-open, like every other interval comparison in this folder: a block
    // that starts exactly where the previous one ended does not overlap it, and
    // back-to-back consultations are the normal case rather than a collision.
    if (entry.startMinutes >= clusterEnd) closeCluster();

    let lane = laneEnds.findIndex((end) => end <= entry.startMinutes);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(entry.endMinutes);
    } else {
      laneEnds[lane] = entry.endMinutes;
    }

    cluster.push({ ...entry, lane, laneCount: 1 });
    if (entry.endMinutes > clusterEnd) clusterEnd = entry.endMinutes;
  }
  closeCluster();

  return blocks;
}

const floorToHour = (minutes: number): number => Math.floor(minutes / 60) * 60;
const ceilToHour = (minutes: number): number => Math.ceil(minutes / 60) * 60;

/** `540` → `'09:00'`, for the hour labels down the side of the axis. */
export const minutesToLabel = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
