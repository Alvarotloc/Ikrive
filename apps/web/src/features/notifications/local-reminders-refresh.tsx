import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { queryKeys } from '@/lib/query-keys';

/**
 * Native app in local mode only (mounted by `/_app`): when the app comes back to the foreground, the
 * notifications list is asked for again, and listing the local inbox generates the reminders due by then.
 * The plugin's `resume` is used because the Android WebView does not always fire `visibilitychange`.
 * Renders nothing.
 */
export function LocalRemindersRefresh() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let active = true;
    let stop: (() => Promise<void>) | undefined;

    void (async () => {
      const native = await import('@/lib/native-app-state');
      const remove = await native.onAppResume(() => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
      });
      // Unmounted while subscribing (StrictMode runs effects twice): stop at once.
      if (active) stop = remove;
      else await remove();
    })().catch(() => {
      // The plugin failed: the reminders still come on start and with the bell's polling.
    });

    return () => {
      active = false;
      stop?.().catch(() => {
        // Nothing to undo: the listener is gone with the plugin.
      });
    };
  }, [queryClient]);

  return null;
}
