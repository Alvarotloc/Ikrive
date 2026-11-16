# Tasks — android-back-button

## Dependencia y native-only

- [x] T1 — Añadir `"@capacitor/app": "8.1.2"` (versión exacta) a `dependencies` de `apps/web/package.json` y `apps/mobile/package.json`; `pnpm install`; `pnpm --filter @ikrive/mobile exec cap sync android` y versionar los `.gradle` regenerados (`capacitor.settings.gradle`, `app/capacitor.build.gradle`). En `apps/mobile/test/config.test.mjs`, añadir `@capacitor/app` a la lista obligatoria de `declares the web's Capacitor plugins with the same versions`. Cubre: R9.
- [x] T2 — `apps/web/src/features/pwa/config.ts`: añadir `back-button` a la regex de `NATIVE_ONLY_MODULES`. En `apps/web/src/features/pwa/native-only.test.ts`, test `sends the back button module and @capacitor/app to assets/native/` (afirma `nativeLibs` contiene `native-back-button.ts` y `@capacitor/app` está en `nativePackages`, ambos a `assets/native/`). Cubre: R10.

## Módulo nativo y lógica

- [x] T3 — `apps/web/src/lib/native-back-button.ts`: `onBackButton(listener)` (`App.addListener('backButton', …)`, devuelve `() => handle.remove()`) y `minimizeApp()` según `design.md`. Cubre: R4, R7.
- [x] T4 — Test unitario `apps/web/src/lib/native-back-button.test.ts` (con `vi.mock('@capacitor/app')`): `calls the listener on every back press and removes it`, `minimizes the app`. Cubre: R4, R7.
- [x] T5 — `apps/web/src/features/mobile/back-button.ts`: `ROOT_PATHS`, `closeTopLayer(doc?)` y `resolveBack(ctx)` según `design.md`. Cubre: R1, R2, R3, R4, R5, R6.
- [x] T6 — Test unitario `apps/web/src/features/mobile/back-button.test.ts`: `closeTopLayer is true only when a capture listener prevents the Escape keydown`, `prefers closing a layer over navigating`, `goes back outside the root screens when there is history`, `minimizes on the dashboard and the welcome screen even with history`, `minimizes on the login screen even with history`, `minimizes when there is no history`. Cubre: R1, R2, R3, R4, R5.

## Montaje

- [x] T7 — `apps/web/src/features/mobile/back-button-handler.tsx` (`BackButtonHandler`, patrón de `NotificationTapHandler`: `import()` tras montar, flag `active`, cleanup que quita el listener, errores ignorados) y montaje en `apps/web/src/routes/__root.tsx` con `isNativeApp() &&`. Cubre: R1, R3, R4, R5, R7, R8.
- [x] T8 — Test de componente `apps/web/src/features/mobile/back-button-handler.test.tsx` (con `vi.mock('@/lib/native-back-button')` como plugin simulado que guarda el listener, `minimizeApp: vi.fn()` y un flag `loaded`; router en memoria con `Dialog`, `DropdownMenu` y un `Dialog` con `onEscapeKeyDown` que hace `preventDefault`, todos reales de `components/ui`): `closes an open dialog without changing the route`, `closes an open menu without changing the route`, `keeps the route and the app when the dialog refuses to close`, `goes back to the previous screen`, `minimizes on the dashboard`, `minimizes on the welcome screen`, `minimizes on the login screen even with history` (`/vehicles` → `/login`), `minimizes without history outside the root screens`, `behaves the same in local mode` (con `MODE_KEY = 'local'`), `removes the listener on unmount`, `removes the listener when unmounted before subscribing`, y `web: never loads the native back button module` (`renderApp('/login')` sin `MODE=native`, `loaded` en `false`; este primero, antes de cualquier test nativo). Cubre: R1, R2, R3, R4, R5, R6, R7, R8.

## Cierre

- [x] T9 — Verificación previa a Gate 2: `pnpm --filter @ikrive/web build` y `build:native` sin errores; comprobar que en `apps/web/dist` el chunk de `@capacitor/app` está en `assets/native/` y no aparece en `sw.js`. APK debug local solo si hay SDK de Android; si no, indicar cómo obtener el artefacto `ikrive-debug-apk` del CI. Copiar en `progress/impl_android-back-button.md` la checklist manual de `design.md` para que el humano la ejecute antes de Gate 2. Cubre: R1, R3, R4, R9, R10.
- [x] T10 — Ejecutar `pnpm harness --full` y documentar trazabilidad en `progress/impl_android-back-button.md`.
