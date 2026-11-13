import { createFileRoute, Link } from '@tanstack/react-router';
import { Server, Smartphone } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthLayout } from '@/features/auth/auth-layout';
import { useEnterLocalMode } from '@/features/mobile/local-mode';
import { requireNative } from '@/features/mobile/require-server';

export const Route = createFileRoute('/welcome')({
  beforeLoad: requireNative,
  component: WelcomePage,
});

const tileClassName =
  'flex min-h-11 w-full items-start gap-4 rounded-xl border bg-card p-5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

function TileContent({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: ReactNode;
  description: string;
}) {
  return (
    <>
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent text-foreground">
        {icon}
      </span>
      <span className="grid gap-1">
        <span className="flex flex-wrap items-center gap-2 font-semibold">{title}</span>
        <span className="text-sm text-muted-foreground">{description}</span>
      </span>
    </>
  );
}

/** First screen of the native app without a mode: with a server or with the data on this phone. */
function WelcomePage() {
  const { t } = useTranslation();
  const enterLocalMode = useEnterLocalMode();

  return (
    <AuthLayout title={t('mobile.welcome.title')} subtitle={t('mobile.welcome.subtitle')}>
      <div className="grid gap-3">
        <Link to="/server" className={`${tileClassName} hover:border-foreground/40`}>
          <TileContent
            icon={<Server className="size-5" aria-hidden />}
            title={t('mobile.welcome.server')}
            description={t('mobile.welcome.serverDescription')}
          />
        </Link>
        <button
          type="button"
          onClick={enterLocalMode}
          className={`${tileClassName} cursor-pointer hover:border-foreground/40`}
        >
          <TileContent
            icon={<Smartphone className="size-5" aria-hidden />}
            title={t('mobile.welcome.local')}
            description={t('mobile.welcome.localDescription')}
          />
        </button>
      </div>
    </AuthLayout>
  );
}
