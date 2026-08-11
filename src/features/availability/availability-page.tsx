import { useState } from 'react';

import { useToast } from '@/app/providers/toast-context';
import { routes } from '@/app/routing/routes';
import { messageOf } from '@/core/errors';
import { formatDate, fromDateColumn } from '@/core/format';
import {
  WEEKDAYS,
  weekdayLabel,
  type AvailabilityException,
  type AvailabilityExceptionDraft,
  type AvailabilityRule,
  type AvailabilityRuleDraft,
  type Weekday,
} from '@/domain/agenda/availability';
import {
  APPOINTMENT_LOCATIONS,
  appointmentLocationLabel,
  type AppointmentLocation,
} from '@/domain/appointments/appointment-enums';
import {
  useAvailabilityExceptionsQuery,
  useAvailabilityRulesQuery,
  useDeleteAvailabilityExceptionMutation,
  useDeleteAvailabilityRuleMutation,
  useSaveAvailabilityExceptionMutation,
  useSaveAvailabilityRuleMutation,
} from '@/features/availability/use-availability';
import { BackLink } from '@/features/navigation/back-link';
import { Button } from '@/design-system/components/button';
import { Card, CardTitle } from '@/design-system/components/card';
import { ConfirmDialog } from '@/design-system/components/confirm-dialog';
import { PlusIcon, TrashIcon } from '@/design-system/components/icons';
import { SelectField, TextAreaField, TextField } from '@/design-system/components/form-fields';
import { Page, PageHeader } from '@/design-system/components/page';
import { Switch } from '@/design-system/components/switch';

const SLOT_DURATION_MINUTES = [15, 20, 30, 40, 45, 60] as const;

/** What a weekday defaults to the moment its switch is turned on. */
const DEFAULT_RULE_HOURS = { startTime: '08:00', endTime: '18:00', slotDurationMinutes: 30 };

const locationOptions = APPOINTMENT_LOCATIONS.map((value) => ({
  value,
  label: appointmentLocationLabel[value],
}));

export function AvailabilityPage() {
  return (
    <Page>
      <PageHeader
        title="Horários de atendimento"
        subtitle="A base de horário livre que a agenda — e, futuramente, um agendamento automático — usa."
        back={<BackLink to={routes.settings} />}
      />
      <div className="flex flex-col gap-6">
        <WeeklyHoursCard />
        <ExceptionsCard />
      </div>
    </Page>
  );
}

/* ------------------------------------------------------------------------- */
/* Weekly rule                                                               */
/* ------------------------------------------------------------------------- */

function WeeklyHoursCard() {
  const { showToast } = useToast();
  const rulesQuery = useAvailabilityRulesQuery();
  const saveMutation = useSaveAvailabilityRuleMutation();
  const deleteMutation = useDeleteAvailabilityRuleMutation();

  // One location's week at a time, rather than six weeks stacked. Forty-two
  // switches on one screen is not a list anyone reads, and the question being
  // answered here really is one place at a time: "quais dias eu atendo na
  // Oncovie". The summary below the picker is what keeps the other locations
  // from disappearing along with their rows.
  const [location, setLocation] = useState<AppointmentLocation>('oncovie');

  const onError = (error: unknown) => showToast({ tone: 'error', message: messageOf(error) });

  // Keyed by weekday for the O(1) lookup each row below needs — the query
  // itself has no reason to return more than one rule per weekday *for this
  // location* (the migration's unique index guarantees it), but a `Map` is
  // still the correct shape for "look this up by weekday" rather than
  // filtering the array seven times.
  const rulesByWeekday = new Map<Weekday, AvailabilityRule>();
  for (const rule of rulesQuery.data ?? []) {
    if (rule.location === location) rulesByWeekday.set(rule.weekday, rule);
  }

  return (
    <Card className="flex flex-col gap-1">
      <CardTitle>Horário semanal</CardTitle>
      <p className="text-on-surface-variant mb-2 text-sm">
        Os dias em que você atende, por local. Consultório e atendimento domiciliar costumam ter
        dias e durações diferentes — declare cada um no seu próprio local.
      </p>

      <SelectField
        label="Local"
        className="mb-2"
        value={location}
        onChange={(event) => setLocation(event.target.value as AppointmentLocation)}
        options={locationOptions}
      />

      {rulesQuery.isPending ? (
        <p className="text-on-surface-variant text-sm">Carregando…</p>
      ) : rulesQuery.isError ? (
        <p className="text-error text-sm">{messageOf(rulesQuery.error)}</p>
      ) : (
        <>
          {WEEKDAYS.map((weekday) => (
            <WeekdayRow
              key={weekday}
              location={location}
              weekday={weekday}
              rule={rulesByWeekday.get(weekday)}
              isBusy={saveMutation.isPending || deleteMutation.isPending}
              onSave={(draft) => saveMutation.mutate(draft, { onError })}
              onDelete={() => deleteMutation.mutate({ location, weekday }, { onError })}
            />
          ))}
          <DeclaredLocationsSummary rules={rulesQuery.data} />
        </>
      )}
    </Card>
  );
}

