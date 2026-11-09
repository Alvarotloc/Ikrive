import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { rejectUnmockedRequest, takeUnmockedRequests } from './unmocked-requests';

// Some modules keep the `fetch` they see on import (better-auth's `createAuthClient`), so a `mockApi`
// stubbed later in a test would never see their requests. Before any app module is imported, install a
// `fetch` that defers to whatever the global `fetch` is at call time. It is assigned directly, not with
// `vi.stubGlobal`, so `vi.unstubAllGlobals()` restores it after each test instead of removing it.
// With no stub in place, the request fails with its method and URL instead of reaching the network.
const deferredFetch: typeof fetch = (input, init) =>
  globalThis.fetch === deferredFetch
    ? rejectUnmockedRequest(
        input instanceof Request ? input : new Request(new URL(input, location.origin), init),
      )
    : globalThis.fetch(input, init);
globalThis.fetch = deferredFetch;

// jsdom does not implement scrolling and logs «Not implemented: Window's scrollTo()» every time the
// router's scroll restoration calls it. Assigned directly for the same reason as `fetch`.
window.scrollTo = () => {};

// Imported after the shim: app modules must never see the real `fetch`.
const { default: i18n } = await import('@/i18n');
// `authClient` now sends its requests through `apiFetch`, which reads the global `fetch` on each call; it
// is still imported here, before any test, as a safeguard: should it ever keep the `fetch` it sees on
// import again, it would get the deferred one and not the `mockApi` stub of the first test that loads it.
await import('@/lib/auth-client');

// Component tests always run in Spanish, whatever the machine's locale.
await i18n.changeLanguage('es');

beforeEach(() => {
  // A request left behind by the previous test must not be blamed on this one.
  takeUnmockedRequests();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  // Back to same-origin mode (no server URL nor token) for the next test.
  localStorage.clear();
  const unmocked = takeUnmockedRequests();
  if (unmocked.length > 0) throw new Error(unmocked.join('\n'));
});
