import { DUPLICATE_IMPORT_PROBLEM_TYPE } from '@ikrive/shared';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { IMPORT_ACCEPT, importErrorKey } from './import';

const apiError = (status: number, type = 'about:blank') => new ApiError({ type, title: 'Error', status });

describe('data import', () => {
  it('accepts zip files only', () => {
    expect(IMPORT_ACCEPT).toBe('.zip,application/zip');
  });

  it('maps each import error status to its message', () => {
    expect(importErrorKey(apiError(400))).toBe('dataPortability.errors.invalid');
    expect(importErrorKey(apiError(409))).toBe('dataPortability.errors.settings');
    expect(importErrorKey(apiError(413))).toBe('dataPortability.errors.tooLarge');
    expect(importErrorKey(apiError(415))).toBe('dataPortability.errors.fileType');
    expect(importErrorKey(apiError(500))).toBe('common.error');
    expect(importErrorKey(new Error('network down'))).toBe('common.error');
  });

  it('maps a repeated import to its own message', () => {
    expect(importErrorKey(apiError(409, DUPLICATE_IMPORT_PROBLEM_TYPE))).toBe(
      'dataPortability.errors.duplicate',
    );
    expect(importErrorKey(apiError(409, 'about:blank'))).toBe('dataPortability.errors.settings');
    expect(importErrorKey(apiError(400, DUPLICATE_IMPORT_PROBLEM_TYPE))).toBe(
      'dataPortability.errors.invalid',
    );
  });
});
