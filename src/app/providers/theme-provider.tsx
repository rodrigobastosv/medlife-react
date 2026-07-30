import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  THEME_MODES,
  THEME_STORAGE_KEY,
  ThemeContext,
  type ThemeMode,
} from '@/app/providers/theme-context';

/** Applies the stored theme to `<html>` and keeps it in sync with the OS. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readStoredMode);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    const apply = () => {
      const isDark = mode === 'dark' || (mode === 'system' && media.matches);
      document.documentElement.classList.toggle('dark', isDark);
    };

    apply();

    // On `system`, the theme has to keep following the OS *while the app is
    // open* — someone whose machine switches at sunset should not have to
    // reload. The listener is only attached in that mode, and removing it in the
    // cleanup is what stops a stale one firing after the mode changes.
    if (mode !== 'system') return;
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    localStorage.setItem(THEME_STORAGE_KEY, next);
  }, []);

  const value = useMemo(() => ({ mode, setMode }), [mode, setMode]);

  return <ThemeContext value={value}>{children}</ThemeContext>;
}

/**
 * Passed as `useState`'s *initializer function*, not as `useState(readStoredMode())`.
 * The difference: a plain call runs on every render and its result is thrown
 * away after the first; passing the function lets React call it exactly once.
 */
function readStoredMode(): ThemeMode {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return THEME_MODES.includes(stored as ThemeMode) ? (stored as ThemeMode) : 'system';
}
