/**
 * Translation key for a failed sign-in. Better Auth only answers 403 when the account is disabled
 * (email verification is off); anything else is shown as wrong credentials.
 */
export function signInErrorKey(error: {
  status: number;
}): 'auth.accountDisabled' | 'auth.invalidCredentials' {
  return error.status === 403 ? 'auth.accountDisabled' : 'auth.invalidCredentials';
}
