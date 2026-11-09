import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Warning } from '@/components/warning';
import { AuthLayout } from '@/features/auth/auth-layout';
import { checkServer, parseServerInput } from '@/features/mobile/check-server';
import { requireNative } from '@/features/mobile/require-server';
import { useChangeServer } from '@/features/mobile/use-change-server';
import { getServerUrl } from '@/lib/server';

interface ServerForm {
  url: string;
}

export const Route = createFileRoute('/server')({
  beforeLoad: requireNative,
  component: ServerPage,
});

/** «Mi servidor»: the URL of the instance, checked with its `/api/health` before it is saved. */
function ServerPage() {
  const { t } = useTranslation();
  const changeServer = useChangeServer();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<ServerForm>({ defaultValues: { url: getServerUrl() ?? '' } });
  const url = useWatch({ control: form.control, name: 'url' });
  // Not blocking: plain HTTP is common on a LAN, but the user must know what travels in clear text.
  const insecure = parseServerInput(url)?.startsWith('http:') ?? false;

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    const result = await checkServer(values.url);
    if (result.ok) return changeServer(result.url);
    if (result.reason === 'invalid') return form.setError('url', { message: t('mobile.server.invalid') });
    setError(t(result.reason === 'unreachable' ? 'mobile.server.unreachable' : 'mobile.server.notIkrive'));
  });

  return (
    <AuthLayout title={t('mobile.server.title')} subtitle={t('mobile.server.subtitle')}>
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        <FormField id="url" label={t('mobile.server.url')} error={form.formState.errors.url?.message}>
          <Input
            id="url"
            type="url"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="url"
            spellCheck={false}
            placeholder="https://ikrive.example.com"
            {...form.register('url')}
          />
        </FormField>
        <div aria-live="polite">{insecure && <Warning>{t('mobile.server.insecure')}</Warning>}</div>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? t('mobile.server.checking') : t('mobile.server.connect')}
        </Button>
        <p className="text-center text-sm">
          <Link to="/welcome" className="font-semibold text-foreground underline-offset-4 hover:underline">
            {t('mobile.server.back')}
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
