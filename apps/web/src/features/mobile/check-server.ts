import { healthSchema } from '@ikrive/shared';
import { normalizeServerUrl } from '@/lib/server';

/** Result of checking the URL typed in `/server`: the normalized URL of an Ikrive server, or why not. */
export type ServerCheck =
  | { ok: true; url: string }
  | { ok: false; reason: 'invalid' | 'unreachable' | 'notIkrive' };

const HAS_SCHEME = /^[a-z][a-z\d+.-]*:\/\//i;

/**
 * The URL typed by the user as it would be stored: `https://` is added when it has no scheme (typing on
 * a phone), then it is normalized like `setServerUrl` does. `null` unless it is a valid http(s) URL.
 */
export function parseServerInput(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  try {
    return normalizeServerUrl(HAS_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
}

/**
 * Checks that `input` is an Ikrive server by asking its `/api/health`. An invalid URL makes no request.
 * It calls `fetch` directly, not `apiFetch`: the token of the saved server must never reach another one,
 * and there are no cookies cross-origin. No answer (network, CORS, timeout) is `unreachable`; an answer
 * that is not a 2xx health response is `notIkrive`.
 */
export async function checkServer(input: string, timeoutMs = 10_000): Promise<ServerCheck> {
  const url = parseServerInput(input);
  if (url === null) return { ok: false, reason: 'invalid' };
  let response: Response;
  try {
    response = await fetch(`${url}/api/health`, {
      credentials: 'omit',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return { ok: false, reason: 'unreachable' };
  }
  if (!response.ok) return { ok: false, reason: 'notIkrive' };
  try {
    if (!healthSchema.safeParse(await response.json()).success) return { ok: false, reason: 'notIkrive' };
  } catch {
    return { ok: false, reason: 'notIkrive' };
  }
  return { ok: true, url };
}
