import { ATTACHMENT_MIME_TYPES } from '@ikrive/shared';
import { ApiError } from '@/lib/api-client';

/** `accept` of the invoice pickers: exactly the types the API stores (it detects them by content). */
export const ATTACHMENT_ACCEPT = ATTACHMENT_MIME_TYPES.join(',');

/** Same bound as the API's multipart `fileSize` limit (`MAX_UPLOAD_MB` · 1024 · 1024 bytes). */
export const exceedsUploadLimit = (file: File, maxUploadMb: number) => file.size > maxUploadMb * 1024 * 1024;

/** URL that shows the original in the browser instead of downloading it. The DTO's `url` has no query. */
export const inlineUrl = (url: string) => `${url}?inline=1`;

export type UploadErrorKey =
  | 'maintenance.attachments.errors.type'
  | 'maintenance.attachments.errors.size'
  | 'maintenance.attachments.errors.sizeUnknownLimit'
  | 'common.error';

/** i18n key of the toast for a failed upload. The size message only shows the limit if the web knows it. */
export function uploadErrorKey(error: unknown, maxUploadMb?: number): UploadErrorKey {
  if (error instanceof ApiError) {
    if (error.problem.status === 415) return 'maintenance.attachments.errors.type';
    if (error.problem.status === 413) {
      return maxUploadMb === undefined
        ? 'maintenance.attachments.errors.sizeUnknownLimit'
        : 'maintenance.attachments.errors.size';
    }
  }
  return 'common.error';
}

export interface UploadBatchResult {
  uploaded: number;
  failures: { file: File; error: unknown }[];
}

/**
 * Uploads the files one after another (never in parallel: each upload is buffered, thumbnailed and
 * written by a single SQLite writer on the server). A failure is recorded and the batch goes on.
 */
export async function uploadSequentially(
  files: File[],
  upload: (file: File) => Promise<unknown>,
): Promise<UploadBatchResult> {
  const result: UploadBatchResult = { uploaded: 0, failures: [] };
  for (const file of files) {
    try {
      await upload(file);
      result.uploaded += 1;
    } catch (error) {
      result.failures.push({ file, error });
    }
  }
  return result;
}