/**
 * "Oncovie · 2 dias · Domicílio · 4 dias" — what is declared *everywhere*, not
 * just at the location on screen.
 *
 * Without it the picker hides its own contents: switching to a location with no
 * rules shows seven blank rows, which looks identical to having lost the ones
 * declared somewhere else. This line is how the doctor sees that her home
 * visits are still there while she is looking at the clinic.
 */
function DeclaredLocationsSummary({ rules }: { rules: readonly AvailabilityRule[] }) {
  const counts = APPOINTMENT_LOCATIONS.map((location) => ({
    location,
    days: rules.filter((rule) => rule.location === location).length,
  })).filter((entry) => entry.days > 0);

  if (counts.length === 0) return null;

  return (
    <p className="text-on-surface-variant border-outline/70 mt-3 border-t pt-3 text-sm">
      Declarado:{' '}
      {counts
        .map(
          ({ location, days }) =>
            `${appointmentLocationLabel[location]} (${days} ${days === 1 ? 'dia' : 'dias'})`,
        )
        .join(' · ')}
    </p>
  );
}

function WeekdayRow({
  location,
  weekday,
  rule,
  isBusy,
  onSave,
  onDelete,
}: {
  location: AppointmentLocation;
  weekday: Weekday;
  rule: AvailabilityRule | undefined;
  isBusy: boolean;
  onSave: (draft: AvailabilityRuleDraft) => void;
  onDelete: () => void;
}) {
  const isOn = rule !== undefined;
  // Explicit rather than `rule ?? { location, weekday, ...DEFAULT_RULE_HOURS }`:
  // `rule` also carries an `id` that `AvailabilityRuleDraft` has no field for,
  // and spelling out exactly the five fields the draft needs keeps that true by
  // construction instead of by an excess property nobody asked to remove.
  const hours: AvailabilityRuleDraft =
    rule === undefined
      ? { location, weekday, ...DEFAULT_RULE_HOURS }
      : {
          location: rule.location,
          weekday: rule.weekday,
          startTime: rule.startTime,
          endTime: rule.endTime,
          slotDurationMinutes: rule.slotDurationMinutes,
        };

  return (
    <div className="flex flex-col">
      <Switch
        label={weekdayLabel[weekday]}
        isOn={isOn}
        isDisabled={isBusy}
        onToggle={(next) =>
          next ? onSave({ location, weekday, ...DEFAULT_RULE_HOURS }) : onDelete()
        }
      />
      {isOn && (
        <div className="grid grid-cols-2 gap-3 px-4 pt-1 pb-3 sm:grid-cols-3">
          <TextField
            label="Início"
            type="time"
            value={hours.startTime}
            onChange={(event) => onSave({ ...hours, startTime: event.target.value })}
          />
          <TextField
            label="Fim"
            type="time"
            value={hours.endTime}
            onChange={(event) => onSave({ ...hours, endTime: event.target.value })}
          />
          <SelectField
            label="Duração da consulta"
            containerClassName="col-span-2 sm:col-span-1"
            value={String(hours.slotDurationMinutes)}
            onChange={(event) =>
              onSave({ ...hours, slotDurationMinutes: Number(event.target.value) })
            }
            options={SLOT_DURATION_MINUTES.map((minutes) => ({
              value: String(minutes),
              label: `${minutes} min`,
            }))}
          />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Exceptions                                                                */
/* ------------------------------------------------------------------------- */

function ExceptionsCard() {
  const { showToast } = useToast();
  const exceptionsQuery = useAvailabilityExceptionsQuery();
  const saveMutation = useSaveAvailabilityExceptionMutation();
  const deleteMutation = useDeleteAvailabilityExceptionMutation();
  const [exceptionToDelete, setExceptionToDelete] = useState<AvailabilityException | null>(null);

  const onError = (error: unknown) => showToast({ tone: 'error', message: messageOf(error) });

  return (
    <Card className="flex flex-col gap-3">
      <CardTitle>Exceções</CardTitle>
      <p className="text-on-surface-variant text-sm">
        Feriados, dias sem atendimento ou com horário diferente do padrão semanal. Um feriado vale
        para todos os locais; um horário especial pode valer só para um.
      </p>

      {exceptionsQuery.isPending ? (
        <p className="text-on-surface-variant text-sm">Carregando…</p>
      ) : exceptionsQuery.isError ? (
        <p className="text-error text-sm">{messageOf(exceptionsQuery.error)}</p>
      ) : exceptionsQuery.data.length === 0 ? (
        <p className="text-on-surface-variant text-sm">Nenhuma exceção cadastrada.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {exceptionsQuery.data.map((exception) => (
            <li
              key={exception.id}
              className="rounded-m bg-surface-container flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{formatDate(exception.date)}</p>
                <p className="text-on-surface-variant text-sm">
                  {exception.isClosed
                    ? 'Fechado'
                    : `Horário especial: ${exception.startTime} – ${exception.endTime}`}
                  {' · '}
                  {exception.location === null
                    ? 'Todos os locais'
                    : appointmentLocationLabel[exception.location]}
                  {exception.note !== null && ` · ${exception.note}`}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                icon={<TrashIcon />}
                aria-label="Remover exceção"
                onClick={() => setExceptionToDelete(exception)}
              />
            </li>
          ))}
        </ul>
      )}

      <AddExceptionForm
        isSaving={saveMutation.isPending}
        onSubmit={(draft) => saveMutation.mutate(draft, { onError })}
      />

      <ConfirmDialog
        open={exceptionToDelete !== null}
        title="Remover exceção"
        message="A data volta a seguir o horário semanal normal."
        confirmLabel="Remover"
        isPending={deleteMutation.isPending}
        onCancel={() => setExceptionToDelete(null)}
        onConfirm={() => {
          if (exceptionToDelete === null) return;
          deleteMutation.mutate(exceptionToDelete.id, {
            onSuccess: () => setExceptionToDelete(null),
            onError: (error) => {
              setExceptionToDelete(null);
              onError(error);
            },
          });
        }}
      />
    </Card>
  );
}

/**
 * Local `useState`, not `react-hook-form`: this is one small "add a row" form
 * next to a list, not a page-sized record with its own route — the pattern the
 * appointment and patient forms use would be ceremony here for four fields and
 * a submit.
 */
function AddExceptionForm({
  isSaving,
  onSubmit,
}: {
  isSaving: boolean;
  onSubmit: (draft: AvailabilityExceptionDraft) => void;
}) {
  const [date, setDate] = useState('');
  // `''` is the "todos os locais" entry, which becomes `null` on submit. It is
  // the default because the common exception is a holiday, and a holiday that
  // closed only one of six locations would leave the doctor bookable on a day
  // she is not working at all.
  const [location, setLocation] = useState<AppointmentLocation | ''>('');
  const [isClosed, setIsClosed] = useState(true);
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('18:00');
  const [slotDurationMinutes, setSlotDurationMinutes] = useState(30);
  const [note, setNote] = useState('');

  const canSubmit = date !== '';

  return (
    <form
      className="border-outline/70 flex flex-col gap-3 border-t pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSubmit) return;
        onSubmit({
          date: fromDateColumn(date),
          location: location === '' ? null : location,
          isClosed,
          startTime: isClosed ? null : startTime,
          endTime: isClosed ? null : endTime,
          slotDurationMinutes: isClosed ? null : slotDurationMinutes,
          note: note === '' ? null : note,
        });
        // The date is not remembered: two exceptions on the same day *and
        // location* would upsert into the same row anyway (see the migration's
        // unique index), so a form that stayed filled in would invite editing
        // the one just added rather than adding a new one. The location is
        // deliberately kept — declaring a run of special days at one place is
        // the case where re-picking it every time would be the annoyance.
        setDate('');
        setNote('');
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Data"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          required
        />
        <SelectField
          label="Local"
          placeholder="Todos os locais"
          value={location}
          onChange={(event) => setLocation(event.target.value as AppointmentLocation | '')}
          options={locationOptions}
        />
        <Switch
          label="Dia fechado"
          description="Sem atendimento nesta data."
          isOn={isClosed}
          onToggle={setIsClosed}
          className="px-0 sm:col-span-2"
        />
      </div>

      {!isClosed && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <TextField
            label="Início"
            type="time"
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
          />
          <TextField
            label="Fim"
            type="time"
            value={endTime}
            onChange={(event) => setEndTime(event.target.value)}
          />
          <SelectField
            label="Duração da consulta"
            containerClassName="col-span-2 sm:col-span-1"
            value={String(slotDurationMinutes)}
            onChange={(event) => setSlotDurationMinutes(Number(event.target.value))}
            options={SLOT_DURATION_MINUTES.map((minutes) => ({
              value: String(minutes),
              label: `${minutes} min`,
            }))}
          />
        </div>
      )}

      <TextAreaField
        label="Observação (opcional)"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={2}
      />

      <Button
        type="submit"
        icon={<PlusIcon />}
        isLoading={isSaving}
        disabled={!canSubmit}
        className="self-start"
      >
        Adicionar exceção
      </Button>
    </form>
  );
}
