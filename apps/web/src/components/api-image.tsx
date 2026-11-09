import { useEffect, useRef } from 'react';
import { useApiFileSrc } from '@/lib/api-files';
import { cn } from '@/lib/utils';

interface ApiImageProps {
  /** `/api/…` URL of the image, as the API returns it. */
  src: string;
  alt: string;
  className?: string;
  loading?: 'eager' | 'lazy';
  /** The image could not be loaded: the request failed (server mode) or the browser could not show it. */
  onError?: () => void;
}

/**
 * An image of the API. Same origin: a plain `<img>` loaded by the browser with the cookie. Server mode:
 * a muted block `<span>` placeholder with the same classes while it is fetched with the token, then the `blob:` image.
 */
export function ApiImage({ src: url, alt, className, loading, onError }: ApiImageProps) {
  const { src, isError } = useApiFileSrc(url);
  // Latest callback, so a new function on each render does not report the same failure twice.
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  useEffect(() => {
    if (isError) onErrorRef.current?.();
  }, [isError]);

  // A `<span>` (not a `<div>`) so it is valid inside a `<button>`, such as the attachment thumbnail.
  if (src === undefined) return <span className={cn('block', className, 'bg-muted')} aria-hidden />;
  return <img src={src} alt={alt} className={className} loading={loading} onError={onError} />;
}
