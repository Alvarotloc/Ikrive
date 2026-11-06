# Design — disabled-user-public-access

Un único filtro SQL `activeUserFilter` (`isNull(user.disabled_at)`) que se aplica **en las consultas** que resuelven un token público o que alimentan los jobs. Un dueño desactivado se comporta como si su token no existiera: la fila no sale de la consulta y el servicio sigue el mismo camino que con un selector desconocido. No se toca ninguna fila de tokens, así que reactivar basta para que todo vuelva a funcionar.

## Inventario

| Acceso / tarea | Credencial | ¿Afectado hoy? | Decisión |
|---|---|---|---|
| Feed iCal `GET /api/calendar/:token.ics` | token en la URL (`calendar_feeds`) | Sí, sirve datos | **Filtrar** (R1, R2) |
| Informe público `GET /api/public/reports/:token` | token en la URL (`report_shares`) | Sí, genera el PDF | **Filtrar** (R3–R5) |
| Sesiones de Better Auth | cookie | No: #37 borra las sesiones y bloquea `session.create` | Sin cambios (sin `cookieCache`, ver Riesgos) |
| Tokens de `verification` (reset de contraseña, verificación de email) | token por email | No: no hay `sendResetPassword` ni verificación de email configurados | Sin cambios |
| Tokens de canales (`notification_channels.config.token`) | credencial **saliente** hacia ntfy/Gotify/Apprise | No es un acceso a Ikrive | Cubierto por R12 (no se envía nada) |
| Fotos, adjuntos, export/import, ajustes del feed, prueba de canal | sesión (`app.authenticate`) | No | Sin cambios |
| Job `reminders` (cron + `POST /api/admin/jobs/:name/run` + CLI `job.js`) | — | Sí, crea notificaciones y envía | **Filtrar** (R8, R10) |
| Job `odometer-nudge` (mismas tres vías) | — | Sí | **Filtrar** (R9, R11) |
| Dispatcher de canales (push/webhook) | — | Solo recibe filas de los jobs | **Filtrar** como defensa en profundidad (R12) |
| Emails | — | No existen | — |

Las notificaciones in-app ya creadas no se borran: el usuario las verá al volver.

## Archivos

| Capa | Archivo | Cambio |
|---|---|---|
| api | `apps/api/src/db/filters.ts` (nuevo) | `export const activeUserFilter = isNull(user.disabledAt);` con JSDoc («cuenta no desactivada por el admin; lo usan los accesos por token y los jobs»). |
| api | `apps/api/src/modules/admin-users/repository.ts` | `countActiveAdmins` usa `activeUserFilter` (misma regla, un solo sitio). |
| api | `apps/api/src/modules/calendar/repository.ts` | `findBySelector`: `select(getTableColumns(calendarFeeds))` + `innerJoin(user, eq(user.id, calendarFeeds.userId))` + `and(eq(selector), activeUserFilter)`. Mismo tipo de retorno. |
| api | `apps/api/src/modules/report-shares/repository.ts` | `findBySelector`: `innerJoin(user, eq(user.id, vehicles.ownerId))` + `activeUserFilter`. |
| api | `apps/api/src/modules/schedules/repository.ts` | `listForActiveVehicles`: `innerJoin(user, eq(user.id, vehicles.ownerId))` + `and(activeVehicleFilter, activeUserFilter)`. `listForOwnerActiveVehicles` no cambia (el feed ya se corta en el token). |
| api | `apps/api/src/modules/vehicles/repository.ts` | `listActiveForOdometerNudge`: mismo `innerJoin(user)` + `activeUserFilter`. |
| api | `apps/api/src/modules/notification-channels/repository.ts` | `listEnabledByUsers`: `innerJoin(user, eq(user.id, notificationChannels.userId))` + `activeUserFilter`; `select(getTableColumns(notificationChannels))`. |
| api | `apps/api/src/modules/calendar/routes.ts`, `report-shares/routes.ts` (`calendarFeedRoutes`, `publicReportRoutes`) | Hook `onSend` del plugin que pone `cache-control: private, no-store` en toda respuesta (incluidas las de error); se quita el `.header('cache-control', …)` duplicado de los handlers. |
| docs | `docs/PLAN.md` | En el modelo de datos, `user.disabled_at` añade «y deja de servir su feed iCal y sus enlaces públicos y de recibir recordatorios hasta que se reactiva». |
| test | `apps/api/test/{calendar,report-shares,reminders,odometer-nudge,notification-channels-dispatch}.test.ts` | Ver `tasks.md`. |

Los servicios (`calendar/service.ts`, `report-shares/service.ts`), el dispatcher y los jobs **no cambian**: ya tratan «no hay fila» como 404 o como «nada que hacer».

## BD

Sin cambios ni migración. `user.id` es PK: los `innerJoin` no duplican filas ni afectan al `groupBy(vehicles.id)` de `listActiveForOdometerNudge`.

## Contrato HTTP

Sin rutas nuevas. Cambia solo el comportamiento:

| Ruta | Dueño activo | Dueño desactivado | Tras reactivar |
|---|---|---|---|
| `GET /api/calendar/:token.ics` | 200 `text/calendar` | 404 `problem+json` `Calendar feed not found` (idéntico a selector desconocido) | 200 con el mismo token |
| `GET /api/public/reports/:token` | 200 PDF / 404 si revocado o caducado | 404 `Report not found` (idéntico) | 200 si sigue activo; 404 si caducó o se revocó entretanto |

