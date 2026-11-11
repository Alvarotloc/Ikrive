import type { QueryClient } from '@tanstack/react-query';
import { meQuery } from './queries';

/**
 * After a successful sign-in or sign-up: empties the whole query cache and loads the new session. The
 * previous session may have ended without `useLogout` (it expired, or was revoked), so the cache can
 * still hold another account's data (notifications, vehicles, settings) within its `gcTime`; nothing of
 * it may reach the new account, e.g. `DeviceNotificationsSync` processing its notifications.
 */
export async function startSession(queryClient: QueryClient) {
  queryClient.clear();
  await queryClient.fetchQuery(meQuery);
}
