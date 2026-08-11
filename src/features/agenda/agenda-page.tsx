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
  type AppointmentAgendaEvent,
} from '@/domain/agenda/agenda-event';
import { buildDayTimeline } from '@/domain/agenda/day-timeline';
import { DayTimelineView } from '@/features/agenda/day-timeline-view';
import { agendaRange, useAgendaQuery } from '@/features/appointments/use-appointments';
import {
  useAvailabilityExceptionsQuery,
  useAvailabilityRulesQuery,
} from '@/features/availability/use-availability';
import { PatientContactActions } from '@/features/patients/patient-contact-actions';
import { PatientPickerDialog } from '@/features/patients/patient-picker-dialog';
import { usePatientsQuery } from '@/features/patients/use-patients';
import { Button } from '@/design-system/components/button';
import { Calendar } from '@/design-system/components/calendar';
import { Card, CardTitle } from '@/design-system/components/card';
import { EmptyState } from '@/design-system/components/empty-state';
import { CakeIcon, PlusIcon } from '@/design-system/components/icons';
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
  // The hour an empty stretch of the timeline was clicked at, or null when the
  // booking started from the button — which chooses a day and leaves the clock
  // to the form, exactly as it did before there was an axis to click.
  const [pickedTime, setPickedTime] = useState<string | null>(null);

  const navigate = useNavigate();
  const agenda = useAgendaQuery(month);
  // The declared hours decide the axis and how long each block runs. Both are
  // the same cache entries the Ajustes screen fills, so arriving from there
  // costs no request.
  const rules = useAvailabilityRulesQuery();
  const exceptions = useAvailabilityExceptionsQuery();
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
  // The day's events are read inside the memo rather than into a variable
  // beside it: `?? []` mints a new array on every render of a day with nothing
  // on it, which would make the memo recompute exactly on the days it has the
  // least to do.
  const timeline = useMemo(
    () =>
      buildDayTimeline({
        day: selectedDay,
        events: eventsByDay.get(dayKey(selectedDay)) ?? [],
        rules: rules.data ?? [],
        exceptions: exceptions.data ?? [],
      }),
    [selectedDay, eventsByDay, rules.data, exceptions.data],
  );

  const startBooking = (time: string | null) => {
    setPickedTime(time);
    setIsPickingPatient(true);
  };

  // The register is part of the answer to "what is on this day", so nothing can
  // be said about the day before it arrives. The availability queries join the
  // wait for a different reason: rendering the axis before they land would draw
  // the fallback day and then jump to the declared hours, moving every block
  // out from under the cursor.
  //
  // Hoisted because the axis and the strip are now in two places in the grid
  // and have to agree about whether the day is known yet — two copies of this
  // expression would eventually disagree, and the visible symptom would be a
  // strip rendered against a day the axis is still loading.
  const isLoading =
    agenda.isPending || patients.isPending || rules.isPending || exceptions.isPending;

  return (
    <Page>
      <PageHeader
        title="Agenda"
        subtitle="Consultas, retornos, recalls, acompanhamentos e aniversários."
      />

      {/* The DOM order is calendar → axis → strip, and the grid puts the strip
          back under the calendar on a wide screen.

          That split is the point rather than an accident of markup. On a phone
          there is one column and the source order is the reading order, so the
          axis has to come before the strip — putting four full rows between the
          month and the day's clock is what made this page unreadable on a phone
          in the first place. On a desktop the calendar column ran out about
          1200px above the bottom of the page while the right column overflowed,
          so the strip goes into that empty gutter instead of on top of the
          thing it was burying. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr] lg:grid-rows-[auto_1fr] lg:items-start">
        <Card className="lg:col-start-1 lg:row-start-1">
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

        <section className="flex flex-col gap-3 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-semibold">{formatWeekday(selectedDay)}</h2>
            {/* Scheduling starts from the day you are looking at, which is the
                whole point of doing it here rather than from the patient's
                record: the date is already chosen. */}
            <Button size="sm" icon={<PlusIcon />} onClick={() => startBooking(null)}>
              Nova consulta
            </Button>
          </div>

          {/* A *failure* to load the register is different from waiting for it:
              the agenda still has everything that was scheduled, and losing the
              whole screen over a birthday list nobody came here for would be the
              worse trade. */}
          {isLoading ? (
            <SkeletonList rows={2} />
          ) : agenda.isError ? (
            <EmptyState
              title="Não foi possível carregar a agenda"
              message={messageOf(agenda.error)}
              actionLabel="Tentar de novo"
              onAction={() => void agenda.refetch()}
            />
          ) : (
            <>
              <p className="text-on-surface-variant text-sm">
                Clique em um horário livre para marcar uma consulta nele.
              </p>

              <DayTimelineView timeline={timeline} onPickSlot={(time) => startBooking(time)} />
            </>
          )}
        </section>

        {/* Not on the axis, and now not on top of it either. A recall, a return,
            a birthday and a legacy appointment with no `scheduled_time` have no
            time of day; drawing them at the top of a clock would claim somebody
            scheduled them for midnight. The card gives that rule a heading a
            sighted reader can actually see — the list's accessible name said it
            to screen readers only, so everyone else met four cards and then a
            clock with nothing explaining why those four were not on it. */}
        {!isLoading && !agenda.isError && timeline.untimed.length > 0 && (
          <Card className="flex flex-col gap-3 lg:col-start-1 lg:row-start-2">
            <CardTitle>Sem horário definido</CardTitle>
            {/* Named, because it is not the only list on this screen — the
                patient picker holds another — and "lista" on its own tells a
                screen reader nothing about which one it has landed in. */}
            <ul aria-label="Sem horário definido" className="flex flex-col gap-2">
              {timeline.untimed.map((event) => (
                <UntimedRow key={agendaEventKey(event)} event={event} />
              ))}
            </ul>
          </Card>
        )}
      </div>

      <PatientPickerDialog
        open={isPickingPatient}
        title="Nova consulta"
        description={
          pickedTime === null
            ? `Para quem é a consulta de ${formatDate(selectedDay)}?`
            : `Para quem é a consulta de ${formatDate(selectedDay)} às ${pickedTime}?`
        }
        onCancel={() => setIsPickingPatient(false)}
        // The dialog only answers "who?"; the day and the hour it is being
        // scheduled for are this page's state, and the three meet in the URL of
        // the form.
        onSelect={(patient) => {
          setIsPickingPatient(false);
          void navigate(routes.newAppointment(patient.id, selectedDay, pickedTime ?? undefined));
        }}
      />
    </Page>
  );
}

