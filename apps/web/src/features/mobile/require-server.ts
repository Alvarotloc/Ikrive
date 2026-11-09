import { redirect } from '@tanstack/react-router';
import { isNativeApp } from '@/lib/platform';
import { getServerUrl } from '@/lib/server';

/**
 * `beforeLoad` of the app, `/login` and `/register`, before anything asks the API: the native app
 * without a saved server has no API to ask (its own origin is the APK), so it goes to `/welcome`.
 */
export function requireServer(): void {
  if (isNativeApp() && getServerUrl() === null) throw redirect({ to: '/welcome' });
}

/** `beforeLoad` of `/welcome` and `/server`: they only exist in the native app; the web goes to `/login`. */
export function requireNative(): void {
  if (!isNativeApp()) throw redirect({ to: '/login' });
}
