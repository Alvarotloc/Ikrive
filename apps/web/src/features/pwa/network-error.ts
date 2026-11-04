import { ApiError } from '@/lib/api-client';

/**
 * Whether `error` is a network failure: `fetch` rejects with a `TypeError` when there is no HTTP
 * response at all. An `ApiError` means the server did answer, with an error status.
 */
export function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError && !(error instanceof ApiError);
}