/**
 * One row of the strip: why it is on this day, who it is about, and the two
 * buttons that act on it.
 *
 * Deliberately lighter than `AppointmentTile`, which is what this used to
 * render. That tile is the heaviest row in the app — a bordered card, a status
 * tag, a date/type/location line and a contact bar — and four of them stacked
 * up to about 870px, burying the axis under the least scheduled part of the
 * day. The tile earns that weight on a patient's record, where the appointment
 * is the subject; here the subject is the day, and each row only has to answer
 * "what is this and who do I call".
 *
 * The contact bar stays, because it is the whole reason a birthday and a recall
 * are on this screen at all: the useful next move is to phone the patient. It
 * renders nothing when the register has no number.
 */
function UntimedRow({ event }: { event: AgendaEvent }) {
  const subject =
    event.type === 'birthday'
      ? {
          id: event.patient.id,
          name: event.patient.fullName,
          phone: event.patient.phone,
          detail: ageLine(event.turningAge),
        }
      : {
          id: event.appointment.patientId,
          name: event.appointment.patientName ?? 'Paciente',
          phone: event.appointment.patientPhone,
          detail: appointmentDetail(event),
        };

  return (
    <li
      className={`rounded-m bg-surface-container-low flex flex-col gap-1.5 border-l-4 p-3 ${railClasses[event.type]}`}
    >
      <Tag
        tone={tagTones[event.type]}
        icon={event.type === 'birthday' ? <CakeIcon className="size-3.5" /> : undefined}
        className="self-start"
      >
        {agendaEventTypeLabel[event.type]}
      </Tag>
      <Link to={routes.patient(subject.id)} className="text-sm font-semibold hover:underline">
        {subject.name}
      </Link>
      {/* A `<p>`, not a `<span>`: it is a line of prose rather than an inline
          run, and keeping it out of the row's direct `span` children leaves the
          tag as the only one — which is how a reader, and `e2e/agenda.spec.ts`,
          tell "why is this row here" apart from everything else on it. */}
      <p className="text-on-surface-variant text-xs">{subject.detail}</p>
      <PatientContactActions phone={subject.phone} patientName={subject.name} className="pt-1" />
    </li>
  );
}

/**
 * The one line of context an untimed appointment row gets.
 *
 * For a return, a recall or an acompanhamento the useful fact is which
 * consultation left this task behind — the tag already said which kind of task
 * it is. A `consultation` event only reaches this strip when its
 * `scheduled_time` is null, which means the row predates the column rather than
 * being allowed to have no hour, and saying so is more honest than printing its
 * date back to a reader who is looking at that very day.
 */
function appointmentDetail(event: AppointmentAgendaEvent): string {
  if (event.type === 'consultation') return 'Sem horário registrado';
  return `Da consulta de ${formatDate(event.appointment.scheduledDate)}`;
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
