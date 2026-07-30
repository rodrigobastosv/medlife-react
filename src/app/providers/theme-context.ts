import { createContext, use } from 'react';

/**
 * Light / dark / follow-the-system, persisted on the device.
 *
 * Device-local, not a user column: which theme suits this screen in this room is
 * a property of the machine, not of the person. The same call the Flutter app
 * makes by keeping it in Hive rather than in Supabase.
 *
 * ---
 * The context and its hook live in this file, and the provider *component* lives
 * next door in `theme-provider.tsx`. That split is not fussiness: React's Fast
 * Refresh can only hot-swap a module that exports components and nothing else,
 * so a file holding both a component and a hook loses hot reloading for the
 * whole subtree — the component remounts and your form state disappears on every
 * save. All three contexts in this app follow the same shape.
 */

export const THEME_MODES = ['light', 'dark', 'system'] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

export const themeModeLabel: Record<ThemeMode, string> = {
  light: 'Claro',
  dark: 'Escuro',
  system: 'Padrão do sistema',
};

/** Shared with the inline script in index.html, which reads it before React boots. */
export const THEME_STORAGE_KEY = 'medlife.themeMode';

export interface ThemeContextValue {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * `use(Context)` is React 19's replacement for `useContext` — the same behaviour
 * here, and the form that also accepts promises.
 *
 * Throwing when the provider is missing turns a confusing
 * "cannot read property of null" at some unrelated call site into a message
 * naming exactly what is wrong.
 */
export function useTheme(): ThemeContextValue {
  const context = use(ThemeContext);
  if (context === null) throw new Error('useTheme precisa estar dentro de <ThemeProvider>');
  return context;
}
