import { useSession } from '@/app/providers/session-context';
import { profileDisplayName } from '@/domain/profile/profile';

/**
 * The foot of the sidebar: who is signed in, and — for a secretary linked to
 * more than one doctor — whose data she is looking at.
 *
 * The switcher only renders when there is a real choice to make. A secretary
 * with one doctor still sees the name, because "whose records am I editing" is
 * worth stating even when it cannot be changed; a doctor sees only themselves.
 */
export function DoctorSwitcher() {
  const { displayName, email, role, doctors, ownerId, canSwitchDoctor, switchDoctor } =
    useSession();

  const activeDoctor = doctors.find((doctor) => doctor.id === ownerId);

  return (
    <div className="border-outline mt-auto flex flex-col gap-2 border-t px-4 py-4">
      {role === 'secretary' && (
        <div className="flex flex-col gap-1">
          <span className="text-on-surface-variant text-xs font-semibold uppercase">Dados de</span>
          {canSwitchDoctor ? (
            <select
              aria-label="Médico ativo"
              value={ownerId ?? ''}
              onChange={(event) => switchDoctor(event.target.value)}
              className="bg-surface-container rounded-m px-2 py-1.5 text-sm"
            >
              {doctors.map((doctor) => (
                <option key={doctor.id} value={doctor.id}>
                  {profileDisplayName(doctor)}
                </option>
              ))}
            </select>
          ) : (
            <span className="truncate text-sm font-medium">
              {activeDoctor === undefined
                ? 'Nenhum médico vinculado'
                : profileDisplayName(activeDoctor)}
            </span>
          )}
        </div>
      )}

      <div className="flex flex-col">
        <span className="truncate text-sm font-medium">{displayName ?? email}</span>
        <span className="text-on-surface-variant text-xs">
          {role === 'doctor' ? 'Médico(a)' : 'Secretária'}
        </span>
      </div>
    </div>
  );
}
