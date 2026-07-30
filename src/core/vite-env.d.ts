/// <reference types="vite/client" />

/**
 * Declaring the variables the app reads makes `import.meta.env.VITE_FOO` typed
 * as `string | undefined` instead of `any`, so a typo is a compile error rather
 * than a runtime `undefined`.
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string | undefined;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
