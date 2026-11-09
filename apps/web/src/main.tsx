import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './i18n';
import './index.css';
import { RouteErrorScreen } from './features/pwa/route-error';
import { serviceWorker } from './features/pwa/service-worker';
import { isNativeApp } from './lib/platform';
import { applyTheme, getStoredTheme } from './lib/theme';
import { routeTree } from './routeTree.gen';

applyTheme(getStoredTheme());

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
  defaultErrorComponent: RouteErrorScreen,
});

// The native build has no service worker (the APK ships its assets); the web registers it.
if (!isNativeApp()) serviceWorker.register();

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
