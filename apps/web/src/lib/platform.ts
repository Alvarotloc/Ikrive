/**
 * Whether this is the native app (the SPA inside the Android APK) and not the web. It is a build flag:
 * only the native build (`vite build --mode native`) is the app, so the web never ships Capacitor code.
 * Read on every call, so tests can switch it with `vi.stubEnv('MODE', 'native')`.
 */
export const isNativeApp = (): boolean => import.meta.env.MODE === 'native';
