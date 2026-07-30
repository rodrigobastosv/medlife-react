import { createContext, use } from 'react';

import type { UserRole } from '@/domain/auth/user-role';
import type { Profile } from '@/domain/profile/profile';

/**
 * Who is signed in, and **whose data is on screen** — two different questions
 * once secretaries exist.
 *
 * A doctor owns their own data. A secretary operates on the data of one of the
 * doctors she is linked to, so "owner" stops being "the logged-in user" and
 * becomes a choice. `ownerId` below is that choice, and every query in the app
 * is filtered and cached by it.
 *
 * This is convenience, **not** access control. What stops a secretary reading a
 * doctor she is not linked to is row-level security in Supabase; if this ever
 * pointed at the wrong doctor, the database would return nothing rather than
 * someone else's records.
 */

export type SessionStatus = 'loading' | 'signed-out' | 'ready';

export interface SessionContextValue {
  status: SessionStatus;
  userId: string | null;
  email: string | null;
  displayName: string | null;
  profile: Profile | null;
  role: UserRole;
  /** Doctors a secretary is linked to. Empty for a doctor. */
  doctors: readonly Profile[];
  /** The doctor whose data is being shown. Null while loading, or if unlinked. */
  ownerId: string | null;
  /** Only a doctor sees amounts, payment methods and invoices. */
  canSeeFinances: boolean;
  /** A secretary with no active link has nothing to work on. */
  hasNoDoctor: boolean;
  canSwitchDoctor: boolean;
  switchDoctor: (doctorId: string) => void;
}

export const SessionContext = createContext<SessionContextValue | null>(null);

/** Remembers a secretary's last choice between reloads. */
export const ACTIVE_DOCTOR_KEY = 'medlife.activeDoctorId';

export function useSession(): SessionContextValue {
  const context = use(SessionContext);
  if (context === null) throw new Error('useSession precisa estar dentro de <SessionProvider>');
  return context;
}

/**
 * The scope every repository call needs: which doctor's data, and whether money
 * is visible.
 *
 * It throws when the session is not ready, and that is the point — it is only
 * ever called from inside the authenticated layout, which does not render its
 * children until `status === 'ready'`. So instead of every feature hook handling
 * a null `ownerId` it can never actually receive, the impossible case is
 * asserted once, here.
 */
export function useDataScope(): { ownerId: string; canSeeFinances: boolean } {
  const { ownerId, canSeeFinances } = useSession();
  if (ownerId === null) {
    throw new Error('useDataScope foi chamado sem um médico ativo');
  }
  return { ownerId, canSeeFinances };
}
