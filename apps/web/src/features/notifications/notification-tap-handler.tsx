import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { meQuery } from '@/features/auth/queries';
import { parseNotificationTapData } from './device-notifications';
import { useMarkNotificationRead } from './queries';

/**
 * Native app only (mounted by the root route, so it also listens on the login screen): tapping a phone
 * notification marks its notification as read and opens its link, like the bell does. The tap is ignored,
 * and the app stays on the screen it opened with, when there is no session, the notification belongs to
 * another account or it no longer exists (e.g. deleted with its vehicle). Renders nothing.
 */
export function NotificationTapHandler() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { mutateAsync: markRead } = useMarkNotificationRead();

  useEffect(() => {
    let active = true;
    let stop: (() => Promise<void>) | undefined;

    const open = async (extra: unknown) => {
      const tap = parseNotificationTapData(extra);
      if (!tap) return;
      const me = await queryClient.fetchQuery(meQuery);
      if (me?.id !== tap.userId) return;
      // Fails if the session expired (401) or the notification is gone (404): nothing to open then.
      await markRead(tap.notificationId);
      // `link` is an untyped internal path stored by the API: `href` avoids casting it to a route.
      if (tap.link) await navigate({ href: tap.link });
    };

    void (async () => {
      const native = await import('@/lib/native-notifications');
      const remove = await native.onNotificationTap((extra) => {
        open(extra).catch(() => {
          // Best effort: the notification is still in the bell.
        });
      });
      // Unmounted while subscribing (StrictMode runs effects twice): stop at once.
      if (active) stop = remove;
      else await remove();
    })().catch(() => {
      // The plugin failed: tapping a notification just opens the app.
    });

    return () => {
      active = false;
      stop?.().catch(() => {
        // Nothing to undo: the listener is gone with the plugin.
      });
    };
  }, [queryClient, navigate, markRead]);

  return null;
}
