import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { isNativeApp } from '@/lib/platform';
import { getServerUrl } from '@/lib/server';

/** Native app: the saved server (without scheme) and a link to `/server` to change it. Nothing on the web. */
export function ServerLink() {
  const { t } = useTranslation();
  const serverUrl = getServerUrl();
  if (!isNativeApp() || serverUrl === null) return null;

  return (
    <p className="text-center text-sm text-muted-foreground">
      <span className="break-all">
        {t('mobile.serverLink.label', { server: serverUrl.replace(/^https?:\/\//, '') })}
      </span>{' '}
      ·{' '}
      <Link to="/server" className="font-semibold text-foreground underline-offset-4 hover:underline">
        {t('mobile.serverLink.change')}
      </Link>
    </p>
  );
}
