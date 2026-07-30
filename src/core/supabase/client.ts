import { createClient } from '@supabase/supabase-js';

import { env } from '@/core/env';

/**
 * The one Supabase client for the whole app.
 *
 * A module-level constant (created once when this module is first imported) is
 * deliberate: the client owns the auth session, its refresh timer and the
 * realtime socket. Creating a second one — for instance inside a component —
 * would race the first over token refresh and silently sign the user out.
 *
 * Nothing above `src/data/` imports this file. Components and hooks talk to
 * repositories; repositories talk to Supabase. That is the same boundary the
 * Flutter app draws with `SupabaseService`, and it is what makes the data layer
 * swappable and testable.
 */
export const supabase = createClient(env.supabaseUrl, env.supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // The e-mail confirmation link comes back as `#access_token=...`. Without
    // this the app would land on the URL and drop the session on the floor.
    detectSessionInUrl: true,
  },
});
