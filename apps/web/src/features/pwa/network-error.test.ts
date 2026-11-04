import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { isNetworkError } from './network-error';

describe('isNetworkError', () => {
  it('detects fetch failures but not API errors', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isNetworkError(new TypeError('NetworkError when attempting to fetch resource.'))).toBe(true);

    expect(isNetworkError(new ApiError({ type: 'about:blank', title: 'Server Error', status: 500 }))).toBe(
      false,
    );
    expect(isNetworkError(new Error('boom'))).toBe(false);
    expect(isNetworkError('Failed to fetch')).toBe(false);
    expect(isNetworkError(undefined)).toBe(false);
  });
});
