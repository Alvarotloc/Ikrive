import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { getConfig } from '@testing-library/react';
import { routeTree } from '@/routeTree.gen';
import { createTestQueryClient, renderWithProviders } from './render';

interface RenderAppOptions {
  queryClient?: ReturnType<typeof createTestQueryClient>;
}

/**
 * Renders the whole app (the real route tree, with its guards and loaders) at `path`, inside the providers
 * of `renderWithProviders`, and resolves once the router has rendered the first page it lands on (after
 * its guards and redirects). Declare the API routes with `mockApi` before calling it.
 *
 * Booting the app is the most expensive step of a test and, in the first test of a file, a cold one: the
 * router imports each page lazily (`autoCodeSplitting`), and the first render pays for Vite transforming
 * those chunks, for V8 compiling the layout and the page, for jsdom parsing the stylesheet Sonner injects
 * (its `Toaster` calls `getComputedStyle`) and for the first `Intl` formatters. Inside a `findBy*` all of
 * that counts against its 1 s timeout and, on a loaded machine (`pnpm -r test` runs three suites at once),
 * runs out. So the chunks are loaded before rendering and the first page is awaited here: later queries
 * only wait for what the test itself does.
 *
 * It never resolves if the first navigation never ends (a loader held in flight on purpose): render with
 * `renderWithProviders` and a router of your own for that.
 */
export async function renderApp(
  path: string,
  { queryClient = createTestQueryClient() }: RenderAppOptions = {},
) {
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  await Promise.all(Object.values(router.routesById).map((route) => router.loadRouteChunk(route)));
  const rendered = new Promise<void>((resolve) => {
    const unsubscribe = router.subscribe('onRendered', () => {
      unsubscribe();
      resolve();
    });
  });
  const result = renderWithProviders(<RouterProvider router={router} />, { queryClient });
  // Waited like a `findBy*` waits (outside `act`, so React renders as it would in the app), without its timeout.
  await getConfig().asyncWrapper(() => rendered);
  return { router, ...result };
}
