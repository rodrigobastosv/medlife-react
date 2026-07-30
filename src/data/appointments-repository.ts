import { AppError } from '@/core/errors';
import { toDateColumn } from '@/core/format';
import { supabase } from '@/core/supabase/client';
import { Table } from '@/core/supabase/tables';
import {
  appointmentDraftToColumns,
  financeToColumns,
  toAppointment,
  type Appointment,
  type AppointmentDraft,
  type AppointmentRow,
} from '@/domain/appointments/appointment';

/**
 * Reads and writes of `appointments`, plus the second table its money lives in.
 *
 * `canSeeFinances` is threaded through every read because the embed is only
 * requested for a doctor. Asking for it as a secretary would be *safe* — RLS
 * filters the row and PostgREST returns `null` in its place — but it is a join
 * that can never return anything, on every listing she opens.
 */
interface Scope {
  /** The doctor whose data is on screen (the user, or the selected doctor). */
  ownerId: string;
  canSeeFinances: boolean;
}

const columns = (scope: Scope): string =>
  scope.canSeeFinances ? '*, appointment_finances(*)' : '*';

const columnsWithPatient = (scope: Scope): string =>
  scope.canSeeFinances
    ? '*, patients(full_name), appointment_finances(*)'
    : '*, patients(full_name)';

export async function fetchPatientAppointments(
  scope: Scope,
  patientId: string,
): Promise<Appointment[]> {
  const { data, error } = await supabase
    .from(Table.appointments)
    .select(columns(scope))
    .eq('owner_id', scope.ownerId)
    .eq('patient_id', patientId)
    .order('scheduled_date', { ascending: false })
    .order('scheduled_time', { ascending: false, nullsFirst: false })
    .overrideTypes<AppointmentRow[], { merge: false }>();

  if (error !== null) throw new AppError('Não foi possível carregar as consultas', error);
  return data.map(toAppointment);
}

/** Recalls whose date has already arrived — the "call this patient" backlog. */
export async function fetchPendingRecalls(scope: Scope, asOf: Date): Promise<Appointment[]> {
  const { data, error } = await supabase
    .from(Table.appointments)
    .select(columnsWithPatient(scope))
    .eq('owner_id', scope.ownerId)
    .not('recall_date', 'is', null)
    .lte('recall_date', toDateColumn(asOf))
    .order('recall_date', { ascending: true })
    .overrideTypes<AppointmentRow[], { merge: false }>();

  if (error !== null) throw new AppError('Não foi possível carregar os recalls', error);
  return data.map(toAppointment);
}

export async function fetchUpcomingReturns(scope: Scope, from: Date): Promise<Appointment[]> {
  const { data, error } = await supabase
    .from(Table.appointments)
    .select(columnsWithPatient(scope))
    .eq('owner_id', scope.ownerId)
    .not('next_return_date', 'is', null)
    .gte('next_return_date', toDateColumn(from))
    .order('next_return_date', { ascending: true })
    .overrideTypes<AppointmentRow[], { merge: false }>();

  if (error !== null) throw new AppError('Não foi possível carregar os retornos', error);
  return data.map(toAppointment);
}

/**
 * Appointments whose visit, return **or** recall date lands in `[from, to]`.
 *
 * The `or(...)` is one string because that is PostgREST's syntax for a
 * disjunction of conjunctions: `and(...)` groups a pair of bounds, and the
 * commas at the top level are the OR. Three separate `.gte()/.lte()` calls would
 * AND together and match almost nothing.
 */
export async function fetchAgenda(
  scope: Scope,
  range: { from: Date; to: Date },
): Promise<Appointment[]> {
  const from = toDateColumn(range.from);
  const to = toDateColumn(range.to);

  const { data, error } = await supabase
    .from(Table.appointments)
    .select(columnsWithPatient(scope))
    .eq('owner_id', scope.ownerId)
    .or(
      `and(scheduled_date.gte.${from},scheduled_date.lte.${to}),` +
        `and(next_return_date.gte.${from},next_return_date.lte.${to}),` +
        `and(recall_date.gte.${from},recall_date.lte.${to})`,
    )
    .order('scheduled_date', { ascending: true })
    // Within a day the running order is the clock. Legacy rows with no time
    // sort first rather than vanishing to the bottom of the list.
    .order('scheduled_time', { ascending: true, nullsFirst: true })
    .overrideTypes<AppointmentRow[], { merge: false }>();

  if (error !== null) throw new AppError('Não foi possível carregar a agenda', error);
  return data.map(toAppointment);
}

/**
 * Everything scheduled for one day, in clock order — what the home screen shows
 * as "hoje".
 *
 * A day is a range of one, so this could have gone through
 * `fetchAppointmentsInRange`. It is separate because it wants the patient's name
 * joined (the home screen lists who is coming) and that read deliberately does
 * not — it feeds the report, which counts rows and would be paying for a join it
 * never reads.
 */
export async function fetchAppointmentsOnDay(scope: Scope, day: Date): Promise<Appointment[]> {
  const on = toDateColumn(day);

  const { data, error } = await supabase
    .from(Table.appointments)
    .select(columnsWithPatient(scope))
    .eq('owner_id', scope.ownerId)
    .eq('scheduled_date', on)
    .order('scheduled_time', { ascending: true, nullsFirst: true })
    .overrideTypes<AppointmentRow[], { merge: false }>();

  if (error !== null) throw new AppError('Não foi possível carregar as consultas de hoje', error);
  return data.map(toAppointment);
}

