import { describe, expect, it } from 'vitest';
import { signInErrorKey } from './sign-in-error';

describe('signInErrorKey', () => {
  it('maps a 403 to the disabled account message and the rest to invalid credentials', () => {
    expect(signInErrorKey({ status: 403 })).toBe('auth.accountDisabled');
    expect(signInErrorKey({ status: 401 })).toBe('auth.invalidCredentials');
    expect(signInErrorKey({ status: 500 })).toBe('auth.invalidCredentials');
  });
});
