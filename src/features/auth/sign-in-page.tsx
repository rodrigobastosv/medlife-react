import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { useToast } from '@/app/providers/toast-context';
import { routes } from '@/app/routing/routes';
import { messageOf } from '@/core/errors';
import { signIn } from '@/data/auth-repository';
import { AuthLayout } from '@/features/auth/auth-layout';
import { Button } from '@/design-system/components/button';
import { TextField } from '@/design-system/components/form-fields';

/**
 * The validation rules, as data.
 *
 * Zod describes the shape once and `zodResolver` hands the result to
 * react-hook-form, so there is no manual `if (email === '')` anywhere and the
 * form's TypeScript type is *inferred from the schema* — add a field to the
 * schema and the compiler starts requiring it in the form.
 */
const schema = z.object({
  email: z.email('Informe um e-mail válido'),
  password: z.string().min(1, 'Informe sua senha'),
});

type SignInForm = z.infer<typeof schema>;

export function SignInPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInForm>({
    resolver: zodResolver(schema),
    // Fields are only validated once they have been submitted or blurred —
    // validating as the user types tells them their e-mail is invalid while they
    // are still on the second letter of it.
    mode: 'onTouched',
  });

  const signInMutation = useMutation({
    mutationFn: signIn,
    onSuccess: () => {
      // Where the guard sent them from, or home. `replace` keeps the sign-in
      // page out of the history so Back does not return to it while signed in.
      const from = (location.state as { from?: string } | null)?.from;
      void navigate(from ?? routes.home, { replace: true });
    },
    onError: (error) => showToast({ tone: 'error', message: messageOf(error) }),
  });

  return (
    <AuthLayout
      title="Entrar"
      subtitle="Acesse sua conta para ver seus pacientes."
      footer={
        <>
          Não tem conta?{' '}
          <Link to={routes.signUp} className="text-primary font-semibold">
            Criar conta
          </Link>
        </>
      }
    >
      {/* `handleSubmit` validates first and only calls the handler with data that
          passed. It also prevents the default page reload, which is why there is
          no `event.preventDefault()` here. */}
      <form
        className="flex flex-col gap-4"
        onSubmit={handleSubmit((values) => signInMutation.mutate(values))}
        noValidate
      >
        <TextField
          label="E-mail"
          type="email"
          // Tells the browser and password manager what this field is — the
          // difference between autofill working and the user typing it again.
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <TextField
          label="Senha"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <Button type="submit" isLoading={signInMutation.isPending} className="mt-2">
          Entrar
        </Button>
      </form>
    </AuthLayout>
  );
}
