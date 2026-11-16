import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { isLocalMode } from './app-mode';
import { dataSource } from './data-source';
import { downloadBlob, openBlob } from './download';
import { getServerUrl, isServerMode } from './server';

/**
 * Files of the API (vehicle photo, invoice thumbnails and originals, export) by their `/api/…` URL.
 * In same-origin mode the browser loads them itself with the cookie (`src`, `href`). In server mode
 * there is no cookie, so they are fetched with the bearer token and shown or saved as `blob:` URLs.
 * In local mode their URLs are opaque `local://…`: they are read from the device the same way.
 */

/**
 * Whether files go through `files.get` of the `DataSource` (as `blob:` URLs) instead of being loaded by
 * the browser from their URL: server mode (no cookie) and local mode (no server at all).
 */
export const filesViaDataSource = (): boolean => isServerMode() || isLocalMode();

/**
 * In the cache by server and URL (photo URLs carry a `?v=`): a file is fetched once across screens, and
 * the same `/api/…` path of another server is never taken from the cache.
 */
const apiFileKey = (url: string) => ['api-file', getServerUrl(), url] as const;

/**
 * `src` of an API image. Same origin: the URL itself, at once. Server and local mode: `undefined` while
 * it loads, then a `blob:` URL (revoked on unmount); `isError` if the request fails.
 */
export function useApiFileSrc(url: string): { src: string | undefined; isError: boolean } {
  const viaDataSource = filesViaDataSource();
  const { data: blob, isError } = useQuery({
    queryKey: apiFileKey(url),
    queryFn: async () => (await dataSource().files.get(url)).blob,
    enabled: viaDataSource,
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
  if (!viaDataSource) return { src: url, isError: false };
  return { src: objectUrl, isError };
}

/** Server and local mode: fetches `url` through the `DataSource` and saves it with its `Content-Disposition` name, or `fallbackName`. */
export async function saveApiFile(url: string, fallbackName: string): Promise<void> {
  const { blob, fileName } = await dataSource().files.get(url);
  await downloadBlob(fileName ?? fallbackName, blob);
}

/**
 * Server and local mode: fetches `url` through the `DataSource` and opens it (a new tab on the web, the system viewer in the
 * native app) with its `Content-Disposition` name, or `fallbackName`.
 */
export async function openApiFile(url: string, fallbackName: string): Promise<void> {
  const { blob, fileName } = await dataSource().files.get(url);
  await openBlob(blob, fileName ?? fallbackName);
}
