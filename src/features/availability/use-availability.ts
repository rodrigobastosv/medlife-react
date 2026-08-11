import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useDataScope } from '@/app/providers/session-context';
import {
  deleteAvailabilityException,
  deleteAvailabilityRule,
  fetchAvailabilityExceptions,
  fetchAvailabilityRules,
  saveAvailabilityException,
  saveAvailabilityRule,
} from '@/data/availability-repository';
import type {
  AvailabilityExceptionDraft,
  AvailabilityRuleDraft,
  Weekday,
} from '@/domain/agenda/availability';
import { queryKeys } from '@/features/query-keys';

export function useAvailabilityRulesQuery() {
  const scope = useDataScope();
  return useQuery({
    queryKey: queryKeys.availability.rules(scope.ownerId),
    queryFn: () => fetchAvailabilityRules(scope),
  });
}

export function useAvailabilityExceptionsQuery() {
  const scope = useDataScope();
  return useQuery({
    queryKey: queryKeys.availability.exceptions(scope.ownerId),
    queryFn: () => fetchAvailabilityExceptions(scope),
  });
}

export function useSaveAvailabilityRuleMutation() {
  const scope = useDataScope();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (draft: AvailabilityRuleDraft) => saveAvailabilityRule(scope, draft),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.availability.rules(scope.ownerId) }),
  });
}

export function useDeleteAvailabilityRuleMutation() {
  const scope = useDataScope();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (weekday: Weekday) => deleteAvailabilityRule(scope, weekday),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.availability.rules(scope.ownerId) }),
  });
}

export function useSaveAvailabilityExceptionMutation() {
  const scope = useDataScope();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (draft: AvailabilityExceptionDraft) => saveAvailabilityException(scope, draft),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.availability.exceptions(scope.ownerId) }),
  });
}

export function useDeleteAvailabilityExceptionMutation() {
  const scope = useDataScope();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAvailabilityException(scope, id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.availability.exceptions(scope.ownerId) }),
  });
}
