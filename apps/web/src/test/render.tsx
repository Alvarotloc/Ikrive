import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type RenderOptions, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { vi } from 'vitest';
import i18n from '@/i18n';
import { rejectUnmockedRequest } from './unmocked-requests';

/** A fresh client per test: no retries (errors surface at once) and no cache shared between tests. */
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
}

interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  queryClient?: QueryClient;
}

/** Renders `ui` inside the app providers (TanStack Query + i18n in Spanish) and returns a `userEvent` instance. */
export function renderWithProviders(
  ui: ReactElement,
  { queryClient = createTestQueryClient(), ...options }: RenderWithProvidersOptions = {},
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
      </QueryClientProvider>
    );
  }
  return { user: userEvent.setup(), queryClient, ...render(ui, { wrapper: Wrapper, ...options }) };
}

export interface MockResponse {
  status?: number;
  /** JSON body, or a `Blob` sent as it is (e.g. a PDF); omit it for an empty response (e.g. 204). */
  body?: unknown;
  /** Extra response headers, e.g. `content-disposition`. */
  headers?: Record<string, string>;
}

/**
 * A route handled by `mockApi`: method + path relative to `/api`, e.g. `POST /vehicles/v1/odometer`.
 * A function handler may return a promise, e.g. to hold a request in flight until the test resolves it.
 */
export type MockRoutes = Record<
  string,
  MockResponse | ((request: Request) => MockResponse | Promise<MockResponse>)
>;

/**
 * Replaces the global `fetch` with a stub that answers the given API routes without a server.
 * Errors are sent as `application/problem+json`, like the real API. A request to an undeclared route
 * rejects and fails the test with its method and URL (see `setup.ts`): declare every request the
 * component makes, even a 404 (`{ status: 404, body: problem }`).
 * A `Blob` body is sent as it is, with its `type` as `content-type` unless `headers` gives another one,
 * e.g. `{ body: new Blob(['%PDF-1.7'], { type: 'application/pdf' }), headers: { 'content-disposition': … } }`.
 * Returns the `vi.fn()` so tests can assert on the requests made.
 */
export function mockApi(routes: MockRoutes) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(new URL(input, location.origin), init);
    const path = new URL(request.url).pathname.replace(/^\/api/, '');
    const route = routes[`${request.method} ${path}`];
    if (route === undefined) return rejectUnmockedRequest(request);
    const { status = 200, body, headers } = typeof route === 'function' ? await route(request) : route;
    if (body === undefined) return new Response(null, { status, headers });
    if (body instanceof Blob) {
      // jsdom's Blob is not the one `Response` (undici) knows, which would stringify it: send its bytes.
      const bytes = await body.arrayBuffer();
      return new Response(bytes, { status, headers: { 'content-type': body.type, ...headers } });
    }
    const contentType = status >= 400 ? 'application/problem+json' : 'application/json';
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': contentType, ...headers },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/**
 * Stubs `window.matchMedia` (jsdom lacks it) so every query reports `matches`, e.g. `true` for the
 * desktop layout and `false` for the mobile one.
 */
export function mockMediaQuery(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}
