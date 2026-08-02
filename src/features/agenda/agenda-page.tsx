import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { routes } from '@/app/routing/routes';
import { messageOf } from '@/core/errors';
import { dateOnly, formatDate, formatWeekday } from '@/core/format';
import {
  agendaEventKey,
  agendaEventTypeLabel,
  dayKey,
  expandBirthdayEvents,
  groupEventsByDay,
  AGENDA_EVENT_TYPES,
  type AgendaEvent,
  type AgendaEventType,
  type BirthdayAgendaEvent,
} from '@/domain/agenda/agenda-event';
import { AppointmentTile } from '@/features/appointments/appointment-tile';
import { agendaRange, useAgendaQuery } from '@/features/appointments/use-appointments';
import { PatientContactActions } from '@/features/patients/patient-contact-actions';
import { PatientPickerDialog } from '@/features/patients/patient-picker-dialog';
import { usePatientsQuery } from '@/features/patients/use-patients';
import { Button } from '@/design-system/components/button';
import { Calendar } from '@/design-system/components/calendar';
import { Card } from '@/design-system/components/card';
import { EmptyState } from '@/design-system/components/empty-state';
import { CakeIcon, CalendarIcon, PlusIcon } from '@/design-system/components/icons';
import { Page, PageHeader } from '@/design-system/components/page';
import { SkeletonList } from '@/design-system/components/skeleton';
import { Tag, type TagTone } from '@/design-system/components/tag';

/**
 * A month calendar over the events of the selected day.
 *
 * One appointment can appear on four days — the visit, the return it scheduled,
 * the recall and the acompanhamento — which is why the calendar is fed *events*
 * rather than appointments. A birthday is a fifth kind of event and comes from
 * the patient register instead, which is the reason the two are separate queries
 * merged here rather than one read: the expansions are pure functions in the
 * domain, and the only thing this page owns is which month and which day are
 * being looked at.
 */
