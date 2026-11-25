import { ApiError } from '@/lib/api-client';

export type CsvImportErrorKey =
  | 'csvImport.errors.tooLarge'
  | 'csvImport.errors.cannotImport'
  | 'csvImport.errors.vehicleNotFound'
  | 'common.error';

const KEY_BY_STATUS: Record<number, CsvImportErrorKey> = {
  400: 'csvImport.errors.cannotImport',
  404: 'csvImport.errors.vehicleNotFound',
  413: 'csvImport.errors.tooLarge',
};

/** The message of a failed preview or import: by the problem status, or the generic error. */
export function csvImportErrorKey(error: unknown): CsvImportErrorKey {
  if (!(error instanceof ApiError)) return 'common.error';
  return KEY_BY_STATUS[error.problem.status] ?? 'common.error';
}
