import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from './api-client';
import { downloadBlob, openBlob } from './download';
import { getServerUrl, isServerMode } from './server';

/**
 * Files of the API (vehicle photo, invoice thumbnails and originals, export) by their `/api/…` URL.
 * In same-origin mode the browser loads them itself with the cookie (`src`, `href`). In server mode
 * there is no cookie, so they are fetched with the bearer token and shown or saved as `blob:` URLs.
 */

/**
 * In the cache by server and URL (photo URLs carry a `?v=`): a file is fetched once across screens, and
 * the same `/api/…` path of another server is never taken from the cache.
 */
const apiFileKey = (url: string) => ['api-file', getServerUrl(), url] as const;

/**
 * `src` of an API image. Same origin: the URL itself, at once. Server mode: `undefined` while it loads,
 * then a `blob:` URL (revoked on unmount); `isError` if the request fails.
 */
export function useApiFileSrc(url: string): { src: string | undefined; isError: boolean } {
  const serverMode = isServerMode();
  const { data: blob, isError } = useQuery({
    queryKey: apiFileKey(url),
    queryFn: async () => (await api.downloadUrl(url)).blob,
    enabled: serverMode,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const [objectUrl, setObjectUrl] = useState<string>();
  useEffect(() => {
    if (!blob) return;
    const next = URL.createObjectURL(blob);
    setObjectUrl(next);
    return () => {
      URL.revokeObjectURL(next);
      setObjectUrl(undefined);
    };
  }, [blob]);
  if (!serverMode) return { src: url, isError: false };
  return { src: objectUrl, isError };
}

/** Server mode: fetches `url` with the token and saves it with its `Content-Disposition` name, or `fallbackName`. */
export async function saveApiFile(url: string, fallbackName: string): Promise<void> {
  const { blob, fileName } = await api.downloadUrl(url);
  await downloadBlob(fileName ?? fallbackName, blob);
}

/**
 * Server mode: fetches `url` with the token and opens it (a new tab on the web, the system viewer in the
 * native app) with its `Content-Disposition` name, or `fallbackName`.
 */
export async function openApiFile(url: string, fallbackName: string): Promise<void> {
  const { blob, fileName } = await api.downloadUrl(url);
  await openBlob(blob, fileName ?? fallbackName);
}