Todas las respuestas de estas dos rutas, también los 404, llevan `cache-control: private, no-store`. No hay `ETag` ni `Last-Modified` (no está registrado `@fastify/etag` y Fastify no los añade), así que no hay validadores que un cliente pueda reutilizar. El rate limit del informe público (10/min) no cambia y sigue contando los 404.

## Tipos y firmas

```ts
// apps/api/src/db/filters.ts
export const activeUserFilter: SQL; // isNull(user.disabledAt)
```

Las firmas de los repositorios no cambian.

## Tests

- **HTTP (feed e informe):** `setup` crea primero la cuenta admin y después la del dueño (el admin no puede desactivarse a sí mismo, R16 de #37). Desactivar y reactivar con `POST /api/admin/users/:id/{disable,enable}` y la cookie del admin. «Idéntico» = mismo `statusCode`, `content-type` y `json()` que la petición con un token del mismo formato y selector aleatorio. Tras reactivar, la cookie del dueño ya no vale (sus sesiones se borraron): las acciones posteriores del dueño (revocar, comprobar el feed) usan `signIn` o la BD.
- **R6:** se leen las filas de `calendar_feeds` y `report_shares` antes de desactivar y después de reactivar y se comparan con `toEqual`.
- **R5:** con el dueño desactivado se caduca un enlace con el `expireShare(db, id)` existente y se revoca otro poniendo `revoked_at` en la BD (el dueño no tiene sesión); tras reactivar ambos dan 404 y un tercero da 200.
- **Jobs y dispatcher:** se pone `user.disabled_at` directamente en la BD (`db.update(user)`) como ya hacen esos tests con los ajustes; `runReminders`/`runOdometerNudge` con `createTestDispatcher(db, fetch)` y se afirman filas de `notifications`, `evaluated` y llamadas a `fetch`.

## Impacto en UI

Ninguno. La web no muestra el estado del feed ni de los enlaces a terceros.

## Alternativas descartadas

- **Helper `isUserActive(userId)` en el servicio, después de verificar el token:** una consulta más por petición, cada servicio tiene que acordarse de llamarlo y el camino del desactivado (comparación del verificador + consulta extra) difiere en tiempo del de un selector desconocido. Con el filtro en la consulta el caso es literalmente el mismo que «selector desconocido».
- **Revocar o borrar los tokens al desactivar:** contradice el acceptance (al reactivar deben funcionar con el mismo token) y obligaría a guardar el estado previo de cada enlace.
- **Hook global `onRequest` que compruebe al dueño:** el dueño solo se conoce tras resolver el token, que es lógica de cada módulo; además los jobs no pasan por HTTP.
- **Filtrar solo en los jobs y no en el dispatcher:** hoy bastaría, pero el dispatcher es el punto por el que saldría cualquier envío futuro; el `innerJoin` es una línea y no cambia nada para los activos.
- **Ubicar el filtro en `admin-users/repository.ts`:** `vehicles`, `schedules`, `calendar` y `notification-channels` dependerían del módulo de administración; `db/filters.ts` es neutral.

## Decisiones a validar (Gate 1)

1. **El filtro va en la consulta del selector**, antes de comparar el verificador: un token válido de un desactivado y un token inventado son indistinguibles también en tiempo.
2. **`cache-control: private, no-store` en todos los 404** de las dos rutas públicas (hoy solo lo llevan los 200): evita que un proxy o el cliente de calendario guarde el 404 de la desactivación y siga fallando tras reactivar. Afecta igual a cualquier 404 de esas rutas, así que no revela el motivo.
3. **Los jobs omiten por completo al desactivado** (no crean la notificación in-app ni la envían). Al reactivar, la siguiente ejecución crea los avisos aún pendientes, porque su `dedupeKey` nunca llegó a insertarse; no se «recuperan» avisos de estados que ya no aplican. Si se reactiva dentro de la misma semana ISO y aún no ha pasado su día/hora, recibe el aviso de odómetro esa semana.
4. **Las notificaciones in-app existentes se conservan** durante la desactivación.
5. **`evaluated`** en el resumen de `POST /api/admin/jobs/:name/run` y del CLI deja de contar a los desactivados.
6. **El feed no se corta en `listForOwnerActiveVehicles`**, solo en el token: es el único punto de entrada.

## Riesgos

- **Clientes de calendario:** algunos (Google Calendar) refrescan cada muchas horas y pueden seguir mostrando los eventos ya descargados hasta su siguiente sondeo; tras un 404 algunos dejan de sondear la suscripción. Fuera de nuestro control.
- **`cookieCache` de Better Auth:** sigue sin activarse; si se activa, habrá que revisar `authenticate` (aviso heredado de #37).
- **Nuevos accesos por token o jobs en el futuro** tienen que acordarse de `activeUserFilter`; el JSDoc del filtro lo indica.

## Fuera de alcance

- Mostrar al dueño que su feed o sus enlaces estuvieron cortados, avisar a quien tiene el enlace, cambios en la web, revocar tokens al borrar (ya lo hace la cascada FK de #37), `cookieCache`.
