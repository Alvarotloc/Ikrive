import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { routeTree } from '@/routeTree.gen';
import { createTestQueryClient, renderWithProviders } from './render';

interface RenderAppOptions {
  queryClient?: ReturnType<typeof createTestQueryClient>;
}

/**
 * Renders the whole app (the real route tree, with its guards and loaders) at `path`, inside the providers
 * of `renderWithProviders`. Declare the API routes with `mockApi` before calling it.
 *
 * Every route is code-split (`autoCodeSplitting`): the router imports each page lazily, and the first test
 * of a worker pays for Vite transforming those chunks and everything they import. Inside a `findBy*` that
 * cost counts against its 1 s timeout and, on a loaded machine, runs out with an empty body. So the chunks
 * are loaded here, before rendering: later queries only wait for the loaders and the render.
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
  return { router, ...renderWithProviders(<RouterProvider router={router} />, { queryClient }) };
}
