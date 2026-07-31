/**
 * Typed access to the build-time environment.
 *
 * Vite only exposes variables prefixed with `VITE_`, and it inlines them into
 * the bundle at build time — they are **public**. That is fine here for the same
 * reason it is fine in the Flutter app: the Supabase publishable key is designed
 * to be public, and what actually protects the data is row-level security.
 * Never put a `service_role` key in this file's reach.
 *
 * Reading through this module rather than sprinkling `import.meta.env` around
 * buys one thing that matters: a missing variable fails **here, at startup**,
 * with a message naming the variable — instead of surfacing later as an opaque
 * "Failed to fetch" from a Supabase call built on `undefined`.
 */
function required(name: string, value: string | undefined): string {
  if (value === undefined || value === '') {
    throw new Error(
      `${name} is missing. Copy .env.example to .env and fill it in with your Supabase credentials.`,
    );
  }
  return value;
}

export const env = {
  supabaseUrl: required('VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL),
  supabasePublishableKey: required(
    'VITE_SUPABASE_PUBLISHABLE_KEY',
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  ),
  /**
   * The VAPID **public** key, used to subscribe this browser to push.
   *
   * Public in the same sense as the key above: it is the identity the push
   * service checks a message's signature against, and it is meant to be shipped
   * to every client. The matching *private* key lives as an Edge Function secret
   * and must never appear in a `VITE_` variable — anything prefixed that way is
   * inlined into a bundle that anyone can read.
   *
   * Not `required()`: a build without it should still run, with the notification
   * card explaining that push is not configured, rather than the whole app
   * refusing to start over a feature nobody has set up yet.
   */
  vapidPublicKey: import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '',
} as const;
