import { createAuthClient } from 'better-auth/react';
import { apiFetch, isServerMode, setSessionToken } from './server';

/** The `/api/…` path (and query) of a request better-fetch sends, whatever origin it resolved it against. */
function pathOf(input: string | URL | Request): string {
  const url = new URL(input instanceof Request ? input.url : String(input), location.origin);
  return `${url.pathname}${url.search}`;
}

export const authClient = createAuthClient({
  basePath: '/api/auth',
  fetchOptions: {
    // Every request goes through `apiFetch`: same origin with the cookie, or the server with the token.
    customFetchImpl: (input, init) => apiFetch(pathOf(input), init),
    // In server mode the session is the signed token of the `set-auth-token` header (sign-in, sign-up).
    onSuccess: ({ response }) => {
      const token = response.headers.get('set-auth-token');
      if (token && isServerMode()) setSessionToken(token);
    },
  },
});
