import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { meQuery } from '@/features/auth/queries';
import { requireServer } from '@/features/mobile/require-server';
import { AppNavigation } from '@/features/navigation/app-navigation';
import { DeviceNotificationsSync } from '@/features/notifications/device-notifications-sync';
import { RouteErrorScreen } from '@/features/pwa/route-error';
import { settingsQuery } from '@/features/settings/queries';
import { useUserLocale } from '@/features/settings/use-user-locale';
import { isNativeApp } from '@/lib/platform';

export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context }) => {
    requireServer();
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (!me) throw redirect({ to: '/login' });
    return { me };
  },
  // Locale, units and currency; not awaited so navigation is never blocked by it.
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(settingsQuery);
  },
  component: AppLayout,
  errorComponent: RouteErrorScreen,
});

function AppLayout() {
  useUserLocale();
  const { me } = Route.useRouteContext();

  return (
    <div className="glow-shell min-h-dvh md:grid md:grid-cols-[16rem_1fr]">
      <AppNavigation />
      {isNativeApp() && <DeviceNotificationsSync userId={me.id} />}
      <main className="mx-auto w-full max-w-[1140px] px-4 py-8 sm:px-6 md:px-10 md:py-12">
        <Outlet />
      </main>
    </div>
  );
}
