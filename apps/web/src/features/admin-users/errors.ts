import { ApiError } from '@/lib/api-client';

/** Translation key for a failed admin action: a 409 means it is no longer allowed (the list was stale). */
export function adminUserErrorKey(error: unknown): 'adminUsers.errors.conflict' | 'common.error' {
  return error instanceof ApiError && error.problem.status === 409
    ? 'adminUsers.errors.conflict'
    : 'common.error';
}
