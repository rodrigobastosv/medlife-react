import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  ACTIVE_DOCTOR_KEY,
  SessionContext,
  type SessionContextValue,
  type SessionStatus,
} from '@/app/providers/session-context';
import { onAuthChange } from '@/data/auth-repository';
import { fetchLinkedDoctors, fetchMyProfile } from '@/data/profile-repository';
import type { UserRole } from '@/domain/auth/user-role';

/**
 * Assembles the session from three sources: the Supabase auth session, the
 * user's profile row (which carries the role), and — for a secretary — the
 * doctors she is linked to.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [preferredDoctorId, setPreferredDoctorId] = useState<string | null>(() =>
    localStorage.getItem(ACTIVE_DOCTOR_KEY),
  );

  useEffect(() => {
    // `onAuthStateChange` fires immediately with the restored session, so there
    // is no need to also call `getSession()` — doing both is the usual source of
    // a double render and a flash of the sign-in screen on reload.
    const unsubscribe = onAuthChange((nextSession) => {
      setSession(nextSession);
      setIsSessionLoading(false);

      // A signed-out user's cached queries must not survive into the next
      // session: without this, signing in as someone else on the same browser
      // shows the previous account's patients until each query refetches.
      if (nextSession === null) queryClient.clear();
    });
    return unsubscribe;
  }, [queryClient]);

  const userId = session?.user.id ?? null;

  const profileQuery = useQuery({
    queryKey: ['profile', userId],
    // `enabled` is how a query waits for a dependency. The `!` is safe because
    // the query cannot run while `userId` is null.
    queryFn: () => fetchMyProfile(userId!),
    enabled: userId !== null,
    // A role does not change while the app is open — a trigger sets it once at
    // sign-up — so there is nothing to gain from refetching it.
    staleTime: Infinity,
  });

  const profile = profileQuery.data ?? null;
  const isSecretary = profile?.role === 'secretary';

  const doctorsQuery = useQuery({
    queryKey: ['linked-doctors', userId],
    queryFn: () => fetchLinkedDoctors(userId!),
    enabled: userId !== null && isSecretary,
    staleTime: 5 * 60 * 1000,
  });

  const doctors = useMemo(() => doctorsQuery.data ?? [], [doctorsQuery.data]);

  const switchDoctor = useCallback(
    (doctorId: string) => {
      // Ignore an id with no link. Without this guard a corrupted piece of UI
      // state would turn into a query with an arbitrary owner_id.
      if (!doctors.some((doctor) => doctor.id === doctorId)) return;
      setPreferredDoctorId(doctorId);
      localStorage.setItem(ACTIVE_DOCTOR_KEY, doctorId);
    },
    [doctors],
  );

  const value = useMemo<SessionContextValue>(() => {
    const status: SessionStatus = isSessionLoading
      ? 'loading'
      : session === null
        ? 'signed-out'
        : // A session alone is not enough to start querying: between "there is a
          // session" and "I know whose data this is" sits the profile read, and
          // letting a page query in that gap makes it query with the wrong owner.
          profile === null || (isSecretary && doctorsQuery.isPending)
          ? 'loading'
          : 'ready';

    // A doctor is their own owner. For a secretary it is the doctor she picked —
    // honouring the stored choice only while that link still exists, since a
    // revoked link must not stay selected.
    const ownerId =
      profile === null
        ? null
        : profile.role === 'doctor'
          ? profile.id
          : (doctors.find((doctor) => doctor.id === preferredDoctorId)?.id ??
            doctors[0]?.id ??
            null);

    const role: UserRole = profile?.role ?? 'doctor';

    return {
      status,
      userId,
      email: session?.user.email ?? null,
      displayName: (session?.user.user_metadata['display_name'] as string | undefined) ?? null,
      profile,
      role,
      doctors,
      ownerId,
      canSeeFinances: role === 'doctor',
      hasNoDoctor: role === 'secretary' && ownerId === null,
      canSwitchDoctor: role === 'secretary' && doctors.length > 1,
      switchDoctor,
    };
  }, [
    doctors,
    doctorsQuery.isPending,
    isSecretary,
    isSessionLoading,
    preferredDoctorId,
    profile,
    session,
    switchDoctor,
    userId,
  ]);

  return <SessionContext value={value}>{children}</SessionContext>;
}
