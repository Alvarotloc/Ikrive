import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { adminUserErrorKey } from './errors';

const apiError = (status: number) => new ApiError({ type: 'about:blank', title: 'Error', status });

describe('adminUserErrorKey', () => {
  it('maps a 409 to the conflict message and the rest to the generic error', () => {
    expect(adminUserErrorKey(apiError(409))).toBe('adminUsers.errors.conflict');
    expect(adminUserErrorKey(apiError(500))).toBe('common.error');
    expect(adminUserErrorKey(apiError(403))).toBe('common.error');
    expect(adminUserErrorKey(new TypeError('Failed to fetch'))).toBe('common.error');
  });
});
