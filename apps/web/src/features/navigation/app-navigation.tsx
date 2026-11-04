import { useQuery } from '@tanstack/react-query';
import { Link, useRouter } from '@tanstack/react-router';
import { LogOut, Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Brand } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { meQuery } from '@/features/auth/queries';
import { useLogout } from '@/features/auth/use-logout';
import { NotificationBell } from '@/features/notifications/notification-bell';
import { DESKTOP_QUERY, useMediaQuery } from '@/lib/use-media-query';
import { navItemsFor } from './nav-items';

/** App navigation: the sidebar from `md` up, a header with a menu button below it. */
export function AppNavigation() {
  return useMediaQuery(DESKTOP_QUERY) ? <Sidebar /> : <MobileHeader />;
}

/** The destinations for the signed-in user: the admin-only ones appear once `me` says they are an admin. */
function useNavItems() {
  const { data: me } = useQuery(meQuery);
  return navItemsFor(me?.role);
}

function Sidebar() {
  const { t } = useTranslation();
  const logout = useLogout();
  const navItems = useNavItems();

  return (
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
  );
}

function MobileHeader() {
  const { t } = useTranslation();

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-card/90 px-4 py-3 backdrop-blur">
      <Link to="/" className="rounded-md" aria-label={t('app.name')}>
        <Brand />
      </Link>
      <div className="flex items-center gap-1">
        <NotificationBell />
        <MobileNavMenu />
      </div>
    </header>
  );
}

function MobileNavMenu() {
  const { t } = useTranslation();
  const router = useRouter();
  const logout = useLogout();
  const navItems = useNavItems();
  const [open, setOpen] = useState(false);

  // Closes the panel on any navigation, including those that don't start in it (e.g. browser back).
  useEffect(() => router.subscribe('onBeforeNavigate', () => setOpen(false)), [router]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('nav.openMenu')}>
          <Menu aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent aria-describedby={undefined}>
        <div className="mb-4 flex items-center justify-between">
          <SheetTitle>{t('nav.menu')}</SheetTitle>
          <SheetClose asChild>
            <Button variant="ghost" size="icon" aria-label={t('nav.closeMenu')}>
              <X aria-hidden />
            </Button>
          </SheetClose>
        </div>
        <nav aria-label={t('nav.menu')} className="flex flex-col gap-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: to === '/' }}
              onClick={() => setOpen(false)}
              className="flex min-h-11 items-center gap-3 rounded-md px-3 text-[0.9375rem] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[status=active]:bg-accent data-[status=active]:font-semibold data-[status=active]:text-accent-foreground"
            >
              <Icon className="size-4" aria-hidden />
              {t(label)}
            </Link>
          ))}
        </nav>
        <div className="mt-2 border-t pt-3">
          <Button variant="ghost" className="min-h-11 w-full justify-start gap-3 px-3" onClick={logout}>
            <LogOut aria-hidden />
            {t('nav.logout')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
