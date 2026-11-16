# Implementación — android-back-button (#74)

Rama `feat/android-back-button`. Todas las tasks T1–T10 están marcadas en `specs/android-back-button/tasks.md`.

## Cambios por archivo

| Archivo | Cambio |
|---|---|
| `apps/web/package.json`, `apps/mobile/package.json`, `pnpm-lock.yaml` | `"@capacitor/app": "8.1.2"` en `dependencies` (versión exacta, la misma en los dos). |
| `apps/mobile/android/capacitor.settings.gradle`, `apps/mobile/android/app/capacitor.build.gradle` | Regenerados con `cap sync android`: añaden el proyecto `:capacitor-app`. |
| `apps/mobile/test/config.test.mjs` | `@capacitor/app` en la lista obligatoria de `declares the web's Capacitor plugins with the same versions`. |
| `apps/web/src/features/pwa/config.ts` | `back-button` añadido a la regex de `NATIVE_ONLY_MODULES`. |
| `apps/web/src/features/pwa/native-only.test.ts` | Test nuevo: `sends the back button module and @capacitor/app to assets/native/`. |
| `apps/web/src/lib/native-back-button.ts` (nuevo) | `onBackButton(listener)` (`App.addListener('backButton')`; devuelve una función que llama a `handle.remove()`) y `minimizeApp()`. |
| `apps/web/src/lib/native-back-button.test.ts` (nuevo) | Test unitario con `@capacitor/app` simulado. |
| `apps/web/src/features/mobile/back-button.ts` (nuevo) | `ROOT_PATHS` (`/`, `/welcome`, `/login`), `closeTopLayer(doc?)` (lanza un `keydown` Escape cancelable sobre el elemento con foco o `body`) y `resolveBack(ctx)` (`layer` → `back` → `minimize`). |
| `apps/web/src/features/mobile/back-button.test.ts` (nuevo) | Test unitario (`// @vitest-environment jsdom`, igual que `lib/download.test.ts`). |
| `apps/web/src/features/mobile/back-button-handler.tsx` (nuevo) | `BackButtonHandler`: carga el módulo nativo con `import()`, usa un flag `active` para el desmontaje antes de suscribirse, quita el listener en el cleanup e ignora los errores. Las acciones `back` y `minimize` usan `router.history.back()` y `native.minimizeApp()`. |
| `apps/web/src/features/mobile/back-button-handler.test.tsx` (nuevo) | Test de componente con el plugin simulado y `Dialog`/`DropdownMenu` reales de `components/ui`. |
| `apps/web/src/routes/__root.tsx` | `{isNativeApp() && <BackButtonHandler />}` junto a `NotificationTapHandler`. |

Sin cambios en la API, la BD, `packages/shared` ni i18n.

## Trazabilidad

| R | Archivo › test |
|---|---|
| R1 | `features/mobile/back-button.test.ts` › `closeTopLayer is true only when a capture listener prevents the Escape keydown`, `prefers closing a layer over navigating`; `features/mobile/back-button-handler.test.tsx` › `closes an open dialog without changing the route`, `closes an open menu without changing the route` |
| R2 | `back-button.test.ts` › `closeTopLayer is true only when …`; `back-button-handler.test.tsx` › `keeps the route and the app when the dialog refuses to close` |
| R3 | `back-button.test.ts` › `goes back outside the root screens when there is history`; `back-button-handler.test.tsx` › `goes back to the previous screen` |
| R4 | `back-button.test.ts` › `minimizes on the dashboard and the welcome screen even with history`, `minimizes on the login screen even with history`; `back-button-handler.test.tsx` › `minimizes on the dashboard`, `minimizes on the welcome screen`, `minimizes on the login screen even with history`; `lib/native-back-button.test.ts` › `minimizes the app` |
| R5 | `back-button.test.ts` › `minimizes when there is no history`; `back-button-handler.test.tsx` › `minimizes without history outside the root screens` |
| R6 | `back-button-handler.test.tsx` › `behaves the same in local mode` (`MODE=native` y `MODE_KEY = 'local'`: capa, después atrás, después al fondo) |
| R7 | `back-button-handler.test.tsx` › `removes the listener on unmount`, `removes the listener when unmounted before subscribing`; `lib/native-back-button.test.ts` › `calls the listener on every back press and removes it` |
| R8 | `back-button-handler.test.tsx` › `web: never loads the native back button module` (`renderApp('/login')` sin `MODE=native`, `loaded` en `false`; es el primer test del archivo) |
| R9 | `apps/mobile/test/config.test.mjs` › `declares the web's Capacitor plugins with the same versions`; diff de los `.gradle` (`:capacitor-app`) |
| R10 | `features/pwa/native-only.test.ts` › `sends the back button module and @capacitor/app to assets/native/` (más los genéricos `sends every lib/native-*.ts …` y `sends every package of the native app …`); comprobación del build (T9) |

