import { redirect } from '@tanstack/react-router';
import { isLocalMode } from '@/lib/app-mode';
import { isNativeApp } from '@/lib/platform';
import { getServerUrl } from '@/lib/server';
import { activateLocalDataSource } from './local-mode';

/**
 * `beforeLoad` of `/login` and `/register`, before anything asks the API. In local mode there is no
 * account: they go to the dashboard. The native app without a saved server has no API to ask (its own
 * origin is the APK), so it goes to `/welcome`.
 */
export function requireServer(): void {
  if (isLocalMode()) throw redirect({ to: '/' });
  if (isNativeApp() && getServerUrl() === null) throw redirect({ to: '/welcome' });
}

/**
 * `beforeLoad` of the app, before its first query: in local mode it installs the local `DataSource`
 * (opening the device database on the first run); otherwise the native app needs a saved server.
 */
export async function requireDataSource(): Promise<void> {
  if (isLocalMode()) return activateLocalDataSource();
  requireServer();
}

/** `beforeLoad` of `/welcome` and `/server`: they only exist in the native app; the web goes to `/login`. */
export function requireNative(): void {
  if (!isNativeApp()) throw redirect({ to: '/login' });
}
