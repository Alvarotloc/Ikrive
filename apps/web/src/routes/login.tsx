import { zodResolver } from '@hookform/resolvers/zod';
import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthLayout } from '@/features/auth/auth-layout';
import { meQuery } from '@/features/auth/queries';
import { signInErrorKey } from '@/features/auth/sign-in-error';
import { requireServer } from '@/features/mobile/require-server';
import { ServerLink } from '@/features/mobile/server-link';
import { RouteErrorScreen } from '@/features/pwa/route-error';
import { authClient } from '@/lib/auth-client';

const loginSchema = z.object({ email: z.email(), password: z.string().min(1) });
type LoginForm = z.infer<typeof loginSchema>;

export const Route = createFileRoute('/login')({
  beforeLoad: async ({ context }) => {
    requireServer();
    if (await context.queryClient.ensureQueryData(meQuery)) throw redirect({ to: '/' });
  },
  component: LoginPage,
  errorComponent: RouteErrorScreen,
});

function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { queryClient } = Route.useRouteContext();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    const { error } = await authClient.signIn.email(values);
    if (error) return setError(t(signInErrorKey(error)));
    // ensureQueryData would return the cached anonymous result, so fetch the new session explicitly.
    await queryClient.fetchQuery({ ...meQuery, staleTime: 0 });
    await navigate({ to: '/' });
  });

  return (
    <AuthLayout title={t('auth.login')} subtitle={t('auth.loginSubtitle')}>
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        <FormField id="email" label={t('auth.email')} error={form.formState.errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" {...form.register('email')} />
        </FormField>
        <FormField id="password" label={t('auth.password')} error={form.formState.errors.password?.message}>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            {...form.register('password')}
          />
        </FormField>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {t('auth.login')}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          {t('auth.noAccount')}{' '}
          <Link to="/register" className="font-semibold text-foreground underline-offset-4 hover:underline">
            {t('auth.register')}
          </Link>
        </p>
        <ServerLink />
      </form>
    </AuthLayout>
  );
}
