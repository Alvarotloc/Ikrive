# Implementación — native-notification-open-link (#62, `sdd: false`)

Sin spec: guía = `acceptance` de #62 + decisión a validar 3 de `specs/mobile-native-calendar-notifications/design.md`.

## Cómo funciona

1. `DeviceNotificationsSync` (ya existía) pasa ahora a cada notificación un `extra` `{ userId, notificationId, link }`.
2. Al tocarla, Android relanza la actividad; el plugin emite `localNotificationActionPerformed` con `actionId: 'tap'` y la notificación original (con su `extra`). Lo emite con `retainUntilConsumed = true` y `BridgeActivity.onCreate` pasa el intent de arranque a `onNewIntent` (comprobado en el código de `@capacitor/local-notifications` 8.3.1 y `@capacitor/android` 8.6.0), así que también llega en arranque en frío, en cuanto se registra el primer listener.
3. `NotificationTapHandler` (nuevo, montado en la ruta raíz solo si `isNativeApp()`) escucha con `onNotificationTap` y, por cada toque:
   - valida el `extra` (`parseNotificationTapData`); si no es nuestro (p. ej. una notificación de una versión anterior) no hace nada;
   - `queryClient.fetchQuery(meQuery)`: sin sesión o con otra cuenta → no hace nada (la app sigue en su pantalla por defecto: login o inicio);
   - `PATCH /notifications/:id/read` (mismo hook que la campana, invalida `notifications.all`); si falla (401 sesión caducada, 404 aviso borrado con su vehículo) → se queda donde está;
   - si el link es una ruta interna (`/…`, no `//…` ni URL absoluta) → `navigate({ href: link })`, como la campana.
   Todo es best effort y los errores se ignoran sin toast.

Se monta en la raíz y no en el layout autenticado `_app` para que el toque retenido se consuma también en la pantalla de login: si se montara en `_app`, con la sesión caducada el toque quedaría retenido y, tras iniciar sesión, la app saltaría al link de un toque antiguo.

## Cambios por archivo

| Archivo | Cambio |
|---|---|
| `apps/web/src/features/notifications/device-notifications.ts` | `NotificationTapData`, `notificationTapData(userId, notification)`, `parseNotificationTapData(extra)` (puras; link solo si es ruta interna) |
| `apps/web/src/lib/native-notifications.ts` | tipo `DeviceNotification` (con `extra`) en `showNotifications`; `onNotificationTap(listener)` sobre `localNotificationActionPerformed` (solo `actionId === 'tap'`), devuelve la función que quita el listener. Importa `NotificationTapData` solo como tipo |
| `apps/web/src/features/notifications/device-notifications-sync.tsx` | añade `extra: notificationTapData(userId, item)` a cada notificación |
| `apps/web/src/features/notifications/notification-tap-handler.tsx` (nuevo) | componente sin UI descrito arriba; carga el módulo nativo con `await import('@/lib/native-notifications')`; limpia el listener al desmontar (también si se desmonta antes de terminar de suscribirse, StrictMode) |
| `apps/web/src/routes/__root.tsx` | `{isNativeApp() && <NotificationTapHandler />}` |
| `apps/web/src/lib/native-notifications.test.ts` | `extra` en el test de `schedule`; test de `onNotificationTap` (filtra `tap`, pasa el `extra`, `remove`) |
| `apps/web/src/features/notifications/device-notifications.test.ts` | ida y vuelta de `notificationTapData`/`parseNotificationTapData`; rechazo de extras ajenos y links no internos |
| `apps/web/src/features/notifications/notification-tap-handler.test.tsx` (nuevo) | handler en un router en memoria con el módulo nativo mockeado (ver tabla) |
| `apps/web/src/features/notifications/device-notifications-sync.test.tsx`, `features/auth/login-page.test.tsx` | el payload esperado de `showNotifications` incluye `extra` |
| `apps/web/src/features/auth/login-page.test.tsx`, `features/settings/settings-page.test.tsx` | el mock de `@/lib/native-notifications` incluye `onNotificationTap` (la raíz lo carga en modo nativo) |
| `docs/mobile.md` | «Tocar la notificación abre la app en la pantalla del aviso … y lo marca como leído; si ya no existe o la sesión ha caducado, se abre en su pantalla de siempre» |

Sin cambios en API, BD, `packages/shared` ni `apps/mobile` (el plugin ya estaba instalado y sincronizado).

## Trazabilidad

| Acceptance | Test |
|---|---|
| Tocar la notificación abre la app en el link del aviso | `notification-tap-handler.test.tsx › opens the link of the tapped notification and marks it as read`; `native-notifications.test.ts › passes the extra of tapped notifications and stops listening`; `device-notifications-sync.test.tsx › shows one notification per new notification after a refetch` (lleva el `extra`) |
| El aviso queda marcado como leído | `notification-tap-handler.test.tsx › opens the link …` y `› marks it as read and stays on the default screen without a link` |
| Link inexistente o sesión caducada → pantalla por defecto sin errores | `notification-tap-handler.test.tsx › marks it as read and stays on the default screen without a link`, `› stays on the default screen when the notification no longer exists`, `› stays on the default screen when the session expired`, `› … when the session expired after loading the user`, `› ignores notifications of another account and extras that are not ours`; `device-notifications.test.ts › rejects tap data that is not ours and links that are not internal paths` |
| Test con el plugin mockeado | `native-notifications.test.ts` (mock de `@capacitor/local-notifications`) y `notification-tap-handler.test.tsx` (mock de `@/lib/native-notifications`); `› stops listening when unmounted` |
| La web no carga código nativo | `features/pwa/native-only.test.ts › the web imports Capacitor and lib/native-* only through import()` (sigue en verde); `settings-page.test.tsx` comprueba que en la web el módulo no se carga. Además, `pnpm --filter @ikrive/web build`: `LocalNotifications` solo aparece en `dist/assets/native/` |
| `pnpm harness --full` en verde | abajo |

## `pnpm harness --full`

```
[OK]    64 features: 61 done, 2 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #62 native-notification-open-link (in_progress)
[OK]    Rama actual: feat/native-notification-open-link
[OK]    pnpm lint
[OK]    pnpm typecheck
[OK]    pnpm test        (web 70 files / 469 tests, api 38 / 368, shared 18 / 119, mobile 27)
[OK]    Arnés en verde.
```

## Desviaciones y notas

- Sin spec, así que no hay desviación formal. Decisiones propias a revisar:
  - Montaje en la raíz (no en `_app`), por el motivo explicado arriba.
  - Si el `PATCH` falla (401/404) no se navega: un 404 significa que el aviso se borró con su vehículo, y el link llevaría a una ficha inexistente.
  - Se descartan los toques de otra cuenta (`extra.userId` ≠ `me.id`).
  - Las notificaciones mostradas por la versión anterior no llevan `extra`: tocarlas solo abre la app.
- Sin emulador: la prueba real es manual con la APK debug. Checklist sugerida:
  1. Con la app en segundo plano, tocar una notificación de un aviso → abre la ficha del vehículo y el aviso aparece leído en la campana.
  2. Igual con la app cerrada (arranque en frío).
  3. Cerrar sesión (o dejar caducar) y tocar una notificación → pantalla de login, sin errores; tras iniciar sesión no salta a la ficha.
  4. Borrar el vehículo del aviso y tocar su notificación → la app se queda en inicio.
- Sin UI nueva: no hay capturas.
