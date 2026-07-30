import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { routes } from '@/app/routing/routes';
import { messageOf } from '@/core/errors';
import type { Appointment } from '@/domain/appointments/appointment';
import { AppointmentTile } from '@/features/appointments/appointment-tile';
import {
  usePendingRecallsQuery,
  useTodayAppointmentsQuery,
  useUpcomingReturnsQuery,
} from '@/features/appointments/use-appointments';
import { usePatientsCountQuery } from '@/features/patients/use-patients';
import { Card } from '@/design-system/components/card';
import { EmptyState } from '@/design-system/components/empty-state';
import {
  BellIcon,
  CalendarIcon,
  ChevronRightIcon,
  PeopleIcon,
  RepeatIcon,
} from '@/design-system/components/icons';
import { Page, PageHeader, Section } from '@/design-system/components/page';
import { SkeletonList } from '@/design-system/components/skeleton';

/**
 * The landing screen: how many patients there are, who needs to be called back,
 * and which returns are coming up.
 *
 * Three independent queries rather than one combined read. React runs them in
 * parallel, each renders as soon as *it* resolves, and a failure in one leaves
 * the other two on screen — where a single "load everything" call would make the
 * slowest read the speed of the page and any one failure the failure of all of
 * it.
 */
export function HomePage() {
  const patientsCount = usePatientsCountQuery();
  const today = useTodayAppointmentsQuery();
  const recalls = usePendingRecallsQuery();
  const returns = useUpcomingReturnsQuery();

  return (
    <Page>
      <PageHeader title="Início" subtitle="Seu resumo de hoje." />

      <div className="flex flex-col gap-8">
        <Link
          to={routes.patients}
          className="bg-primary text-on-primary flex items-center gap-4 rounded-l p-6 transition-[filter] hover:brightness-110"
        >
          <span className="bg-on-primary/20 rounded-full p-2">
            <PeopleIcon className="size-6" />
          </span>
          <span className="flex-1">
            <span className="font-display block text-3xl font-bold">
              {patientsCount.data ?? '—'}
            </span>
            <span className="text-sm opacity-90">
              {patientsCount.data === 1 ? 'paciente cadastrado' : 'pacientes cadastrados'}
            </span>
          </span>
          <ChevronRightIcon className="size-6" />
        </Link>

        <div className="grid gap-4 sm:grid-cols-3">
          <SummaryCard icon={<CalendarIcon />} label="Consultas hoje" value={today.data?.length} />
          <SummaryCard icon={<BellIcon />} label="Recalls pendentes" value={recalls.data?.length} />
          <SummaryCard
            icon={<RepeatIcon />}
            label="Retornos futuros"
            value={returns.data?.length}
          />
        </div>

        {/* First, and above the rest: the subtitle promises "seu resumo de hoje",
            and until now the screen answered with totals and future dates. This
            is the only block on it that says what is happening today. */}
        <Section title="Consultas de hoje">
          <AppointmentList
            isPending={today.isPending}
            error={today.error}
            appointments={today.data}
            emptyTitle="Nenhuma consulta hoje"
            emptyMessage="Nada marcado para hoje. As consultas do dia aparecem aqui, em ordem de horário."
            emptyIcon={<CalendarIcon />}
          />
        </Section>

        <Section title="Recalls pendentes">
          <AppointmentList
            isPending={recalls.isPending}
            error={recalls.error}
            appointments={recalls.data}
            emptyTitle="Tudo em dia"
            emptyMessage="Nenhum contato pendente. 🎉"
            emptyIcon={<BellIcon />}
          />
        </Section>

        <Section title="Próximos retornos">
          <AppointmentList
            isPending={returns.isPending}
            error={returns.error}
            appointments={returns.data}
            emptyTitle="Nenhum retorno agendado"
            emptyMessage="Os retornos que você marcar nas consultas aparecem aqui."
            emptyIcon={<RepeatIcon />}
          />
        </Section>
      </div>
    </Page>
  );
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number | undefined;
}) {
  return (
    <Card className="bg-primary-container text-on-primary-container flex flex-col gap-1">
      <span>{icon}</span>
      <span className="font-display text-2xl font-bold">{value ?? '—'}</span>
      <span className="text-sm">{label}</span>
    </Card>
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
