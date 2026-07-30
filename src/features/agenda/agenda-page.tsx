import { useMemo, useState } from 'react';

import { messageOf } from '@/core/errors';
import { dateOnly, formatWeekday } from '@/core/format';
import {
  agendaEventTypeLabel,
  dayKey,
  groupEventsByDay,
  type AgendaEvent,
  type AgendaEventType,
} from '@/domain/agenda/agenda-event';
import { AppointmentTile } from '@/features/appointments/appointment-tile';
import { useAgendaQuery } from '@/features/appointments/use-appointments';
import { Calendar } from '@/design-system/components/calendar';
import { Card } from '@/design-system/components/card';
import { EmptyState } from '@/design-system/components/empty-state';
import { CalendarIcon } from '@/design-system/components/icons';
import { Page, PageHeader } from '@/design-system/components/page';
import { SkeletonList } from '@/design-system/components/skeleton';
import { Tag, type TagTone } from '@/design-system/components/tag';

/**
 * A month calendar over the events of the selected day.
 *
 * One appointment can appear on three days — the visit, the return it scheduled,
 * and the recall — which is why the calendar is fed *events* rather than
 * appointments. That fan-out is a pure function in the domain
 * (`expandAgendaEvents`), so the only thing this page owns is which month and
 * which day are being looked at.
 */
export function AgendaPage() {
  // Local UI state, deliberately not in the URL or the cache: which month you
  // are browsing is not data, and it should not survive a reload the way a
  // patient's id should.
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => dateOnly(new Date()));

  const agenda = useAgendaQuery(month);

  // Regrouping on every render would rebuild the map for every hover; this ties
  // it to the data and nothing else.
  const eventsByDay = useMemo(() => groupEventsByDay(agenda.data ?? []), [agenda.data]);
  const selectedEvents = eventsByDay.get(dayKey(selectedDay)) ?? [];

  return (
    <Page>
      <PageHeader title="Agenda" subtitle="Consultas, retornos e recalls." />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr] lg:items-start">
        <Card>
          <Calendar
            month={month}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
            onChangeMonth={setMonth}
            renderDayContent={(day) => {
              const events = eventsByDay.get(dayKey(day));
              if (events === undefined) return null;
              return (
                <span className="flex gap-0.5">
                  {/* Up to three dots, one per event *type* present that day —
                      not one per event, which on a busy day would be a smear of
                      dots that says nothing. */}
                  {distinctTypes(events).map((type) => (
                    <span
                      key={type}
                      className={`size-1.5 rounded-full ${dotClasses[type]}`}
                      aria-hidden
                    />
                  ))}
                </span>
              );
            }}
          />
          <div className="border-outline mt-4 flex flex-wrap gap-3 border-t pt-4 text-xs">
            {(['consultation', 'return', 'recall'] as const).map((type) => (
              <span key={type} className="flex items-center gap-1.5">
                <span className={`size-2 rounded-full ${dotClasses[type]}`} aria-hidden />
                {agendaEventTypeLabel[type]}
              </span>
            ))}
          </div>
        </Card>

        <section className="flex flex-col gap-3">
          <h2 className="font-display text-lg font-semibold">{formatWeekday(selectedDay)}</h2>

          {agenda.isPending ? (
            <SkeletonList rows={2} />
          ) : agenda.isError ? (
            <EmptyState
              title="Não foi possível carregar a agenda"
              message={messageOf(agenda.error)}
              actionLabel="Tentar de novo"
              onAction={() => void agenda.refetch()}
            />
          ) : selectedEvents.length === 0 ? (
            <EmptyState
              icon={<CalendarIcon />}
              title="Nada neste dia"
              message="Escolha outro dia no calendário — os dias com marcação têm um ponto colorido."
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {selectedEvents.map((event) => (
                // One appointment can produce three events, so its id alone is
                // not unique within a day's list — the type completes the key.
                <li key={`${event.appointment.id}-${event.type}`} className="flex flex-col gap-1">
                  <Tag tone={tagTones[event.type]} className="self-start">
                    {agendaEventTypeLabel[event.type]}
                  </Tag>
                  <AppointmentTile appointment={event.appointment} showPatientName />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Page>
  );
}

const dotClasses: Record<AgendaEventType, string> = {
  consultation: 'bg-primary',
  return: 'bg-violet',
  recall: 'bg-warning',
};

const tagTones: Record<AgendaEventType, TagTone> = {
  consultation: 'primary',
  return: 'neutral',
  recall: 'warning',
};

const distinctTypes = (events: readonly AgendaEvent[]): AgendaEventType[] => [
  ...new Set(events.map((event) => event.type)),
];

const startOfMonth = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), 1);