## Verificación (T9)

- `pnpm --filter @ikrive/web build` y `build:native`: OK.
- `apps/web/dist/assets/native/` contiene `native-back-button-*.js` y el chunk del plugin `@capacitor/app` (`dist-*.js` y `web-*.js`). `dist/sw.js` no hace ninguna referencia a `assets/native` ni a `native-back-button` (grep: 0). En el `index-*.js` de la web solo queda el código de `BackButtonHandler` (que nunca se monta, por `isNativeApp()`) y el `import()` del chunk nativo, igual que `NotificationTapHandler`.
- APK debug local: `pnpm --filter @ikrive/mobile build:web`, luego `cap sync android` y por último `./gradlew assembleDebug` con **`JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64`**. Con el JDK 17 por defecto falla con `invalid source release: 21`, porque Capacitor 8 necesita el JDK 21, igual que en el CI. Resultado: `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk` (14:03, incluye `native-back-button`). La otra opción es el artefacto `ikrive-debug-apk` del CI de la rama.

## `pnpm harness --full` (T10)

```
[OK]    pnpm lint
[OK]    pnpm typecheck
apps/web test:     Test Files  87 passed (87)  |  Tests  575 passed (575)
apps/api test:     Test Files  38 passed (38)  |  Tests  370 passed (370)
packages/shared:   Tests 177 passed  |  packages/db: 3 passed  |  e2e (unit): 6 passed  |  apps/mobile: 27 passed
[OK]    pnpm test
[OK]    Arnés en verde.
```

## Desviaciones del spec

Ninguna funcional. Detalles:

- `back-button.test.ts` lleva `// @vitest-environment jsdom` porque el proyecto `unit` corre en Node. El design ya pedía jsdom para este test, y la directiva es la misma que usa `lib/download.test.ts`.
- En el handler, `closeTopLayer` se pasa como `() => closeTopLayer()` y no por referencia. Así no se le pasa ningún argumento por error y siempre usa `document`.

## Checklist manual en el dispositivo (antes de Gate 2)

Hay que instalar el APK debug: el local de la ruta de arriba o el artefacto `ikrive-debug-apk` del CI de la rama. Probar cada paso con el botón atrás y con el gesto atrás:

1. Primera ejecución (`/welcome`): atrás manda la app al fondo. Al volver, sigue en `/welcome`.
2. «Mi servidor» → `/server`: atrás vuelve a `/welcome`. Conectar → `/login`: atrás manda la app al fondo (no vuelve a `/server`). «Cambiar servidor» lleva a `/server`.
3. Login → panel: atrás en el panel manda la app al fondo (no vuelve al login).
4. Panel → vehículo → «Cerrar sesión» → `/login`: atrás manda la app al fondo a la primera pulsación (no recorre las pantallas de la sesión). Al volver, sigue en `/login`.
5. Panel → vehículo → editar: atrás y atrás vuelven al vehículo y al panel.
6. Con el menú móvil (hoja) abierto, atrás lo cierra sin navegar. Repetir con el menú «Añadir al calendario», un `InfoPopover`, el diálogo de un repostaje y el visor de una factura sobre el diálogo de facturas (atrás cierra solo el visor).
7. Formulario guardando (subida de factura): atrás no hace nada.
8. Modo local: repetir los pasos 3, 5 y 6 (el panel es la raíz). Además, «Cambiar de modo» → `/welcome` → atrás manda la app al fondo.
9. Abrir la app desde una notificación con enlace a un vehículo: atrás vuelve al panel si hay historial; si no, manda la app al fondo.
