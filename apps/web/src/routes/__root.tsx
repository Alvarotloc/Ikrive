import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { Toaster } from 'sonner';
import { BackButtonHandler } from '@/features/mobile/back-button-handler';
import { NotificationTapHandler } from '@/features/notifications/notification-tap-handler';
import { OfflineBanner } from '@/features/pwa/offline-banner';
import { UpdatePrompt } from '@/features/pwa/update-prompt';
import { isNativeApp } from '@/lib/platform';

export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <>
      <OfflineBanner />
      {isNativeApp() && <NotificationTapHandler />}
      {isNativeApp() && <BackButtonHandler />}
      <Outlet />
      <Toaster
        position="top-right"
        toastOptions={{ className: 'font-sans rounded-lg! border-border! shadow-float!' }}
      />
      <UpdatePrompt />
    </>
  ),
});
