/**
 * Where the API lives. Without a server URL (same-origin mode) the SPA talks to `/api/…` on its own
 * origin with the session cookie, as the web always did. With one (server mode, used by the mobile
 * app) every request goes to `<server URL>/api/…` with the bearer token of the session instead.
 * Both values live in `localStorage` and are read on every request, so a change applies at once.
 */
const SERVER_URL_KEY = 'ikrive.serverUrl';
const TOKEN_KEY = 'ikrive.sessionToken';

/** The server URL (origin + path, without trailing slash, query or hash), or `null` in same-origin mode. */
export function getServerUrl(): string | null {
  return localStorage.getItem(SERVER_URL_KEY);
}

/**
 * Sets the server URL (`null` removes it, back to same-origin mode). Throws a `TypeError` unless it is
 * an `http:` or `https:` URL, leaving the stored one as it was. It is stored as origin + path,
 * without trailing slashes, query or hash. Changing it drops the stored token:
 * the token of one server is never sent to another.
 */
export function setServerUrl(url: string | null): void {
  const next = url === null ? null : normalizeServerUrl(url);
  if (next === getServerUrl()) return;
  if (next === null) localStorage.removeItem(SERVER_URL_KEY);
  else localStorage.setItem(SERVER_URL_KEY, next);
  setSessionToken(null);
}

/** `url` as it is stored: origin + path, without trailing slashes, query or hash. Throws a `TypeError` unless it is http(s). */
export function normalizeServerUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new TypeError(`Invalid server URL: ${url}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new TypeError(`The server URL must be http(s): ${url}`);
  }
  // From the parsed URL, without query or hash: `<server URL>/api/…` must stay a valid path.
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
}

/** The session token of the server (server mode), or `null`. */
export function getSessionToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setSessionToken(token: string | null): void {
  if (token === null) localStorage.removeItem(TOKEN_KEY);
  else localStorage.setItem(TOKEN_KEY, token);
}

export const isServerMode = () => getServerUrl() !== null;

/** `/api/…` → `<server URL>/api/…` in server mode; unchanged in same-origin mode. */
export function apiUrl(path: `/api/${string}`): string {
  return `${getServerUrl() ?? ''}${path}`;
}

/**
 * The only door to the API: `path` is an `/api/…` path.
 * Same origin: `fetch(path)` with the session cookie. Server mode: `fetch(<server URL><path>)` without
 * cookies (the API allows no credentials cross-origin) and with `Authorization: Bearer <token>` if there
 * is a token. Reads the global `fetch` on every call.
 */
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const serverUrl = getServerUrl();
  if (serverUrl === null) return fetch(path, { ...init, credentials: 'include' });
  const headers = new Headers(init?.headers);
  const token = getSessionToken();
  if (token) headers.set('authorization', `Bearer ${token}`);
  return fetch(`${serverUrl}${path}`, { ...init, credentials: 'omit', headers });
}
