import { createFileRoute, Link } from '@tanstack/react-router';
import { Server, Smartphone } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { AuthLayout } from '@/features/auth/auth-layout';
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

/** First screen of the native app without a server: how to use it. Only «Mi servidor» exists for now. */
function WelcomePage() {
  const { t } = useTranslation();

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
          disabled
          aria-disabled
          className={`${tileClassName} cursor-not-allowed opacity-60`}
        >
          <TileContent
            icon={<Smartphone className="size-5" aria-hidden />}
            title={
              <>
                {t('mobile.welcome.local')}
                <Badge variant="stamp">{t('mobile.welcome.comingSoon')}</Badge>
              </>
            }
            description={t('mobile.welcome.localDescription')}
          />
        </button>
      </div>
    </AuthLayout>
  );
}
