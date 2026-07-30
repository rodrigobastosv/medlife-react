import { AuthError, type Session } from '@supabase/supabase-js';

import { AppError } from '@/core/errors';
import { supabase } from '@/core/supabase/client';

/**
 * Sign in / sign up / sign out, and the session stream everything else hangs off.
 *
 * Supabase's own errors are re-thrown as `AppError` so nothing above this layer
 * has to know the SDK's error types — but the SDK's message is kept, because for
 * auth it is the useful one ("Invalid login credentials", "User already
 * registered") and it is already localised by the dashboard settings.
 */

export interface AuthCredentials {
  email: string;
  password: string;
}

export async function signIn({ email, password }: AuthCredentials): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error !== null) {
    throw new AppError(
      error instanceof AuthError ? error.message : 'Não foi possível entrar',
      error,
    );
  }
}

export async function signUp(
  credentials: AuthCredentials & { displayName: string },
): Promise<{ needsEmailConfirmation: boolean }> {
  const { data, error } = await supabase.auth.signUp({
    email: credentials.email,
    password: credentials.password,
    options: {
      data: { display_name: credentials.displayName },
      // Without this the confirmation link always returns to the project's Site
      // URL, so someone who signed up on localhost lands in production (or the
      // other way round). `window.location.origin` is where the sign-up actually
      // happened. It must be on the Supabase redirect allow-list.
      emailRedirectTo: window.location.origin,
    },
  });

  if (error !== null) {
    throw new AppError(
      error instanceof AuthError ? error.message : 'Não foi possível criar a conta',
      error,
    );
  }

  // With e-mail confirmation on, `signUp` returns a user but **no session** —
  // the account exists and cannot be used until the link is clicked. That is the
  // difference between "created" and "signed in", and the UI has to say so
  // rather than dumping the user on a screen that will not load.
  return { needsEmailConfirmation: data.session === null };
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error !== null) throw new AppError('Não foi possível sair', error);
}

export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/**
 * Subscribes to session changes and returns the unsubscribe function.
 *
 * Returning the cleanup rather than the subscription object is what lets a React
 * effect use it directly: `useEffect(() => onAuthChange(handler), [])`. An
 * unsubscribed listener here is not a small leak — it fires on every token
 * refresh, forever.
 */
export function onAuthChange(handler: (session: Session | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => handler(session));
  return () => data.subscription.unsubscribe();
}
