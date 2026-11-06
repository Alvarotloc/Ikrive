import { isNull } from 'drizzle-orm';
import { user } from './schema';

/**
 * Account not disabled by an admin. Every token-based access (iCal feed, public report links) and
 * every background job must filter by it, so a disabled user behaves as if their tokens did not exist.
 */
export const activeUserFilter = isNull(user.disabledAt);
