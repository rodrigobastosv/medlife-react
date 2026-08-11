import { AppError } from '@/core/errors';
import { dateOnly, toDateColumn } from '@/core/format';
import { supabase } from '@/core/supabase/client';
import { Table } from '@/core/supabase/tables';
import {
  availabilityExceptionDraftToColumns,
  availabilityRuleDraftToColumns,
  toAvailabilityException,
  toAvailabilityRule,
  type AvailabilityException,
  type AvailabilityExceptionDraft,
  type AvailabilityExceptionRow,
  type AvailabilityRule,
  type AvailabilityRuleDraft,
  type AvailabilityRuleRow,
  type Weekday,
} from '@/domain/agenda/availability';
import type { AppointmentLocation } from '@/domain/appointments/appointment-enums';

interface Scope {
  ownerId: string;
}

export async function fetchAvailabilityRules(scope: Scope): Promise<AvailabilityRule[]> {
  const { data, error } = await supabase
    .from(Table.availabilityRules)
    .select()
    .eq('owner_id', scope.ownerId)
    // Location first: the settings screen groups the week under each place she
    // works, so this is the order it renders in and it does not have to sort.
    .order('location', { ascending: true })
    .order('weekday', { ascending: true })
    .overrideTypes<AvailabilityRuleRow[], { merge: false }>();

  if (error !== null) {
    throw new AppError('Não foi possível carregar os horários de atendimento', error);
  }
  return data.map(toAvailabilityRule);
}

/**
 * Upserts one weekday's hours at one location.
 *
 * `onConflict` targets the unique `(owner_id, location, weekday)` index from
 * `011_availability_by_location.sql` — the row it enforces exists at most once
 * is the row this always writes to, so the settings screen never has to know
 * whether a given weekday is being created or edited. The location is part of
 * that key: without it, declaring home visits on Tuesday would overwrite the
 * clinic's Tuesday instead of sitting beside it.
 */
export async function saveAvailabilityRule(
  scope: Scope,
  draft: AvailabilityRuleDraft,
): Promise<AvailabilityRule> {
  const { data, error } = await supabase
    .from(Table.availabilityRules)
    .upsert(
      { owner_id: scope.ownerId, ...availabilityRuleDraftToColumns(draft) },
      { onConflict: 'owner_id,location,weekday' },
    )
    .select()
    .single<AvailabilityRuleRow>();

  if (error !== null) throw new AppError('Não foi possível salvar o horário', error);
  return toAvailabilityRule(data);
}

export async function deleteAvailabilityRule(
  scope: Scope,
  target: { location: AppointmentLocation; weekday: Weekday },
): Promise<void> {
  const { error } = await supabase
    .from(Table.availabilityRules)
    .delete()
    .eq('owner_id', scope.ownerId)
    .eq('location', target.location)
    .eq('weekday', target.weekday);

  if (error !== null) throw new AppError('Não foi possível remover o horário', error);
}

/**
 * Exceptions from today on. A past exception no longer changes anything a
 * booking could still be made against, and would only make the list the
 * doctor reviews grow without bound.
 */
export async function fetchAvailabilityExceptions(scope: Scope): Promise<AvailabilityException[]> {
  const { data, error } = await supabase
    .from(Table.availabilityExceptions)
    .select()
    .eq('owner_id', scope.ownerId)
    .gte('exception_date', toDateColumn(dateOnly(new Date())))
    .order('exception_date', { ascending: true })
    .overrideTypes<AvailabilityExceptionRow[], { merge: false }>();

  if (error !== null) {
    throw new AppError('Não foi possível carregar as exceções de agenda', error);
  }
  return data.map(toAvailabilityException);
}

/**
 * Upserts on `(owner_id, exception_date, location)`, same reasoning as the
 * weekly rule.
 *
 * A null location — "todos os locais", the holiday case — is a real value in
 * that key rather than a missing one, which is why the index behind it is
 * declared `nulls not distinct`. Without that, every save of the same holiday
 * would insert another row instead of editing the one already there.
 */
export async function saveAvailabilityException(
  scope: Scope,
  draft: AvailabilityExceptionDraft,
): Promise<AvailabilityException> {
  const { data, error } = await supabase
    .from(Table.availabilityExceptions)
    .upsert(
      { owner_id: scope.ownerId, ...availabilityExceptionDraftToColumns(draft) },
      { onConflict: 'owner_id,exception_date,location' },
    )
    .select()
    .single<AvailabilityExceptionRow>();

  if (error !== null) throw new AppError('Não foi possível salvar a exceção', error);
  return toAvailabilityException(data);
}

export async function deleteAvailabilityException(scope: Scope, id: string): Promise<void> {
  const { error } = await supabase
    .from(Table.availabilityExceptions)
    .delete()
    .eq('id', id)
    .eq('owner_id', scope.ownerId);

  if (error !== null) throw new AppError('Não foi possível remover a exceção', error);
}
