import { createFileRoute, Link, Outlet, redirect, useNavigate } from '@tanstack/react-router';
import { Car, Gauge, Home, LogOut, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Brand } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { meQuery } from '@/features/auth/queries';
import { NotificationBell } from '@/features/notifications/notification-bell';
import { settingsQuery } from '@/features/settings/queries';
import { useUserLocale } from '@/features/settings/use-user-locale';
import { authClient } from '@/lib/auth-client';

export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (!me) throw redirect({ to: '/login' });
    return { me };
  },
  // Locale, units and currency; not awaited so navigation is never blocked by it.
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(settingsQuery);
  },
  component: AppLayout,
});

const navItems = [
  { to: '/', icon: Home, label: 'nav.dashboard' },
  { to: '/vehicles', icon: Car, label: 'nav.vehicles' },
  { to: '/odometer', icon: Gauge, label: 'nav.odometer' },
  { to: '/settings', icon: Settings, label: 'nav.settings' },
] as const;

function AppLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { queryClient } = Route.useRouteContext();
  useUserLocale();

  const logout = async () => {
    await authClient.signOut();
    queryClient.clear();
    await navigate({ to: '/login' });
  };

  return (
    <div className="glow-shell min-h-dvh md:grid md:grid-cols-[16rem_1fr]">
      <aside className="sticky top-0 z-10 flex items-center gap-1 border-b bg-card/90 px-4 py-3 backdrop-blur md:h-dvh md:flex-col md:items-stretch md:gap-2 md:border-r md:border-b-0 md:px-5 md:py-7">
        <Link to="/" className="rounded-md md:mb-8 md:px-2" aria-label={t('app.name')}>
          <Brand />
        </Link>
        <nav className="flex flex-1 justify-end gap-0.5 sm:gap-1 md:flex-col md:justify-start">
          {navItems.map(({ to, icon: Icon, label }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: to === '/' }}
              className="flex min-h-10 items-center gap-2.5 rounded-md px-2.5 text-[0.9375rem] md:px-3 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[status=active]:bg-accent data-[status=active]:font-semibold data-[status=active]:text-accent-foreground"
            >
              <Icon className="size-4" aria-hidden />
              <span className="hidden sm:inline">{t(label)}</span>
            </Link>
          ))}
        </nav>
        <div className="flex items-center md:justify-between">
          <Button variant="ghost" size="sm" className="px-2.5 md:justify-start md:px-3" onClick={logout}>
            <LogOut aria-hidden />
            <span className="hidden sm:inline">{t('nav.logout')}</span>
          </Button>
          <NotificationBell />
        </div>
      </aside>
      <main className="mx-auto w-full max-w-[1140px] px-4 py-8 sm:px-6 md:px-10 md:py-12">
        <Outlet />
      </main>
    </div>
  );
}
