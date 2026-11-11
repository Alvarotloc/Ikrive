# Implementación: #63 notifications-cache-per-user

Feature `sdd: false` (aviso 2 del reviewer en Gate 2 de #52). Guía: `description` y `acceptance` en `feature_list.json`.

## Decisión

Opción elegida: **`queryClient.clear()` al iniciar sesión** (sign-in y sign-up), no una clave de query por usuario.

- El problema es general, no solo de avisos: cualquier query de datos de usuario (vehículos, ajustes, avisos, canales, feed…) sobrevive en caché hasta su `gcTime` si la sesión acaba sin `useLogout`. El test lo demuestra: sin el arreglo, Berta veía en el inicio el vehículo de Ana además de recibir su aviso como notificación del sistema.
- Una clave por usuario solo protegería `notificationsQuery` (la campana tendría que recibir el `userId` y habría que repetirlo en cada query de usuario). `clear()` lo cubre todo en un único punto.
- Es coherente con el código existente: `useLogout` y `useChangeServer` ya vacían la caché entera con `queryClient.clear()` en las transiciones de sesión/servidor.

## Cambios por archivo

- `apps/web/src/features/auth/start-session.ts` (nuevo): `startSession(queryClient)` vacía la caché y carga la sesión nueva (`fetchQuery(meQuery)`). Al estar la caché vacía ya no hace falta `staleTime: 0`.
- `apps/web/src/routes/login.tsx` y `apps/web/src/routes/register.tsx`: tras un sign-in / sign-up correcto llaman a `startSession` en lugar de `fetchQuery({ ...meQuery, staleTime: 0 })`.
- `apps/web/src/features/auth/login-page.test.tsx`: nuevo `describe('switching accounts without logging out')` con mock de `@/lib/native-notifications`.

## Trazabilidad

| Acceptance | Test |
|---|---|
| La campana y `DeviceNotificationsSync` no usan avisos en caché de la cuenta anterior | `login-page.test.tsx` › `switching accounts without logging out` › `native app: signing in as another account never uses the cache of the previous one` |
| En la app no se muestran notificaciones del sistema de otra cuenta ni se guarda un corte ajeno | mismo test: `showNotifications` se llama una sola vez y solo con el aviso de Berta; el estado `ikrive.deviceNotifications.u2` queda con el corte y los ids de la página de Berta |
| Un test cubre el cambio de cuenta sin pasar por `useLogout` | mismo test: la caché parte con `me = null` (sesión de Ana caducada) y sus avisos y vehículos, sin pasar por `useLogout` |
| `pnpm harness --full` en verde | ver abajo |

Comprobado que el test **falla sin el arreglo** (revirtiendo temporalmente `login.tsx`): aparece «Coche de Ana» en el inicio de Berta y, quitando esa aserción, `showNotifications` recibe «Aviso ana-n1» en vez de «Aviso berta-n1».

## `pnpm harness --full`

```
[OK]    63 features: 57 done, 5 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #63 notifications-cache-per-user (in_progress)
[OK]    Rama actual: feat/notifications-cache-per-user
[OK]    pnpm lint
[OK]    pnpm typecheck
[OK]    pnpm test        (web 450/450, api 368/368, shared 119/119, mobile ok)
[OK]    Arnés en verde.
```

## Desviaciones / notas

- Sin desviaciones. Sin cambios de UI (no aplican capturas).
- El test cubre el sign-in; el sign-up usa el mismo `startSession`, sin test propio.
- Recomendación (fuera de alcance): en la web, si otra pestaña cambia de cuenta (la cookie cambia), la pestaña abierta conserva el `me` antiguo y sus queries pasan a traer datos de la cuenta nueva. No afecta a la app nativa (un solo WebView) ni al `userId` de `DeviceNotificationsSync`, que solo se monta en nativo. Si interesa, se podría detectar con un `BroadcastChannel`/evento `storage` y vaciar la caché.
