import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { routes } from '@/app/routing/routes';
import { useSession } from '@/app/providers/session-context';
import { messageOf } from '@/core/errors';
import { dateOnly } from '@/core/format';
import type { Appointment } from '@/domain/appointments/appointment';
import { AppointmentTile } from '@/features/appointments/appointment-tile';
import {
  usePendingFollowUpsQuery,
  usePendingRecallsQuery,
  useTodayAppointmentsQuery,
  useUpcomingReturnsQuery,
} from '@/features/appointments/use-appointments';
import { BirthdaysCard } from '@/features/patients/birthdays-card';
import { usePatientsCountQuery, usePatientsQuery } from '@/features/patients/use-patients';
import { EmptyState } from '@/design-system/components/empty-state';
import {
  BellIcon,
  CalendarIcon,
  ChatIcon,
  ChevronRightIcon,
  PeopleIcon,
  RepeatIcon,
} from '@/design-system/components/icons';
import { Page, PageHeader, Section } from '@/design-system/components/page';
import { Skeleton, SkeletonList } from '@/design-system/components/skeleton';
import { cn } from '@/design-system/cn';

/**
 * The landing screen: how many patients there are, who needs to be called back,
 * which returns are coming up, and who has a birthday this month.
 *
 * Independent queries rather than one combined read. React runs them in
 * parallel, each renders as soon as *it* resolves, and a failure in one leaves
 * the others on screen — where a single "load everything" call would make the
 * slowest read the speed of the page and any one failure the failure of all of
 * it.
 */
export function HomePage() {
  const patientsCount = usePatientsCountQuery();
  const today = useTodayAppointmentsQuery();
  const recalls = usePendingRecallsQuery();
  const returns = useUpcomingReturnsQuery();

  // Acompanhamentos are the doctor's own contact list — "ask how this patient
  // is" — as opposed to the recall queue above, which is the secretary's work of
  // booking the next consultation. A secretary is shown neither the card nor the
  // section, because it is a backlog she cannot clear. The query knows this too
  // and does not run for her.
  const { role } = useSession();
  const isDoctor = role === 'doctor';
  const followUps = usePendingFollowUpsQuery();

  // The birthday card needs the patients themselves, not a count. That is the
  // same cache entry Pacientes fills, so moving between the two screens costs
  // one request rather than two — and there is no cheaper server-side answer to
  // ask for: "birthday this month" is `extract(month from birth_date)`, which is
  // a computation PostgREST cannot filter on without a generated column.
  const patients = usePatientsQuery();

  // Read once, at mount, and handed down. Every date on the card — the month in
  // its title, the month it filters by, and the "hoje" badge — has to come from
  // the same instant, or a session left open across midnight shows a heading
  // that contradicts the list beneath it.
  const [currentDay] = useState(() => dateOnly(new Date()));

  return (
    <Page>
      <PageHeader title="Início" subtitle="Seu resumo de hoje." />

      <div className="flex flex-col gap-8">
        <Link
          to={routes.patients}
          // `color-mix` toward black, not `brightness-110` — the same reasoning
          // written up in `button-classes.ts`: brightness on a saturated teal
          // desaturates it and shifts its hue, so the hover read as a different
          // colour rather than as a darker one. And a press gets the same
          // acknowledgement every button in the app gives.
          className="bg-primary text-on-primary flex items-center gap-4 rounded-l p-6 transition-[background-color,transform] duration-150 hover:bg-[color-mix(in_oklab,var(--ml-primary),black_12%)] active:scale-[0.99]"
        >
          <span className="bg-on-primary/20 rounded-full p-2">
            <PeopleIcon className="size-6" />
          </span>
          <span className="flex-1">
            {/* An em dash is the honest rendering of "not knowable", which is
                why `Figure` uses one. It is the wrong answer for "hasn't
                arrived yet": the figure flashed as a dash and then became a
                number, which reads as the count having changed. */}
            {patientsCount.isPending ? (
              <Skeleton className="bg-on-primary/25 my-1 h-8 w-20" />
            ) : (
              <span className="font-display nums block text-3xl font-bold">
                {patientsCount.data ?? '—'}
              </span>
            )}
            <span className="text-sm opacity-90">
              {patientsCount.data === 1 ? 'paciente cadastrado' : 'pacientes cadastrados'}
            </span>
          </span>
          <ChevronRightIcon className="size-6" />
        </Link>

        {/* Three across for a secretary, four for a doctor. The column count
            follows the number of cards rather than being fixed at three, or the
            fourth would sit alone on a row of its own. */}
        <div
          className={
            isDoctor ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-4' : 'grid gap-4 sm:grid-cols-3'
          }
        >
          <SummaryCard
            icon={<CalendarIcon />}
            label="Consultas hoje"
            value={today.data?.length}
            isPending={today.isPending}
            tone="primary"
            href="#consultas-hoje"
          />
          <SummaryCard
            icon={<BellIcon />}
            label="Recalls pendentes"
            value={recalls.data?.length}
            isPending={recalls.isPending}
            tone="warning"
            href="#recalls"
          />
          {isDoctor && (
            <SummaryCard
              icon={<ChatIcon />}
              label="Acompanhamentos"
              value={followUps.data?.length}
              isPending={followUps.isPending}
              tone="success"
              href="#acompanhamentos"
            />
          )}
          <SummaryCard
            icon={<RepeatIcon />}
            label="Retornos futuros"
            value={returns.data?.length}
            isPending={returns.isPending}
            tone="violet"
            href="#retornos"
          />
        </div>

        {/* First, and above the rest: the subtitle promises "seu resumo de hoje",
            and until now the screen answered with totals and future dates. This
            is the only block on it that says what is happening today. */}
        <Section id="consultas-hoje" title="Consultas de hoje">
          <AppointmentList
            isPending={today.isPending}
            error={today.error}
            appointments={today.data}
            emptyTitle="Nenhuma consulta hoje"
            emptyMessage="Nada marcado para hoje. As consultas do dia aparecem aqui, em ordem de horário."
            emptyIcon={<CalendarIcon />}
          />
        </Section>

        <Section id="recalls" title="Recalls pendentes">
          <AppointmentList
            isPending={recalls.isPending}
            error={recalls.error}
            appointments={recalls.data}
            emptyTitle="Tudo em dia"
            emptyMessage="Nenhum contato pendente. 🎉"
            emptyIcon={<BellIcon />}
          />
        </Section>

        {isDoctor && (
          <Section id="acompanhamentos" title="Acompanhamentos pendentes">
            <AppointmentList
              isPending={followUps.isPending}
              error={followUps.error}
              appointments={followUps.data}
              emptyTitle="Nenhum acompanhamento"
              emptyMessage="Os acompanhamentos que você marcar nas consultas aparecem aqui quando chega o dia."
              emptyIcon={<ChatIcon />}
            />
          </Section>
        )}

        <Section id="retornos" title="Próximos retornos">
          <AppointmentList
            isPending={returns.isPending}
            error={returns.error}
            appointments={returns.data}
            emptyTitle="Nenhum retorno agendado"
            emptyMessage="Os retornos que você marcar nas consultas aparecem aqui."
            emptyIcon={<RepeatIcon />}
          />
        </Section>

        {/* Last on the page, and deliberately: a birthday is a reason to call
            someone, not something the day depends on. It is skipped entirely
            while the patients load and on error — the three lists above already
            carry the screen, and a fourth failure message about a courtesy list
            would be the loudest thing on it. */}
        {patients.isPending ? (
          <Skeleton className="h-32 w-full rounded-l" />
        ) : patients.isError ? null : (
          <BirthdaysCard patients={patients.data} today={currentDay} />
        )}
      </div>
    </Page>
  );
}

