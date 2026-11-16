/**
 * The Android back button in the native app (the SPA inside the Android APK). Loaded only through
 * `import()` when `isNativeApp()` (`BackButtonHandler`): the web never requests this module nor the plugin.
 *
 * While a `backButton` listener is registered, the plugin drops Capacitor's default behaviour (go back in
 * the WebView or close the app): the app decides everything, minimizing included.
 */

import { App } from '@capacitor/app';

/** Calls `listener` on every back press and resolves to the function that stops listening. */
export async function onBackButton(listener: () => void): Promise<() => Promise<void>> {
  const handle = await App.addListener('backButton', () => listener());
  return () => handle.remove();
}

/** `App.minimizeApp()`: sends the app to the background (Android `moveTaskToBack`), like Android does. */
export async function minimizeApp(): Promise<void> {
  await App.minimizeApp();
}