/** Appointments actually held inside the range — the reporting read. */
export async function fetchAppointmentsInRange(
  scope: Scope,
  range: { from: Date; to: Date },
): Promise<Appointment[]> {
  const { data, error } = await supabase
    .from(Table.appointments)
    .select(columns(scope))
    .eq('owner_id', scope.ownerId)
    .gte('scheduled_date', toDateColumn(range.from))
    .lte('scheduled_date', toDateColumn(range.to))
    .order('scheduled_date', { ascending: true })
    .overrideTypes<AppointmentRow[], { merge: false }>();

  if (error !== null) throw new AppError('Não foi possível carregar os dados do relatório', error);
  return data.map(toAppointment);
}

/**
 * The date of each patient's earliest appointment, considering everything up to
 * `until`. One date per patient.
 *
 * The report counts "new patients" by first appointment, and the first
 * appointment is the oldest in the patient's **whole** history — not the oldest
 * within the reported period. That is why there is no lower bound here: without
 * seeing the past, a long-standing patient who came back would be counted as new
 * all over again.
 *
 * The `lte until` is safe because all that matters is whether the minimum falls
 * inside the period. An appointment after `until` is never the minimum for
 * someone who came before, and for a patient with only future appointments the
 * minimum would land outside the period anyway. It is there purely to avoid
 * dragging the future agenda over the wire.
 */
export async function fetchFirstAppointmentDates(scope: Scope, until: Date): Promise<Date[]> {
  const { data, error } = await supabase
    .from(Table.appointments)
    .select('patient_id, scheduled_date')
    .eq('owner_id', scope.ownerId)
    .lte('scheduled_date', toDateColumn(until))
    .overrideTypes<{ patient_id: string; scheduled_date: string }[], { merge: false }>();

  if (error !== null) throw new AppError('Não foi possível carregar os dados do relatório', error);

  const firstByPatient = new Map<string, string>();
  for (const row of data) {
    const current = firstByPatient.get(row.patient_id);
    // Comparing the `yyyy-MM-dd` strings is correct and cheaper than parsing:
    // ISO dates sort lexicographically in the same order as chronologically.
    if (current === undefined || row.scheduled_date < current) {
      firstByPatient.set(row.patient_id, row.scheduled_date);
    }
  }
  // Parsed with the local-midnight helper so bucketing by month cannot slip a
  // day backwards across the timezone offset.
  return [...firstByPatient.values()].map((value) => new Date(`${value}T00:00:00`));
}

export async function createAppointment(
  scope: Scope,
  draft: AppointmentDraft,
): Promise<Appointment> {
  const { data, error } = await supabase
    .from(Table.appointments)
    .insert({ ...appointmentDraftToColumns(draft), owner_id: scope.ownerId })
    .select(columns(scope))
    .single<AppointmentRow>();

  if (error !== null) throw new AppError('Não foi possível salvar a consulta', error);

  await saveFinance(scope, data.id, draft);
  return toAppointment(data);
}

export async function updateAppointment(
  scope: Scope,
  id: string,
  draft: AppointmentDraft,
): Promise<Appointment> {
  const { data, error } = await supabase
    .from(Table.appointments)
    .update(appointmentDraftToColumns(draft))
    .eq('id', id)
    .eq('owner_id', scope.ownerId)
    .select(columns(scope))
    .single<AppointmentRow>();

  if (error !== null) throw new AppError('Não foi possível atualizar a consulta', error);

  await saveFinance(scope, id, draft);
  return toAppointment(data);
}

export async function deleteAppointment(scope: Scope, id: string): Promise<void> {
  // The `appointment_finances` row goes with it, via `on delete cascade`.
  const { error } = await supabase
    .from(Table.appointments)
    .delete()
    .eq('id', id)
    .eq('owner_id', scope.ownerId);

  if (error !== null) throw new AppError('Não foi possível excluir a consulta', error);
}

/**
 * Writes the money to its own table, in a second round trip.
 *
 * With no finance on the draft (a secretary), nothing is written: the
 * appointment simply has no `appointment_finances` row, and the doctor fills it
 * in later. `upsert` covers create and update alike because `appointment_id` is
 * the primary key.
 *
 * This is **not atomic** with the appointment write. If it fails, the
 * appointment is already saved and is left without its money. That is a
 * deliberate trade over a transactional RPC: the lost data is one form away from
 * being re-entered, and a failure here corrupts nothing clinical.
 */
async function saveFinance(
  scope: Scope,
  appointmentId: string,
  draft: AppointmentDraft,
): Promise<void> {
  const { finance } = draft;
  if (finance === null || !scope.canSeeFinances) return;

  const { error } = await supabase.from(Table.appointmentFinances).upsert({
    appointment_id: appointmentId,
    owner_id: scope.ownerId,
    ...financeToColumns(finance),
  });

  if (error !== null) throw new AppError('A consulta foi salva, mas o financeiro não', error);
}
