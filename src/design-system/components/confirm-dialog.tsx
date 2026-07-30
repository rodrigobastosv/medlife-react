import { useEffect, useRef } from 'react';

import { Button } from '@/design-system/components/button';

/**
 * A confirmation before something destructive.
 *
 * Built on the native `<dialog>` element rather than a positioned `<div>`,
 * because `showModal()` gives four things for free that a hand-rolled overlay
 * has to implement and usually gets wrong: focus moves into the dialog, focus is
 * *trapped* there while it is open, Escape closes it, and everything behind it
 * becomes inert to both the mouse and the screen reader.
 *
 * This is the only kind of modal in the app. A dialog whose single action is
 * "OK" would be a barrier that asks nothing — those are toasts. A dialog is for
 * a real choice, and deleting a patient is one.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Excluir',
  cancelLabel = 'Cancelar',
  isPending = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isPending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // `<dialog>` is opened imperatively — its modal behaviour lives in a DOM
  // method, not an attribute. This effect is the bridge between React's
  // declarative `open` prop and that method, and it is a legitimate use of a
  // ref: synchronising with a browser API React does not model.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      // Escape triggers `cancel`; without handling it the prop and the DOM would
      // disagree about whether the dialog is open.
      onCancel={(event) => {
        event.preventDefault();
        if (!isPending) onCancel();
      }}
      className="bg-surface text-on-surface m-auto w-[min(28rem,calc(100vw-2rem))] rounded-l p-6 backdrop:bg-black/40"
    >
      <h2 className="font-display text-lg font-bold">{title}</h2>
      <p className="text-on-surface-variant mt-2 text-sm">{message}</p>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={isPending}>
          {cancelLabel}
        </Button>
        <Button variant="danger" onClick={onConfirm} isLoading={isPending}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
