import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { Toaster } from 'sonner';
import { OfflineBanner } from '@/features/pwa/offline-banner';
import { UpdatePrompt } from '@/features/pwa/update-prompt';

export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <>
      <OfflineBanner />
      <Outlet />
      <Toaster
        position="top-right"
        toastOptions={{ className: 'font-sans rounded-lg! border-border! shadow-float!' }}
      />
      <UpdatePrompt />
    </>
  ),
});
