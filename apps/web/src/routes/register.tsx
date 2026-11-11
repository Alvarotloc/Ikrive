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
import { startSession } from '@/features/auth/start-session';
import { requireServer } from '@/features/mobile/require-server';
import { RouteErrorScreen } from '@/features/pwa/route-error';
import { authClient } from '@/lib/auth-client';

const registerSchema = z.object({
  name: z.string().trim().min(1),
  email: z.email(),
  password: z.string().min(8),
});
type RegisterForm = z.infer<typeof registerSchema>;

export const Route = createFileRoute('/register')({
  beforeLoad: async ({ context }) => {
    requireServer();
    if (await context.queryClient.ensureQueryData(meQuery)) throw redirect({ to: '/' });
  },
  component: RegisterPage,
  errorComponent: RouteErrorScreen,
});

function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { queryClient } = Route.useRouteContext();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    const { error } = await authClient.signUp.email(values);
    if (error) return setError(error.message ?? t('common.error'));
    await startSession(queryClient);
    await navigate({ to: '/' });
  });

  return (
    <AuthLayout title={t('auth.register')} subtitle={t('auth.registerSubtitle')}>
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        <FormField id="name" label={t('auth.name')} error={form.formState.errors.name?.message}>
          <Input id="name" autoComplete="name" {...form.register('name')} />
        </FormField>
        <FormField id="email" label={t('auth.email')} error={form.formState.errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" {...form.register('email')} />
        </FormField>
        <FormField id="password" label={t('auth.password')} error={form.formState.errors.password?.message}>
          <Input id="password" type="password" autoComplete="new-password" {...form.register('password')} />
        </FormField>
        <p className="text-xs text-muted-foreground">{t('auth.firstUserHint')}</p>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {t('auth.register')}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          {t('auth.haveAccount')}{' '}
          <Link to="/login" className="font-semibold text-foreground underline-offset-4 hover:underline">
            {t('auth.login')}
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
