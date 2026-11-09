import { type ErrorComponentProps, Link, useRouter } from '@tanstack/react-router';
import { WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Brand } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { isNativeApp } from '@/lib/platform';
import { isNetworkError } from './network-error';

/**
 * Error screen for a route that failed to load: «Sin conexión» when the server could not be reached,
 * the generic error otherwise. Both retry by reloading the route. In the native app, when the server
 * cannot be reached, it may be the wrong one: it also offers to change it.
 */
export function RouteErrorScreen({ error }: ErrorComponentProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const offline = isNetworkError(error);

  return (
    <div className="glow-shell flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-12 text-center">
      <Brand />
      <div role="alert" className="grid max-w-sm justify-items-center gap-3">
        {offline && <WifiOff className="size-8 text-muted-foreground" aria-hidden />}
        <h1 className="text-2xl font-bold tracking-[-0.03em]">
          {offline ? t('pwa.offline.title') : t('common.error')}
        </h1>
        {offline && <p className="text-muted-foreground">{t('pwa.offline.description')}</p>}
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Button onClick={() => void router.invalidate()}>{t('pwa.offline.retry')}</Button>
        {offline && isNativeApp() && (
          <Button variant="outline" asChild>
            <Link to="/server">{t('mobile.serverLink.change')}</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
