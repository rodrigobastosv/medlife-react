import { createContext, use } from 'react';

/**
 * One-off messages: "Paciente salvo", "Não foi possível carregar os pacientes".
 *
 * A toast, never a dialog. A modal whose only action is OK blocks the screen to
 * ask nothing; a failure the user can retry gets an action *on* the toast
 * instead. Failures stay up longer than successes, because a message you can
 * miss should not be the one carrying bad news.
 */
export type ToastTone = 'success' | 'error' | 'warning';

export interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
  action?: { label: string; onClick: () => void };
}

export interface ToastContextValue {
  showToast: (toast: Omit<Toast, 'id'>) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

/** How long each tone stays on screen. A failure is not free to miss. */
export const TOAST_DURATIONS: Record<ToastTone, number> = {
  success: 4000,
  warning: 6000,
  error: 8000,
};

export function useToast(): ToastContextValue {
  const context = use(ToastContext);
  if (context === null) throw new Error('useToast precisa estar dentro de <ToastProvider>');
  return context;
}
