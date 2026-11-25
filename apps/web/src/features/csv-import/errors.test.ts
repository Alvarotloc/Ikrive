import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { csvImportErrorKey } from './errors';

const apiError = (status: number) => new ApiError({ type: 'about:blank', title: 'Error', status });

describe('CSV import errors', () => {
  it('maps each problem status to its message', () => {
    expect(csvImportErrorKey(apiError(413))).toBe('csvImport.errors.tooLarge');
    expect(csvImportErrorKey(apiError(400))).toBe('csvImport.errors.cannotImport');
    expect(csvImportErrorKey(apiError(404))).toBe('csvImport.errors.vehicleNotFound');
    expect(csvImportErrorKey(apiError(500))).toBe('common.error');
    expect(csvImportErrorKey(new Error('network down'))).toBe('common.error');
  });
});
