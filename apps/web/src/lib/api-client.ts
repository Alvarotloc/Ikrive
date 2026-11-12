import type { Problem } from '@ikrive/shared';
import { fileNameFromContentDisposition } from '@/features/reports/sale-report';
import type { DownloadedFile } from './data-source/types';
import { apiFetch } from './server';

export class ApiError extends Error {
  constructor(readonly problem: Problem) {
    super(problem.detail ?? problem.title);
    this.name = 'ApiError';
  }
}

/** The `ApiError` of a non-2xx response: its problem+json body, or one built from the status. */
async function toApiError(response: Response): Promise<ApiError> {
  const problem = (await response.json().catch(() => null)) as Problem | null;
  return new ApiError(
    problem ?? { type: 'about:blank', title: response.statusText, status: response.status },
  );
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  // FormData sets its own multipart content type (with the boundary).
  const isJson = body !== undefined && !(body instanceof FormData);
  const response = await apiFetch(`/api${path}`, {
    method,
    headers: isJson ? { 'content-type': 'application/json' } : undefined,
    body: isJson ? JSON.stringify(body) : (body as FormData | undefined),
  });
  if (!response.ok) throw await toApiError(response);
  return (response.status === 204 ? undefined : await response.json()) as T;
}

export type { DownloadedFile };

/** `GET` a file by its path relative to `/api`, e.g. `/vehicles/v1/report`. */
const download = (path: string) => downloadUrl(`/api${path}`);

/** `GET` a file by its full `/api/…` URL, as the API returns them (photos, invoices). */
async function downloadUrl(url: string): Promise<DownloadedFile> {
  const response = await apiFetch(url, { method: 'GET' });
  if (!response.ok) throw await toApiError(response);
  return {
    blob: await response.blob(),
    fileName: fileNameFromContentDisposition(response.headers.get('content-disposition')),
  };
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
  download,
  downloadUrl,
};
