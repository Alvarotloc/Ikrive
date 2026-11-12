# Review — #62 native-notification-open-link

**Veredicto:** APPROVED

Feature `sdd: false`: sin `specs/`; el contrato es `description` + `acceptance` de `feature_list.json` (#62). Diff revisado: `git diff main...HEAD` (vacío, nada commiteado), `git diff` (12 ficheros) y los 3 sin trackear (`notification-tap-handler.tsx`, su test, el informe del implementer).

## Trazabilidad acceptance ↔ tests

- A1 (tocar la notificación abre el link del aviso): [x] `apps/web/src/features/notifications/notification-tap-handler.test.tsx` › `opens the link of the tapped notification and marks it as read` (comprueba que aparece el heading `Vehículo v1`, `router.state.location.pathname === '/vehicles/v1'` y un único PATCH). Los extremos también están cubiertos: `native-notifications.test.ts` › `passes the extra of tapped notifications and stops listening` (registra `localNotificationActionPerformed`, filtra `actionId === 'tap'`, pasa el `extra` y `remove`) y `device-notifications-sync.test.tsx` › `shows one notification per new notification after a refetch` (cada notificación lleva `extra` `{ userId, notificationId, link }`).
- A2 (queda marcado como leído): [x] el mismo test y `› marks it as read and stays on the default screen without a link` cuentan exactamente las llamadas `PATCH /api/notifications/n1/read`. La invalidación de `notifications.all` la hace el hook de la campana, que ya existía.
- A3 (link inexistente o sesión caducada → pantalla por defecto sin errores): [x] `› stays on the default screen when the notification no longer exists` (PATCH 404, se queda en `/`), `› stays on the default screen when the session expired` (`/me` 401, 0 PATCH, `/`), `› … after loading the user` (PATCH 401, `/`), `› ignores notifications of another account and extras that are not ours`, y los casos de link externo o `null`. `device-notifications.test.ts` › `rejects tap data that is not ours and links that are not internal paths` cubre `https://`, `//host`, rutas relativas y valores no string.
- A4 (test con el plugin mockeado): [x] `native-notifications.test.ts` (mock de `@capacitor/local-notifications`) y `notification-tap-handler.test.tsx` (mock de `@/lib/native-notifications`, incluido `› stops listening when unmounted`).
- A5 (harness en verde): [x] ver C6.

## Tasks

- No aplica (`sdd: false`, sin `tasks.md`). El plan de `progress/current.md` (pasos 1–4) está completo.

## Checkpoints

- C1: [x] `pnpm harness` con código 0; una sola feature activa (#62 `in_progress`); rama `feat/native-notification-open-link`.
- C2: [x] No aplica por ser `sdd: false`. Todos los `acceptance` tienen un test concreto que he abierto y leído.
- C3: [x] Solo toca `features/notifications/`, `lib/native-notifications.ts`, `routes/__root.tsx`, los mocks de dos tests que pasan por la raíz en modo nativo, `docs/mobile.md` y el rastro del arnés. No hay cambios de otras features ni refactors.
- C4: [x] Sin cambios de API ni de BD. Web: dominio en `features/notifications/`, `meQuery` y `useMarkNotificationRead` reutilizados, sin textos nuevos (no hacen falta claves i18n). Regla de código nativo (CONTRIBUTING.md:36): `notification-tap-handler.tsx` carga `@/lib/native-notifications` solo con `await import()` y se monta tras `isNativeApp()`. `native-notifications.ts` importa `NotificationTapData` con `import type`, que se borra al compilar y no arrastra `features/` al chunk nativo. `features/pwa/native-only.test.ts` sigue en verde.
- C5: [x] Sin `any`, `@ts-ignore`, `console.log` ni TODOs. Los `extra` del plugin entran como `unknown` y se validan en `parseNotificationTapData`.
- C6: [x] `pnpm harness --full` en verde (web 70/469, api 38/368, shared 18/119, mobile, e2e). Los tests afirman resultados concretos. No hay UI nueva, así que no hacen falta capturas.
- C7: [x] `progress/impl_native-notification-open-link.md` con archivos, mapa acceptance → test y salida del harness; `progress/current.md` al día. `docs/PLAN.md` no cambia porque no cierra fase ni cambia decisiones.

## Valoración de las decisiones propias del implementer

1. **Montaje en la raíz y no en `_app`.** Correcto. El plugin retiene el toque hasta el primer listener (`retainUntilConsumed`). Si el handler se montara en `_app`, con la sesión caducada el toque se quedaría retenido y, al iniciar sesión, la app saltaría a un aviso antiguo. Desde la raíz se consume también en `/login` y se descarta porque `meQuery` devuelve `null`. El coste es nulo en la web: `isNativeApp()` es falso y el chunk nativo no se carga (lo comprueba `settings-page.test.tsx`).
2. **No navegar si el PATCH falla.** Correcto y conforme a A3. Un 404 significa que el aviso se borró con su vehículo, y navegar llevaría a una ficha inexistente. Un 401 significa sesión caducada; `_app` llevaría igualmente a login. No hay `MutationCache`/`QueryCache` con toast global, así que el fallo no muestra ningún error, y el `.catch` vacío es intencionado y está comentado.
3. **Descartar los toques de otra cuenta (`extra.userId !== me.id`).** Correcto. Evita marcar como leído o abrir un aviso ajeno (que además daría 404 por la regla de propiedad). Es coherente con el estado por usuario de `DeviceNotificationsSync` (`ikrive.deviceNotifications.<userId>`).
4. Validar que el link es una ruta interna (`/…`, no `//…` ni absoluta) antes de `navigate({ href })` es una defensa razonable frente a un `extra` manipulado.

## Hallazgos

Ninguno bloqueante.

## Avisos para el humano (no bloquean)

- **Prueba en dispositivo pendiente.** Toda la verificación usa mocks; que el toque llegue en arranque en frío depende de `retainUntilConsumed` y de `BridgeActivity.onCreate → onNewIntent`. El implementer dice haberlo comprobado en el código de los plugins, pero no lo he podido verificar en un emulador. Conviene seguir el checklist manual de 4 pasos de `progress/impl_native-notification-open-link.md` con la APK debug antes del merge.
- **Arranque en frío y navegación inicial.** Si el toque llega mientras el router resuelve la navegación inicial (`_app.beforeLoad` con `ensureQueryData(meQuery)`), el `navigate` del handler compite con ella. Se espera que gane la última navegación (el link), pero conviene comprobarlo en el paso 2 del checklist.
- **Notificaciones ya mostradas por versiones anteriores.** No llevan `extra`: tocarlas solo abre la app, como antes. Está documentado por el implementer.
- **StrictMode (solo en desarrollo).** El efecto se suscribe dos veces y la primera suscripción se quita al momento. Si el toque retenido llega a esa primera suscripción, se procesa igual, porque `open` no depende de `active`. Sin impacto en producción.

## Cambios requeridos

Ninguno.