/**
 * The colour a summary tile carries, matched to the agenda's legend: a
 * consultation is teal, a recall amber, an acompanhamento green, a return
 * violet. Reusing that mapping is the point — the same four things are dots on
 * the calendar one screen away, and a reader who learns the colours once should
 * not have to learn them twice.
 */
type SummaryTone = 'primary' | 'warning' | 'success' | 'violet';

const summaryChipClasses: Record<SummaryTone, string> = {
  primary: 'bg-primary-container text-on-primary-container',
  warning: 'bg-warning-container text-on-warning-container',
  // Success has no container in the palette, so it follows the same low-opacity
  // construction `Tag` documents for this tone.
  success: 'bg-success/15 text-success',
  violet: 'bg-violet-container text-on-violet-container',
};

/**
 * One figure at the top of the screen, linking to the section that lists it.
 *
 * Two things were wrong with the previous version. Every tile was
 * `primary-container`, stacked directly under a `bg-primary` hero — a wall of
 * four identical teal blocks in which "3 consultas" and "12 recalls pendentes"
 * looked equally urgent, which is to say neither did. And none of them was
 * clickable, although each summarises a list sitting further down the same page.
 * Now the surface is quiet, the accent lives only in the icon chip, and the tile
 * takes you to what it counts.
 */
function SummaryCard({
  icon,
  label,
  value,
  isPending,
  tone,
  href,
}: {
  icon: ReactNode;
  label: string;
  value: number | undefined;
  isPending: boolean;
  tone: SummaryTone;
  href: string;
}) {
  return (
    <a
      href={href}
      className="bg-surface-container-low border-outline/70 hover:bg-surface-container-high flex flex-col gap-2 rounded-l border p-4 transition-[background-color,transform] duration-150 active:scale-[0.99] sm:p-6"
    >
      <span
        aria-hidden
        className={cn(
          'flex size-9 items-center justify-center rounded-full',
          summaryChipClasses[tone],
        )}
      >
        {icon}
      </span>
      {isPending ? (
        <Skeleton className="my-1 h-6 w-10" />
      ) : (
        <span className="font-display nums text-2xl font-bold">{value ?? '—'}</span>
      )}
      <span className="text-on-surface-variant text-sm">{label}</span>
    </a>
  );
}

/**
 * The three states a list can be in, in one place: still loading, failed, or
 * resolved-and-possibly-empty.
 *
 * Keeping them together is what stops the classic bug where an empty array and
 * a not-yet-loaded array render the same thing — a user with a full history
 * being told they have nothing, for as long as the request takes.
 */
function AppointmentList({
  isPending,
  error,
  appointments,
  emptyTitle,
  emptyMessage,
  emptyIcon,
}: {
  isPending: boolean;
  error: unknown;
  appointments: readonly Appointment[] | undefined;
  emptyTitle: string;
  emptyMessage: string;
  emptyIcon: ReactNode;
}) {
  if (isPending) return <SkeletonList rows={2} />;

  if (error != null) {
    return (
      <EmptyState icon={emptyIcon} title="Não foi possível carregar" message={messageOf(error)} />
    );
  }

  if (appointments === undefined || appointments.length === 0) {
    return <EmptyState icon={emptyIcon} title={emptyTitle} message={emptyMessage} />;
  }

  return (
    <div className="flex flex-col gap-3">
      {appointments.map((appointment) => (
        // The key is the appointment id, never the array index: an id survives
        // reordering and filtering, so React reuses the right DOM node instead
        // of re-rendering rows into each other's places.
        <AppointmentTile key={appointment.id} appointment={appointment} showPatientName />
      ))}
    </div>
  );
}
