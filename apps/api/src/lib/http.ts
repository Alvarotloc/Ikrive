/** Requests to the API (`/api/*`), as opposed to the SPA files and its client routes. */
export const isApiRequest = (url: string) => url.startsWith('/api/');

/**
 * `Content-Disposition` (RFC 6266) to download (`attachment`) or show (`inline`) a file: an ASCII
 * fallback for old clients plus the UTF-8 name encoded as an RFC 5987 `filename*` parameter.
 */
export function contentDisposition(
  filename: string,
  disposition: 'attachment' | 'inline' = 'attachment',
): string {
  const fallback = filename.replace(/[^\x20-\x7e]|["\\]/g, '_');
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
