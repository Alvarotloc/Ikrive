# Review — #63 notifications-cache-per-user

**Veredicto:** APPROVED

Feature `sdd: false`: sin `specs/`; se valida contra `description` y `acceptance` de `feature_list.json`, `CONTRIBUTING.md`, `docs/` y `CHECKPOINTS.md`.

## Trazabilidad acceptance ↔ tests
- A1 (la campana y `DeviceNotificationsSync` no usan avisos en caché de la cuenta anterior): [x] `apps/web/src/features/auth/login-page.test.tsx` › `switching accounts without logging out` › `native app: signing in as another account never uses the cache of the previous one`. Parte de una caché con `me = null`, el aviso y el vehículo de Ana; tras el login de Berta comprueba que `showNotifications` se llama una sola vez y solo con el aviso de Berta (la campana y `DeviceNotificationsSync` comparten `notificationsQuery`) y que «Coche de Ana» no aparece.
- A2 (en la app no se muestran notificaciones de otra cuenta ni se guarda un corte ajeno): [x] el mismo test, en modo `native` + servidor, comprueba los argumentos exactos de `showNotifications` y el contenido exacto de `ikrive.deviceNotifications.u2` (`since` = `createdAt` del aviso de Berta, `seen` = `['berta-n1']`).
- A3 (un test cubre el cambio de cuenta sin `useLogout`): [x] el mismo test; la sesión de Ana se simula caducada (`me` en caché a `null`, sin pasar por `useLogout`).
- A4 (`pnpm harness --full` en verde): [x] ejecutado por el reviewer: lint, typecheck y test en verde (web 450/450, api 368/368).

**El test falla sin el arreglo (lo he comprobado):** copia del test en el scratchpad con `startSession` sustituido por un mock que reproduce el código anterior (`fetchQuery({ ...meQuery, staleTime: 0 })`), sin tocar `apps/`. Resultado: falla en `queryByText('Coche de Ana')`; sin esa aserción, falla porque `showNotifications` recibe «Aviso ana-n1» en vez de «Aviso berta-n1». Así que sí detecta el bug descrito en #52.

## Tasks
- N/A (sin `tasks.md`, `sdd: false`). Plan de `progress/current.md` (pasos 1–4) completado.

## Checkpoints
- C1: [x] arnés en verde, una sola feature activa (#63 `in_progress`) y rama `feat/notifications-cache-per-user`.
- C2: [x] N/A por `sdd: false`; mapa acceptance → test en `impl_*.md`, verificado arriba.
- C3: [x] el diff solo toca `login.tsx`, `register.tsx`, el nuevo `features/auth/start-session.ts`, el test, `feature_list.json` (estado) y `progress/current.md`. Sin refactors ajenos.
- C4: [x] código web dentro de `features/auth/`; sin textos nuevos (no hacen falta claves i18n); sin cambios en API ni BD.
- C5: [x] sin `any`, `@ts-ignore`, `console.log` ni TODOs.
- C6: [x] harness `--full` en verde; el test afirma resultados concretos. No hay cambios de UI, así que no hacen falta capturas.
- C7: [x] `impl_notifications-cache-per-user.md` con archivos, trazabilidad y salida del arnés; `current.md` al día; no cierra fase (PLAN sin cambios).

## Hallazgos
Ninguno bloqueante. Lo que he revisado de `queryClient.clear()`:
- **Orden:** `signIn`/`signUp` → `clear()` → `fetchQuery(meQuery)` → `navigate('/')`. En modo servidor, el token lo guarda el cliente de auth antes de que `signIn` resuelva, y `clear()` no toca `localStorage` (URL del servidor, token, `notificationPermissionAsked`, estado `deviceNotifications.<id>`). El test con `setServerMode` y `MODE=native` lo cubre de punta a punta.
- **Queries montadas durante login/registro:** ninguna. `AuthLayout`, `ServerLink`, `OfflineBanner` y `UpdatePrompt` no usan `useQuery`. Solo `meQuery` se usa en `beforeLoad`, así que `clear()` no deja ningún observer huérfano.
- **Redirecciones:** `/_app.beforeLoad` encuentra `me` recién cargado (fresco por su `staleTime`) y no hace una segunda petición. Quitar `staleTime: 0` es correcto, porque la caché está vacía.
- **Onboarding/`/welcome`/`/server`:** no dependen de la caché de queries.
- **Otros caminos de inicio de sesión:** en `apps/web/src` solo existen `authClient.signIn.email` (login) y `authClient.signUp.email` (registro), y los dos usan `startSession`. No hay OAuth, 2FA, aceptación de invitaciones ni impersonación. El `fetchQuery({ ...meQuery, staleTime: 0 })` de `admin-users/user-row.tsx` es un cambio de rol de la misma sesión, no un cambio de cuenta, y se queda bien como está.

## Avisos para el humano (no bloquean)
- El registro (`register.tsx`) usa el mismo `startSession` pero no tiene un test de cambio de cuenta propio. El acceptance solo pide un test.
- El test no comprueba en el DOM el contenido de la campana. Lo cubre de forma indirecta: la campana y `DeviceNotificationsSync` leen la misma `notificationsQuery`, que tras el login solo contiene el aviso de Berta.
- Fuera de alcance (lo apunta el implementer): en la web con varias pestañas, si otra pestaña cambia de cuenta, la pestaña abierta conserva el `me` antiguo. No afecta a la app nativa. Si se quiere tratar, puede ir a una feature aparte.

## Cambios requeridos
Ninguno.
