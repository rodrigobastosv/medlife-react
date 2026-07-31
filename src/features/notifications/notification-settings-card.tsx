import { type ReactNode } from 'react';

import { useSession } from '@/app/providers/session-context';
import { useToast } from '@/app/providers/toast-context';
import { messageOf } from '@/core/errors';
import type { UserRole } from '@/domain/auth/user-role';
import {
  isKindForRole,
  notificationKindDescription,
  notificationKindLabel,
  toUpcomingLeadMinutes,
  upcomingLeadLabel,
  UPCOMING_LEAD_OPTIONS,
} from '@/domain/notifications/notification-kind';
import type { NotificationPreferences } from '@/domain/notifications/notification-preferences';
import { Button } from '@/design-system/components/button';
import { Card, CardTitle } from '@/design-system/components/card';
import { SelectField, TextField } from '@/design-system/components/form-fields';
import { BellIcon } from '@/design-system/components/icons';
import { Switch } from '@/design-system/components/switch';
import {
  useNotificationPreferencesQuery,
  useSaveNotificationPreferencesMutation,
} from '@/features/notifications/use-notification-preferences';
import {
  usePushSubscription,
  type PushStatus,
} from '@/features/notifications/use-push-subscription';

/**
 * The notifications block in Ajustes.
 *
 * Two layers, and they are independent on purpose: the browser's permission,
 * which is granted once per device and cannot be taken back from JavaScript, and
 * the per-notification switches, which are the user's and sync with the account.
 * Someone can set their preferences on a machine where notifications are blocked
 * and have them work on their phone, so the switches are never hidden behind the
 * permission — only labelled as not yet able to reach them.
 */
export function NotificationSettingsCard() {
  const { role } = useSession();
  const { showToast } = useToast();
  const preferencesQuery = useNotificationPreferencesQuery();
  const saveMutation = useSaveNotificationPreferencesMutation();

  const push = usePushSubscription();

  const preferences = preferencesQuery.data;

  const update = (patch: Partial<NotificationPreferences>) => {
    if (preferences === undefined) return;
    saveMutation.mutate(
      { ...preferences, ...patch },
      { onError: (error) => showToast({ tone: 'error', message: messageOf(error) }) },
    );
  };

  return (
    <Card className="flex flex-col gap-4">
      <CardTitle>Notificações</CardTitle>

      <DeviceNotice
        status={push.status}
        isBusy={push.isBusy}
        onEnable={() => {
          if (preferences === undefined) return;
          push.enable(preferences, {
            onError: (error) => showToast({ tone: 'error', message: messageOf(error) }),
          });
        }}
        onDisable={() => {
          push.disable(undefined, {
            onError: (error) => showToast({ tone: 'error', message: messageOf(error) }),
          });
        }}
      />

      {/* The three states of the read, in the order they can occur. `preferences`
          is narrowed to a value by the time `<SettingRows>` is reached, which is
          why that component takes it as a required prop rather than the whole
          block reaching for it through a non-null assertion. */}
      {preferencesQuery.isPending ? (
        <p className="text-on-surface-variant text-sm">Carregando suas preferências…</p>
      ) : preferences === undefined ? (
        <p className="text-error text-sm">{messageOf(preferencesQuery.error)}</p>
      ) : (
        <SettingRows role={role} preferences={preferences} onUpdate={update} />
      )}

      {/* The scope of the setting, said once at the bottom. "Cada aparelho" is
          the part that surprises people: the switches follow the account, but
          being reachable is something each browser opts into separately, and
          somebody who set this up on the desktop will otherwise wonder why the
          phone is silent. */}
      <p className="text-on-surface-variant border-outline/70 border-t pt-4 text-sm">
        Os avisos chegam mesmo com o MedLife fechado. O que você escolhe aqui vale para a sua conta;
        já receber os avisos é liberado em cada aparelho, então repita a autorização no celular e no
        computador.
      </p>
    </Card>
  );
}

/**
 * One row per kind the role is offered, in the order they matter through a day.
 *
 * The role filter is `isKindForRole` rather than a hand-written condition, so
 * the rule lives in the domain next to the kinds themselves and the scheduler
 * enforces the same one. A switch hidden here is also a switch the planner
 * refuses to act on.
 */
