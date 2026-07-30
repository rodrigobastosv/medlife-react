import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { useToast } from '@/app/providers/toast-context';
import { routes } from '@/app/routing/routes';
import { messageOf } from '@/core/errors';
import { signUp } from '@/data/auth-repository';
import { AuthLayout } from '@/features/auth/auth-layout';
import { Button } from '@/design-system/components/button';
import { TextField } from '@/design-system/components/form-fields';

const schema = z
  .object({
    displayName: z.string().min(2, 'Informe seu nome'),
    email: z.email('Informe um e-mail válido'),
    password: z.string().min(6, 'A senha precisa ter ao menos 6 caracteres'),
    passwordConfirmation: z.string(),
  })
  // A cross-field rule belongs in the schema, not in the component: `refine`
  // sees the whole object, and `path` is what attaches the message to the field
  // the user has to fix rather than to the form as a whole.
  .refine((values) => values.password === values.passwordConfirmation, {
    message: 'As senhas não conferem',
    path: ['passwordConfirmation'],
  });

type SignUpForm = z.infer<typeof schema>;

export function SignUpPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignUpForm>({ resolver: zodResolver(schema), mode: 'onTouched' });

  const signUpMutation = useMutation({
    mutationFn: signUp,
    onSuccess: (result, variables) => {
      // With e-mail confirmation on (which this project requires — it is the
      // only proof the invited person owns that inbox), sign-up creates an
      // account with **no session**. Sending the user to the app would land them
      // on a screen that cannot load, so the page says what to do next instead.
      if (result.needsEmailConfirmation) {
        setConfirmationEmail(variables.email);
        return;
      }
      void navigate(routes.home, { replace: true });
    },
    onError: (error) => showToast({ tone: 'error', message: messageOf(error) }),
  });

  if (confirmationEmail !== null) {
    return (
      <AuthLayout
        title="Confirme seu e-mail"
        subtitle={`Enviamos um link de confirmação para ${confirmationEmail}. Abra o link para ativar sua conta.`}
        footer={
          <Link to={routes.signIn} className="text-primary font-semibold">
            Voltar para o login
          </Link>
        }
      >
        <p className="text-on-surface-variant text-sm">
          Não recebeu? Confira a caixa de spam — o link vale por algumas horas.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Criar conta"
      subtitle="Se você recebeu um convite, use o mesmo e-mail do convite."
      footer={
        <>
          Já tem conta?{' '}
          <Link to={routes.signIn} className="text-primary font-semibold">
            Entrar
          </Link>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={handleSubmit((values) =>
          signUpMutation.mutate({
            email: values.email,
            password: values.password,
            displayName: values.displayName,
          }),
        )}
        noValidate
      >
        <TextField
          label="Nome"
          autoComplete="name"
          error={errors.displayName?.message}
          {...register('displayName')}
        />
        <TextField
          label="E-mail"
          type="email"
          autoComplete="email"
          // The role is not chosen here, and that is a security property rather
          // than an omission: a database trigger assigns `secretary` when a
          // pending invitation exists for this address, and `doctor` otherwise.
          // Anything the client could send, a client could forge.
          hint="Convidada? Use exatamente o e-mail que recebeu o convite."
          error={errors.email?.message}
          {...register('email')}
        />
        <TextField
          label="Senha"
          type="password"
          autoComplete="new-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <TextField
          label="Confirmar senha"
          type="password"
          autoComplete="new-password"
          error={errors.passwordConfirmation?.message}
          {...register('passwordConfirmation')}
        />
        <Button type="submit" isLoading={signUpMutation.isPending} className="mt-2">
          Criar conta
        </Button>
      </form>
    </AuthLayout>
  );
}
