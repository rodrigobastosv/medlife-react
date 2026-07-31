import { ConfirmDialog } from '@/design-system/components/confirm-dialog';
import type { UnsavedChangesGuard } from '@/features/navigation/use-unsaved-changes-guard';

/**
 * The question `useUnsavedChangesGuard` asks, so both forms ask it in the same
 * words.
 *
 * Built on `ConfirmDialog` rather than beside it. That component is the app's
 * only modal and already gets the hard parts right — focus moves in and is
 * trapped, Escape cancels, the page behind goes inert — and a second modal
 * written for this would have to earn all of that again, or quietly not.
 *
 * It lives in its own file only because a module that exports both a component
 * and a hook breaks React Fast Refresh (`react/only-export-components`).
 */
export function UnsavedChangesDialog({ guard }: { guard: UnsavedChangesGuard }) {
  return (
    <ConfirmDialog
      open={guard.isPrompting}
      title="Alterações não salvas"
      message="Você preencheu campos que ainda não foram salvos. Se sair agora, essas informações serão perdidas."
      // The buttons name what they do, rather than answering a yes/no the user
      // has to reconstruct from the title. Escape maps to the cancel side, so
      // dismissing the dialog without reading it keeps the typing.
      confirmLabel="Sair sem salvar"
      cancelLabel="Continuar editando"
      onConfirm={guard.discardAndLeave}
      onCancel={guard.keepEditing}
    />
  );
}