function SettingRows({
  role,
  preferences,
  onUpdate,
}: {
  role: UserRole;
  preferences: NotificationPreferences;
  onUpdate: (patch: Partial<NotificationPreferences>) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      {isKindForRole('dailyAgenda', role) && (
        <SettingRow
          kind="dailyAgenda"
          isOn={preferences.dailyAgendaEnabled}
          onToggle={(dailyAgendaEnabled) => onUpdate({ dailyAgendaEnabled })}
        >
          <TextField
            label="Horário do aviso"
            type="time"
            value={preferences.dailyAgendaTime}
            onChange={(event) => onUpdate({ dailyAgendaTime: event.target.value })}
            containerClassName="max-w-44"
          />
        </SettingRow>
      )}

      {isKindForRole('recalls', role) && (
        <SettingRow
          kind="recalls"
          isOn={preferences.recallsEnabled}
          onToggle={(recallsEnabled) => onUpdate({ recallsEnabled })}
        >
          <TextField
            label="Horário do aviso"
            type="time"
            value={preferences.recallsTime}
            onChange={(event) => onUpdate({ recallsTime: event.target.value })}
            containerClassName="max-w-44"
          />
        </SettingRow>
      )}

      {/* No time control beside it, unlike the two rows above. Those are digests
          the user schedules; an acompanhamento already carries the hour the
          doctor chose for that patient, and a second hour here would only be a
          way to make the reminder arrive at the wrong one. */}
      {isKindForRole('followUps', role) && (
        <SettingRow
          kind="followUps"
          isOn={preferences.followUpsEnabled}
          onToggle={(followUpsEnabled) => onUpdate({ followUpsEnabled })}
        />
      )}

      {isKindForRole('newAppointment', role) && (
        <SettingRow
          kind="newAppointment"
          isOn={preferences.newAppointmentEnabled}
          onToggle={(newAppointmentEnabled) => onUpdate({ newAppointmentEnabled })}
        />
      )}

      {isKindForRole('upcomingVisit', role) && (
        <SettingRow
          kind="upcomingVisit"
          isOn={preferences.upcomingVisitEnabled}
          onToggle={(upcomingVisitEnabled) => onUpdate({ upcomingVisitEnabled })}
        >
          <SelectField
            label="Quando avisar"
            value={String(preferences.upcomingLeadMinutes)}
            onChange={(event) =>
              onUpdate({ upcomingLeadMinutes: toUpcomingLeadMinutes(Number(event.target.value)) })
            }
            options={UPCOMING_LEAD_OPTIONS.map((minutes) => ({
              value: String(minutes),
              label: upcomingLeadLabel[minutes],
            }))}
            containerClassName="max-w-56"
          />
        </SettingRow>
      )}
    </div>
  );
}

/**
 * A switch, and the field that configures it once it is on.
 *
 * The field is rendered only when the switch is on because it has nothing to
 * configure otherwise — a disabled time picker under an off switch is a control
 * asking to be understood before the thing it belongs to has been turned on.
 */
function SettingRow({
  kind,
  isOn,
  onToggle,
  children,
}: {
  kind: keyof typeof notificationKindLabel;
  isOn: boolean;
  onToggle: (next: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <Switch
        label={notificationKindLabel[kind]}
        description={notificationKindDescription[kind]}
        isOn={isOn}
        onToggle={onToggle}
      />
      {isOn && children !== undefined && <div className="px-4 pt-1 pb-3">{children}</div>}
    </div>
  );
}

/**
 * How close this device is to actually receiving something.
 *
 * Five states rather than a boolean, because they need five different sentences.
 * The two that matter most are the ones a boolean would merge into "off":
 * `blocked` cannot be re-requested from JavaScript at all, so offering the
 * button again would be a control that does nothing every time it is pressed;
 * and `unsupported` on iPhone means "not until this is on the home screen",
 * which is an instruction rather than a failure.
 */
function DeviceNotice({
  status,
  isBusy,
  onEnable,
  onDisable,
}: {
  status: PushStatus;
  isBusy: boolean;
  onEnable: () => void;
  onDisable: () => void;
}) {
  if (status === 'ready') {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-on-surface-variant flex flex-1 items-center gap-2 text-sm">
          <BellIcon className="size-4 shrink-0" aria-hidden />
          Este aparelho está recebendo notificações.
        </p>
        <Button size="sm" variant="ghost" isLoading={isBusy} onClick={onDisable}>
          Parar neste aparelho
        </Button>
      </div>
    );
  }

  if (status === 'blocked') {
    return (
      <p className="text-on-surface-variant text-sm">
        As notificações estão bloqueadas para o MedLife neste navegador. Só dá para liberar nas
        configurações do próprio navegador — o app não consegue pedir de novo.
      </p>
    );
  }

  if (status === 'unsupported') {
    return (
      <p className="text-on-surface-variant text-sm">
        Este navegador não recebe notificações. No iPhone, adicione o MedLife à tela de início: só
        depois disso o sistema passa a entregá-las.
      </p>
    );
  }

  if (status === 'unconfigured') {
    // An operator problem, not the user's. Telling them to enable something they
    // cannot enable would send them looking through browser settings for a
    // switch that was never the issue.
    return (
      <p className="text-on-surface-variant text-sm">
        As notificações ainda não foram configuradas nesta instalação do MedLife.
      </p>
    );
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <p className="text-on-surface-variant text-sm">
        Autorize as notificações para receber os avisos abaixo neste aparelho, mesmo com o app
        fechado.
      </p>
      <Button size="sm" icon={<BellIcon />} isLoading={isBusy} onClick={onEnable}>
        Ativar neste aparelho
      </Button>
    </div>
  );
}
