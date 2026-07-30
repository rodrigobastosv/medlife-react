import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';

import { TOAST_DURATIONS, ToastContext, type Toast } from '@/app/providers/toast-context';
import { cn } from '@/design-system/cn';

/** Holds the visible toasts and renders them in a live region. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // A ref, not state: the counter is bookkeeping that must survive re-renders
  // but must never *cause* one. `useState` here would re-render on every toast
  // twice over, for a number nobody displays.
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = nextId.current++;
      // The updater form (`current => ...`) rather than `[...toasts, toast]`:
      // two toasts fired in the same tick would both read the same stale array
      // and the second would erase the first.
      setToasts((current) => [...current, { ...toast, id }]);
      window.setTimeout(() => dismiss(id), TOAST_DURATIONS[toast.tone]);
    },
    [dismiss],
  );

  // Without `useMemo` this object is a new reference on every render of the
  // provider, so every consumer re-renders even when nothing about toasts
  // changed. `showToast` being stable via `useCallback` is what makes memoising
  // the object worth anything.
  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext value={value}>
      {children}

      {/* `aria-live="polite"` makes a screen reader announce a toast when it
          appears, without interrupting whatever it is reading. A toast nobody
          can see and nobody hears is not feedback at all. */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              'rounded-m pointer-events-auto flex w-full max-w-[460px] items-center gap-3 px-4 py-3 text-sm shadow-lg',
              toast.tone === 'success' && 'bg-primary-container text-on-primary-container',
              toast.tone === 'warning' && 'bg-warning-container text-on-warning-container',
              toast.tone === 'error' && 'bg-error-container text-on-error-container',
            )}
          >
            <span className="flex-1">{toast.message}</span>
            {toast.action !== undefined && (
              <button
                type="button"
                className="cursor-pointer font-semibold underline underline-offset-2"
                onClick={() => {
                  toast.action?.onClick();
                  dismiss(toast.id);
                }}
              >
                {toast.action.label}
              </button>
            )}
            <button
              type="button"
              aria-label="Fechar"
              className="cursor-pointer opacity-70"
              onClick={() => dismiss(toast.id)}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext>
  );
}
