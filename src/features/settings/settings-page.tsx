import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { useSession } from '@/app/providers/session-context';
import { THEME_MODES, themeModeLabel, useTheme } from '@/app/providers/theme-context';
import { useToast } from '@/app/providers/toast-context';
import { routes } from '@/app/routing/routes';
import { messageOf } from '@/core/errors';
import { signOut } from '@/data/auth-repository';
import { profileDisplayName } from '@/domain/profile/profile';
import { Button } from '@/design-system/components/button';
import { Card, CardTitle } from '@/design-system/components/card';
import { cn } from '@/design-system/cn';
import { ChevronRightIcon, LogoutIcon } from '@/design-system/components/icons';
import { Page, PageHeader } from '@/design-system/components/page';
import { NotificationSettingsCard } from '@/features/notifications/notification-settings-card';

export function SettingsPage() {
  const { mode, setMode } = useTheme();
  const { displayName, email, role, doctors, ownerId, canSwitchDoctor, switchDoctor } =
    useSession();
  const { showToast } = useToast();

  const signOutMutation = useMutation({
    mutationFn: signOut,
    // No `onSuccess` navigation: signing out changes the Supabase session, the
    // session provider hears it, and `RequireAuth` redirects. Pushing a route
    // here as well would be a second source of truth for the same fact.
    onError: (error) => showToast({ tone: 'error', message: messageOf(error) }),
  });

  return (
    <Page>
      <PageHeader title="Ajustes" />

      <div className="flex flex-col gap-6">
        <Card className="flex flex-col gap-1">
          <CardTitle>Conta</CardTitle>
          <p className="mt-2 font-medium">{displayName ?? '—'}</p>
          <p className="text-on-surface-variant text-sm">{email}</p>
          <p className="text-on-surface-variant text-sm">
            {role === 'doctor' ? 'Médico(a)' : 'Secretária'}
          </p>
        </Card>

        {canSwitchDoctor && (
          <Card className="flex flex-col gap-3">
            <CardTitle>Médico ativo</CardTitle>
            <p className="text-on-surface-variant text-sm">
              Escolha de quem são os dados exibidos no app.
            </p>
            <div className="flex flex-col gap-2">
              {doctors.map((doctor) => (
                <OptionRow
                  key={doctor.id}
                  label={profileDisplayName(doctor)}
                  isSelected={doctor.id === ownerId}
                  onSelect={() => switchDoctor(doctor.id)}
                />
              ))}
            </div>
          </Card>
        )}

        {/* Doctor-only, same as the route it links to: this is her own clinic
            hours, not something a secretary manages on her behalf. */}
        {role === 'doctor' && (
          <Link to={routes.availability}>
            <Card className="hover:bg-surface-container-high flex items-center justify-between gap-3 transition-colors">
              <div>
                <CardTitle>Horários de atendimento</CardTitle>
                <p className="text-on-surface-variant mt-1 text-sm">
                  Dias, horários e exceções — feriados e horários especiais.
                </p>
              </div>
              <ChevronRightIcon className="text-on-surface-variant size-5 shrink-0" aria-hidden />
            </Card>
          </Link>
        )}

        <NotificationSettingsCard />

        <Card className="flex flex-col gap-3">
          <CardTitle>Tema</CardTitle>
          <div className="flex flex-col gap-2">
            {THEME_MODES.map((themeMode) => (
              <OptionRow
                key={themeMode}
                label={themeModeLabel[themeMode]}
                isSelected={themeMode === mode}
                onSelect={() => setMode(themeMode)}
              />
            ))}
          </div>
        </Card>

        <Button
          variant="outline"
          icon={<LogoutIcon />}
          isLoading={signOutMutation.isPending}
          onClick={() => signOutMutation.mutate()}
          className="self-start"
        >
          Sair
        </Button>
      </div>
    </Page>
  );
}

/**
 * A selectable row. Same `role="radio"` reasoning as the report's period picker:
 * the check mark is visual, `aria-checked` is what makes the state real.
 */
function OptionRow({
  label,
  isSelected,
  onSelect,
}: {
  label: string;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={isSelected}
      onClick={onSelect}
      className={cn(
        'rounded-m flex cursor-pointer items-center justify-between px-4 py-3 text-left text-sm transition-colors',
        isSelected
          ? 'bg-primary-container text-on-primary-container font-semibold'
          : 'hover:bg-surface-container',
      )}
    >
      {label}
      {isSelected && <span aria-hidden>✓</span>}
    </button>
  );
}
