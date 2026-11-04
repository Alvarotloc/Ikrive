import { RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { type ServiceWorkerController, serviceWorker, useUpdateAvailable } from './service-worker';

/** Persistent notice shown while a new version of the app is waiting to be activated. */
export function UpdatePrompt({ controller = serviceWorker }: { controller?: ServiceWorkerController }) {
  const { t } = useTranslation();
  const updateAvailable = useUpdateAvailable(controller);
  if (!updateAvailable) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-50 flex flex-wrap items-center gap-3 border-t bg-card p-4 shadow-float sm:inset-x-auto sm:right-6 sm:bottom-6 sm:max-w-sm sm:rounded-lg sm:border"
    >
      <RefreshCw className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      <p className="min-w-0 flex-1 text-sm font-medium">{t('pwa.update.message')}</p>
      <div className="flex w-full justify-end gap-2 sm:w-auto">
        <Button variant="ghost" size="sm" onClick={() => controller.dismiss()}>
          {t('pwa.update.dismiss')}
        </Button>
        <Button size="sm" onClick={() => void controller.applyUpdate()}>
          {t('pwa.update.reload')}
        </Button>
      </div>
    </div>
  );
}
