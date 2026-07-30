import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { useSession } from '@/app/providers/session-context';
import { useToast } from '@/app/providers/toast-context';
import { messageOf } from '@/core/errors';
import { fetchSecretaries, inviteSecretary, revokeSecretary } from '@/data/secretaries-repository';
import type { SecretaryLink } from '@/domain/secretaries/secretary-link';
import { queryKeys } from '@/features/query-keys';
import { Button } from '@/design-system/components/button';
import { Card, CardTitle } from '@/design-system/components/card';
import { ConfirmDialog } from '@/design-system/components/confirm-dialog';
import { EmptyState } from '@/design-system/components/empty-state';
import { TextField } from '@/design-system/components/form-fields';
import { BadgeIcon } from '@/design-system/components/icons';
import { Page, PageHeader } from '@/design-system/components/page';
import { SkeletonList } from '@/design-system/components/skeleton';
import { Tag } from '@/design-system/components/tag';

const schema = z.object({ email: z.email('Informe um e-mail válido') });

/**
 * Who can see this doctor's data.
 *
 * The queries here are keyed by the **user's own id**, not by `ownerId`: a
 * doctor manages their own secretaries, and this screen is doctor-only. It is
 * the one feature where "whose data" is not the active-doctor question.
 */
export function SecretariesPage() {
  const { userId } = useSession();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [linkToRevoke, setLinkToRevoke] = useState<SecretaryLink | null>(null);

  const doctorId = userId ?? '';

  const secretaries = useQuery({
    queryKey: queryKeys.secretaries.all(doctorId),
    queryFn: () => fetchSecretaries(doctorId),
    enabled: userId !== null,
  });

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: queryKeys.secretaries.all(doctorId) });

  const inviteMutation = useMutation({
    mutationFn: (email: string) => inviteSecretary(doctorId, email),
    onSuccess: () => {
      showToast({ tone: 'success', message: 'Convite enviado' });
      invalidate();
    },
    onError: (error) => showToast({ tone: 'error', message: messageOf(error) }),
  });

  const revokeMutation = useMutation({
    mutationFn: (link: SecretaryLink) => revokeSecretary(doctorId, link),
    onSuccess: () => {
      showToast({ tone: 'success', message: 'Acesso revogado' });
      setLinkToRevoke(null);
      invalidate();
    },
    onError: (error) => {
      setLinkToRevoke(null);
      showToast({ tone: 'error', message: messageOf(error) });
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  return (
    <Page>
      <PageHeader title="Secretárias" subtitle="Quem tem acesso aos seus dados." />

      <div className="flex flex-col gap-6">
        <Card className="flex flex-col gap-4">
          <CardTitle>Convidar</CardTitle>
          <p className="text-on-surface-variant text-sm">
            O vínculo é criado quando ela se cadastrar no MedLife com este mesmo e-mail. Ela verá
            seus pacientes e consultas, mas nunca valores, pagamentos ou notas.
          </p>
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-start"
            onSubmit={handleSubmit((values) =>
              // `reset()` in the success callback clears the field only when the
              // invitation actually landed — clearing it optimistically would
              // lose the address the user has to re-type after a failure.
              inviteMutation.mutate(values.email, { onSuccess: () => reset() }),
            )}
            noValidate
          >
            <TextField
              label="E-mail da secretária"
              type="email"
              autoComplete="off"
              containerClassName="flex-1"
              error={errors.email?.message}
              {...register('email')}
            />
            <Button type="submit" isLoading={inviteMutation.isPending} className="sm:mt-7">
              Convidar
            </Button>
          </form>
        </Card>

        {secretaries.isPending ? (
          <SkeletonList rows={2} />
        ) : secretaries.isError ? (
          <EmptyState
            title="Não foi possível carregar"
            message={messageOf(secretaries.error)}
            actionLabel="Tentar de novo"
            onAction={() => void secretaries.refetch()}
          />
        ) : secretaries.data.length === 0 ? (
          <EmptyState
            icon={<BadgeIcon />}
            title="Nenhuma secretária"
            message="Convide alguém pelo e-mail acima para dividir a agenda com você."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {secretaries.data.map((link) => (
              <li
                key={`${link.isPending ? 'invite' : 'link'}-${link.id}`}
                className="bg-surface-container flex items-center gap-3 rounded-l p-4"
              >
                <span className="min-w-0 flex-1 truncate font-medium">{link.label}</span>
                {link.isPending && <Tag tone="warning">Convite pendente</Tag>}
                <Button variant="ghost" size="sm" onClick={() => setLinkToRevoke(link)}>
                  Revogar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={linkToRevoke !== null}
        title="Revogar acesso"
        message={
          linkToRevoke?.isPending === true
            ? 'O convite deixa de valer. Ela poderá se cadastrar, mas não verá seus dados.'
            : 'Ela perde o acesso imediatamente. O histórico de que teve acesso é preservado.'
        }
        confirmLabel="Revogar"
        isPending={revokeMutation.isPending}
        onCancel={() => setLinkToRevoke(null)}
        onConfirm={() => {
          if (linkToRevoke !== null) revokeMutation.mutate(linkToRevoke);
        }}
      />
    </Page>
  );
}
