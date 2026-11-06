import { DUPLICATE_IMPORT_PROBLEM_TYPE } from '@ikrive/shared';
import { ApiError } from '@/lib/api-client';

/** The file picker only offers zip files: the export format of `GET /api/me/export`. */
export const IMPORT_ACCEPT = '.zip,application/zip';

export type ImportErrorKey =
  | 'dataPortability.errors.invalid'
  | 'dataPortability.errors.settings'
  | 'dataPortability.errors.duplicate'
  | 'dataPortability.errors.tooLarge'
  | 'dataPortability.errors.fileType'
  | 'common.error';

const KEY_BY_STATUS: Record<number, ImportErrorKey> = {
  400: 'dataPortability.errors.invalid',
  409: 'dataPortability.errors.settings',
  413: 'dataPortability.errors.tooLarge',
  415: 'dataPortability.errors.fileType',
};

/**
 * The message of a rejected import: by the problem status, or the generic error. The two 409 are
 * told apart by the problem `type`: an export already imported, or different settings.
 */
export function importErrorKey(error: unknown): ImportErrorKey {
  if (!(error instanceof ApiError)) return 'common.error';
  if (error.problem.status === 409 && error.problem.type === DUPLICATE_IMPORT_PROBLEM_TYPE) {
    return 'dataPortability.errors.duplicate';
  }
  return KEY_BY_STATUS[error.problem.status] ?? 'common.error';
}
