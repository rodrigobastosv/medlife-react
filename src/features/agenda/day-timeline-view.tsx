import { Link } from 'react-router-dom';

import { routes } from '@/app/routing/routes';
import { agendaEventTypeLabel, type AgendaEventType } from '@/domain/agenda/agenda-event';
import { minutesToLabel, type DayTimeline } from '@/domain/agenda/day-timeline';
import { cn } from '@/design-system/cn';

/**
 * A day drawn on a clock.
 *
 * The month grid is how you navigate; this is how you work. A list of the day's
 * events, however well styled, can say what is happening and in what order and
 * nothing about when — and the questions actually asked of an agenda ("is the
 * morning full?", "can I fit an encaixe at 10:00?") are all questions about
 * gaps. On an axis a two-hour hole is the biggest thing on screen; in a list it
 * is not on screen at all.
 *
 * Only the axis is rendered here. Everything without a time of day stays with
 * the page, which already draws those as full rows with a contact bar — a strip
 * of them belongs *above* the axis, not squeezed into it.
 *
 * No calendar dependency, in keeping with the rest of the design system: this
 * is a column, a row per hour, and blocks positioned by `top`/`height` from
 * minutes since the axis start.
 */

/**
 * Vertical scale. At 1.2 an hour is 72px, which is tall enough for a
 * half-hour block to hold a name and short enough that a ten-hour day fits on a
 * laptop screen without scrolling.
 */
const MINUTE_PX = 1.2;

/**
 * Nothing shorter than this is drawn, however short the appointment.
 *
 * A 15-minute slot is 18px, which is a stripe rather than a label. Letting a
 * short block overlap the one below it is the right trade: the alternative is a
 * block whose text cannot be read, and the time is written on it.
 */
const MIN_BLOCK_PX = 26;

export function DayTimelineView({
  timeline,
  onPickSlot,
  className,
}: {
  timeline: DayTimeline;
  /** Called with `HH:mm` when an empty part of the axis is clicked. */
  onPickSlot: (time: string) => void;
  className?: string;
}) {
  const { startMinutes, endMinutes } = timeline;
  const hours: number[] = [];
  for (let minutes = startMinutes; minutes < endMinutes; minutes += 60) hours.push(minutes);

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {!timeline.fromDeclaredHours && (
        // An axis invented out of nothing looks exactly like one the doctor
        // configured, and the difference matters: "there is no room at 15:00"
        // and "nobody ever said whether 15:00 exists" are not the same claim.
        <p className="text-on-surface-variant text-xs">
          Horário de atendimento não declarado para este dia — o eixo mostra um dia comum.{' '}
          <Link to={routes.availability} className="text-primary underline">
            Declarar horários
          </Link>
        </p>
      )}

      <div className="flex" style={{ height: (endMinutes - startMinutes) * MINUTE_PX }}>
        {/* The hour labels sit outside the track rather than inside it, so a
            block can span the full width without running under them.

            Positioned by offset rather than stacked in one box per hour, which
            is what lets the closing hour be labelled at all: a band per hour
            gives seven labels for the seven bands, leaving the rule at the
            bottom of the last one — the end of the working day, and the one
            boundary somebody is looking for when they ask how late she goes —
            as the only unnamed line on the axis. */}
        <div className="relative w-12 shrink-0">
          {[...hours, endMinutes].map((minutes) => (
            <span
              key={minutes}
              className="text-on-surface-variant nums absolute right-2 text-xs"
              // Half a line up, so the label is centred on the rule it names
              // rather than sitting below it.
              style={{ top: (minutes - startMinutes) * MINUTE_PX - 6 }}
            >
              {minutesToLabel(minutes)}
            </span>
          ))}
        </div>

        <div className="relative flex-1">
          {/* One button per hour, behind the blocks. Clicking an empty stretch
              of the day starts a booking there — the same move the month grid
              already makes with a date, now with a time as well. */}
          {hours.map((minutes) => (
            <button
              key={minutes}
              type="button"
              onClick={() => onPickSlot(minutesToLabel(minutes))}
              style={{ height: 60 * MINUTE_PX }}
              className="border-outline/60 hover:bg-surface-container-high block w-full border-t transition-colors"
            >
              <span className="sr-only">Marcar consulta às {minutesToLabel(minutes)}</span>
            </button>
          ))}
          {/* Closes the last hour's band, so the axis reads as a bounded block
              rather than trailing off after its final rule. */}
          <div className="border-outline/60 absolute inset-x-0 bottom-0 border-t" aria-hidden />

          {/* A real list, not a pile of positioned links. Visually these are
              blocks on a plane, but to a screen reader — which gets none of the
              geometry — the day is a list of things at times, and saying so is
              the only way that reading exists at all.

              It lies over the hour buttons, so it passes clicks through and
              takes them back on each block; otherwise the sheet would swallow
              every click aimed at an empty part of the day. */}
          <ul
            aria-label="Consultas do dia"
            className="pointer-events-none absolute inset-0 m-0 list-none p-0"
          >
            {timeline.blocks.map((block) => {
              const { appointment } = block.event;
              const top = (block.startMinutes - startMinutes) * MINUTE_PX;
              const height = Math.max(
                (block.endMinutes - block.startMinutes) * MINUTE_PX,
                MIN_BLOCK_PX,
              );

              return (
                <li
                  key={`${appointment.id}-${block.event.type}`}
                  className="pointer-events-auto absolute"
                  style={{
                    top,
                    height,
                    left: `${(block.lane / block.laneCount) * 100}%`,
                    width: `${100 / block.laneCount}%`,
                  }}
                >
                  <Link
                    to={routes.editAppointment(appointment.patientId, appointment.id)}
                    className={cn(
                      'flex size-full overflow-hidden rounded-s border-l-4 px-2 py-1 text-xs',
                      'hover:brightness-105',
                      blockClasses[block.event.type],
                    )}
                  >
                    {/* The type is named for a screen reader but not drawn: the
                        block's colour already says it to a sighted reader, and
                        a "Consulta" prefix on every block would push the name —
                        the thing actually being looked for — out of a
                        half-hour box. */}
                    <span className="sr-only">{agendaEventTypeLabel[block.event.type]}</span>
                    <span className="nums font-medium">{minutesToLabel(block.startMinutes)}</span>
                    <span className="truncate">
                      &nbsp;{appointment.patientName ?? agendaEventTypeLabel[block.event.type]}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

/**
 * The block's colour, in the same hue the calendar's legend teaches for that
 * event type — a reader who learned "violet means a return" from the dots must
 * not meet a different language down here.
 *
 * A birthday never reaches this map: it has no time of day, so it is always in
 * the strip above the axis.
 */
const blockClasses: Record<Exclude<AgendaEventType, 'birthday'>, string> = {
  consultation: 'border-primary bg-primary-container text-on-primary-container',
  return: 'border-violet bg-violet-container text-on-violet-container',
  recall: 'border-warning bg-warning-container text-on-warning-container',
  followUp: 'border-success bg-success-container text-on-success-container',
};
