/**
 * The app's lifecycle in the native app (the SPA inside the Android APK). Loaded only through `import()`
 * when `isNativeApp()` (`LocalRemindersRefresh`): the web never requests this module nor the plugin.
 */

import { App } from '@capacitor/app';

/**
 * Calls `listener` every time the app comes back to the foreground (the plugin's `resume`, which Android
 * always fires, unlike the WebView's `visibilitychange`) and resolves to the function that stops listening.
 */
export async function onAppResume(listener: () => void): Promise<() => Promise<void>> {
  const handle = await App.addListener('resume', () => listener());
  return () => handle.remove();
}