export function AgendaPage() {
  // Local UI state, deliberately not in the URL or the cache: which month you
  // are browsing is not data, and it should not survive a reload the way a
  // patient's id should.
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => dateOnly(new Date()));
  const [isPickingPatient, setIsPickingPatient] = useState(false);

  const navigate = useNavigate();
  const agenda = useAgendaQuery(month);
  // The same cache entry Início and Pacientes fill, so arriving here from either
  // costs no extra request. Birthdays cannot come from the agenda query at all:
  // they are a fact about the register, not about anything that was scheduled.
  const patients = usePatientsQuery();

  // Regrouping on every render would rebuild the map for every hover; this ties
  // it to the data and nothing else. The appointment events come first so that
  // within a day the scheduled hours keep the order the query sorted them into
  // and the birthdays — which have no hour — sit under them.
  const eventsByDay = useMemo(
    () =>
      groupEventsByDay([
        ...(agenda.data ?? []),
        ...expandBirthdayEvents(patients.data ?? [], agendaRange(month)),
      ]),
    [agenda.data, patients.data, month],
  );
  const selectedEvents = eventsByDay.get(dayKey(selectedDay)) ?? [];

  return (
    <Page>
      <PageHeader
        title="Agenda"
        subtitle="Consultas, retornos, recalls, acompanhamentos e aniversários."
      />

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
                // Wraps rather than overflowing: five types is five dots, which
                // is wider than a day cell, and a second row of them inside the
                // cell is better than a marker silently pushed out of view.
                <span className="flex max-w-full flex-wrap justify-center gap-0.5">
                  {/* One dot per event *type* present that day — not one per
                      event, which on a busy day would be a smear of dots that
                      says nothing. */}
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
            {/* Read off the type list rather than repeated here, so a type added
                to the domain cannot end up on the calendar as an unexplained
                colour. */}
            {AGENDA_EVENT_TYPES.map((type) => (
              <span key={type} className="flex items-center gap-1.5">
                <span className={`size-2 rounded-full ${dotClasses[type]}`} aria-hidden />
                {agendaEventTypeLabel[type]}
              </span>
            ))}
          </div>
        </Card>

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-semibold">{formatWeekday(selectedDay)}</h2>
            {/* Scheduling starts from the day you are looking at, which is the
                whole point of doing it here rather than from the patient's
                record: the date is already chosen. */}
            <Button size="sm" icon={<PlusIcon />} onClick={() => setIsPickingPatient(true)}>
              Nova consulta
            </Button>
          </div>

          {/* The register is part of the answer now, so "nada neste dia" cannot
              be said before it has arrived. A *failure* to load it is different:
              the agenda still has everything that was scheduled, and losing the
              whole screen over a birthday list nobody came here for would be the
              worse trade. */}
          {agenda.isPending || patients.isPending ? (
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
              message="Escolha outro dia no calendário — os dias com marcação têm um ponto colorido — ou marque uma consulta para este."
              actionLabel="Marcar consulta"
              onAction={() => setIsPickingPatient(true)}
            />
          ) : (
            // Named, because it is not the only list on this screen — the
            // patient picker holds another — and "lista" on its own tells a
            // screen reader nothing about which one it has landed in.
            <ul aria-label="Eventos do dia" className="flex flex-col gap-3">
              {selectedEvents.map((event) => (
                <li
                  key={agendaEventKey(event)}
                  className={`flex flex-col gap-1.5 border-l-4 pl-3 ${railClasses[event.type]}`}
                >
                  <Tag
                    tone={tagTones[event.type]}
                    icon={event.type === 'birthday' ? <CakeIcon className="size-3.5" /> : undefined}
                    className="self-start"
                  >
                    {agendaEventTypeLabel[event.type]}
                  </Tag>
                  {event.type === 'birthday' ? (
                    <BirthdayTile event={event} />
                  ) : (
                    <AppointmentTile appointment={event.appointment} showPatientName />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <PatientPickerDialog
        open={isPickingPatient}
        title="Nova consulta"
        description={`Para quem é a consulta de ${formatDate(selectedDay)}?`}
        onCancel={() => setIsPickingPatient(false)}
        // The dialog only answers "who?"; the date it is being scheduled for is
        // this page's state, and the two meet in the URL of the form.
        onSelect={(patient) => {
          setIsPickingPatient(false);
          void navigate(routes.newAppointment(patient.id, selectedDay));
        }}
      />
    </Page>
  );
}

/**
 * A birthday as a row, shaped like `AppointmentTile` because it sits in the same
 * list — the same card, the same link to the record, the same contact bar.
 *
 * That bar is the point of putting birthdays here at all: the useful next move
 * is to call or message the patient, and it is the same two buttons the rows
 * around it offer. It renders nothing when the register has no phone number,
 * exactly as it does for an appointment.
 */
function BirthdayTile({ event }: { event: BirthdayAgendaEvent }) {
  const { patient, turningAge } = event;

  return (
    <div className="bg-surface-container-low border-outline/70 flex flex-col overflow-hidden rounded-l border">
      <Link
        to={routes.patient(patient.id)}
        className="hover:bg-surface-container-high flex flex-col gap-1 p-4 transition-colors"
      >
        <span className="font-semibold">{patient.fullName}</span>
        <span className="text-on-surface-variant text-sm">{ageLine(turningAge)}</span>
      </Link>

      <PatientContactActions
        phone={patient.phone}
        patientName={patient.fullName}
        className="border-outline/70 border-t px-4 py-2"
      />
    </div>
  );
}

/**
 * "Faz 78 anos hoje" is wrong on a calendar — the day being read is not
 * necessarily today — so the line says only what the age is. A birth date in the
 * future is a typo, and the same honest answer the card on Início gives is the
 * one that belongs here: no invented age, and the patient still on the list,
 * where somebody will notice the date needs fixing.
 */
const ageLine = (turningAge: number | null): string => {
  if (turningAge === null) return 'Data de nascimento a conferir';
  return turningAge === 1 ? 'Faz 1 ano' : `Faz ${turningAge} anos`;
};

const dotClasses: Record<AgendaEventType, string> = {
  consultation: 'bg-primary',
  return: 'bg-violet',
  recall: 'bg-warning',
  followUp: 'bg-success',
  birthday: 'bg-secondary',
};

/**
 * One tone per type, and the *same* colour the type's dot has above.
 *
 * Two of these used to be `neutral`, which quietly broke the legend: the
 * calendar teaches five colours, and a reader who learned "violet means a
 * return" then scrolled to a list that rendered returns in grey had been taught
 * a language the page only half spoke.
 *
 * The reason they were neutral was a fear of five saturated labels competing in
 * one day's list. That fear was aimed at the wrong thing — every tone here is a
 * *container* colour, a pale wash behind dark ink, not the accent itself. Five
 * of those in a column read as five quiet labels, which is what they are.
 */
const tagTones: Record<AgendaEventType, TagTone> = {
  consultation: 'primary',
  return: 'violet',
  recall: 'warning',
  followUp: 'success',
  birthday: 'secondary',
};

/**
 * The left rail on a day's row, in the event's colour.
 *
 * It exists because the type tag used to float in the gutter above its card —
 * left-aligned to the row while the card's own content began 16px further in,
 * so the label read as loose furniture rather than as belonging to the thing
 * below it. The rail binds the two into one block and carries the legend's
 * colour a second time, which is what makes a day's list scannable by hue
 * before any of it is read.
 */
const railClasses: Record<AgendaEventType, string> = {
  consultation: 'border-primary',
  return: 'border-violet',
  recall: 'border-warning',
  followUp: 'border-success',
  birthday: 'border-secondary',
};

const distinctTypes = (events: readonly AgendaEvent[]): AgendaEventType[] => [
  ...new Set(events.map((event) => event.type)),
];

const startOfMonth = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), 1);
