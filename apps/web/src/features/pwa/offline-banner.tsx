import { WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOnlineStatus } from './use-online-status';

/**
 * Strip at the top of every screen while the browser is offline. It sits in the page flow, above the
 * layout, so it pushes the content down instead of covering the sticky navigation.
 */
export function OfflineBanner() {
  const { t } = useTranslation();
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div
      role="status"
      className="relative z-20 flex items-center justify-center gap-2 border-b bg-muted px-4 py-2 text-center text-sm font-medium text-foreground"
    >
      <WifiOff className="size-4 shrink-0" aria-hidden />
      <span>{t('pwa.offline.banner')}</span>
    </div>
  );
}
