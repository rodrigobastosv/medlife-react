import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';

import { messageOf } from '@/core/errors';
import { searchPatients } from '@/domain/patients/patient-search';
import { patientInitials, type Patient } from '@/domain/patients/patient';
import { usePatientsQuery } from '@/features/patients/use-patients';
import { EmptyState } from '@/design-system/components/empty-state';
import { TextField } from '@/design-system/components/form-fields';
import { PeopleIcon } from '@/design-system/components/icons';
import { SkeletonList } from '@/design-system/components/skeleton';
import { Button } from '@/design-system/components/button';

/**
 * Picks the patient an appointment is being created for.
 *
 * An appointment cannot exist without a patient — the form is addressed as
 * `/patients/:patientId/appointments/new` — so scheduling from anywhere that is
 * not already inside a patient's record has to answer "who?" first. That is the
 * whole job of this dialog, and why it navigates nowhere itself: it reports the
 * chosen patient and lets the caller decide where that leads.
 *
 * Built on `<dialog>` for the same reasons as `ConfirmDialog`: `showModal()`
 * moves focus in, traps it, closes on Escape, and makes the page behind it inert
 * to both the mouse and the screen reader.
 */
export function PatientPickerDialog({
  open,
  title,
  description,
  onSelect,
  onCancel,
}: {
  open: boolean;
  title: string;
  /** The context the choice is being made in — typically the date. */
  description?: string;
  onSelect: (patient: Patient) => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);

  // Only fetched once the dialog is opened — kept for a caller that has no other
  // use for the register, since a modal nobody opens should not cost a request.
  // The agenda, its only caller today, now reads the same list for the birthdays
  // on the calendar, so there the gate costs nothing and saves nothing: it is the
  // same cache entry, already resolved by the time anyone clicks.
  const patients = usePatientsQuery({ enabled: open });

  const filtered = useMemo(
    () => searchPatients(patients.data ?? [], deferredSearch),
    [patients.data, deferredSearch],
  );

  // The bridge between the declarative `open` prop and `<dialog>`'s imperative
  // API, exactly as in `ConfirmDialog`.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // A stale search term would silently hide most of the list the next time the
  // dialog is opened, and the field it came from is no longer on screen to
  // explain why.
  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      className="bg-surface text-on-surface m-auto flex max-h-[min(32rem,calc(100dvh-2rem))] w-[min(32rem,calc(100vw-2rem))] flex-col rounded-l p-6 backdrop:bg-black/40"
    >
      <h2 className="font-display text-lg font-bold">{title}</h2>
      {description !== undefined && (
        <p className="text-on-surface-variant mt-1 text-sm">{description}</p>
      )}

      <TextField
        label="Buscar"
        placeholder="Nome, CPF ou telefone"
        type="search"
        // The list is the point of the dialog, so the caret starts in the field
        // that filters it.
        autoFocus
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        containerClassName="mt-4"
      />

      {/* The only scrolling region: the header, the field and the footer stay
          put while a long register scrolls between them. */}
      <div className="-mx-2 mt-4 min-h-0 flex-1 overflow-y-auto px-2">
        {patients.isPending ? (
          <SkeletonList rows={4} />
        ) : patients.isError ? (
          <EmptyState
            icon={<PeopleIcon />}
            title="Não foi possível carregar"
            message={messageOf(patients.error)}
            actionLabel="Tentar de novo"
            onAction={() => void patients.refetch()}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<PeopleIcon />}
            title={search.trim() === '' ? 'Nenhum paciente ainda' : 'Nada encontrado'}
            message={
              search.trim() === ''
                ? 'Cadastre um paciente antes de agendar uma consulta.'
                : `Nenhum paciente corresponde a "${search}".`
            }
          />
        ) : (
          <ul className="flex flex-col gap-1">
            {filtered.map((patient) => (
              <li key={patient.id}>
                <button
                  type="button"
                  onClick={() => onSelect(patient)}
                  className="hover:bg-surface-container focus-visible:outline-primary rounded-m flex w-full cursor-pointer items-center gap-3 p-2 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2"
                >
                  <span
                    aria-hidden
                    className="bg-primary-container text-on-primary-container flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                  >
                    {patientInitials(patient)}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{patient.fullName}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 flex justify-end">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </dialog>
  );
}
