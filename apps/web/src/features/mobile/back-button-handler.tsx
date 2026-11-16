import { useRouter } from '@tanstack/react-router';
import { useEffect } from 'react';
import { closeTopLayer, resolveBack } from './back-button';

/**
 * Native app only (mounted by the root route): the Android back button closes the top dialog, sheet or
 * menu, else goes back in the router, else (root screen or no history) sends the app to the background
 * (`resolveBack`). Same in server and local mode. Renders nothing.
 */
export function BackButtonHandler() {
  const router = useRouter();

  useEffect(() => {
    let active = true;
    let stop: (() => Promise<void>) | undefined;

    void (async () => {
      const native = await import('@/lib/native-back-button');
      const remove = await native.onBackButton(() => {
        const action = resolveBack({
          closeTopLayer: () => closeTopLayer(),
          pathname: router.state.location.pathname,
          canGoBack: router.history.canGoBack(),
        });
        if (action === 'back') router.history.back();
        else if (action === 'minimize') {
          native.minimizeApp().catch(() => {
            // Nothing else to do: the app stays open.
          });
        }
      });
      // Unmounted while subscribing (StrictMode runs effects twice): stop at once.
      if (active) stop = remove;
      else await remove();
    })().catch(() => {
      // The plugin failed: back keeps Capacitor's default behaviour.
    });

    return () => {
      active = false;
      stop?.().catch(() => {
        // Nothing to undo: the listener is gone with the plugin.
      });
    };
  }, [router]);

  return null;
}
