# Exploración #37 admin-users-api: borrado de usuario y listado

> Rutas relativas a la raíz del repo. Guardado por el leader a partir del informe del agente Explore (solo lectura).

## 1. Tablas que dependen del usuario (apps/api/src/db/schema/)
`PRAGMA foreign_keys = ON` está activado en apps/api/src/db/client.ts:16 (WAL en :15, busy_timeout en :17). Las migraciones tienen los mismos `ON DELETE` (apps/api/src/db/migrations/0000–0010).

Dependen directamente de `user.id`, todas con `onDelete: 'cascade'`:
- `session.userId`: auth.ts:34-36
- `account.userId`: auth.ts:48-50 (contraseña)
- `user_settings.userId` (PK): settings.ts:6-8
- `calendar_feeds.userId` (PK): calendar.ts:11-13
- `notification_channels.userId`: notification-channels.ts:14-16
- `notifications.userId`: notifications.ts:15-17
- `attachments.ownerId`: attachments.ts:19-21. Cae en cascada por el usuario, pero `entityId` es polimórfico y no tiene FK.
- `vehicles.ownerId`: vehicles.ts:14-16, con índice `vehicles_owner_id_idx` (:43)

Dependen de `vehicles.id`, todas con cascade:
- `odometer_readings`: vehicles.ts:50-52
- `maintenance_schedules`: maintenance.ts:19-21
- `maintenance_records`: maintenance.ts:47-49
- `fuel_logs`: fuel.ts:13-15
- `report_shares`: report-shares.ts:18-20
- `notifications.vehicleId` (nullable): notifications.ts:19

Referencias internas con `set null`:
- `maintenance_records.odometerReadingId` → odometer_readings (maintenance.ts:54)
- `maintenance_records.scheduleId` → schedules (:63)
- `fuel_logs.odometerReadingId` (fuel.ts:21)

`verification` (auth.ts:63-73) no tiene FK al usuario: va por `identifier`, y con email+password no queda nada que cuelgue del usuario.

**Conclusión:** `DELETE FROM user WHERE id = ?` borra en cascada todas las filas, también las de `attachments` (por `owner_id`) y las sesiones, así que cierra la sesión en el acto (no hay `cookieCache` configurado, auth.ts). Lo único que no borra la BD son los ficheros en disco (punto 2).

No existe ningún campo de estado o baneo en `user` (auth.ts:16-24, solo `role`). Para "desactivar" hace falta una columna y migración nueva (la siguiente sería 0011) o el plugin admin de Better Auth (`banned`/`banReason`/`banExpires`). El rol está en auth.ts:25-29 como `additionalFields` con `input: false`, y el primer usuario pasa a admin en el hook de auth.ts:35-41. Ese hook también inserta `user_settings` (:42-44).

## 2. Ficheros en disco
- apps/api/src/lib/storage.ts:10-45, `createFileStorage(root)`: `save(folder, data, ext)` devuelve una clave tipo `vehicles/<uuid>.webp` o `attachments/<uuid>.<ext>`. Tiene `read`, `exists`, y `remove(key)` (:39-41), que hace `rm` con `force: true` y es idempotente (no falla si el fichero no existe). Las rutas se protegen contra traversal en `pathOf` (:13-17).
- La instancia única es `storage = createFileStorage(uploadsPath(config))` en apps/api/src/app.ts:100. En los tests las rutas son `<dataDir>/uploads/vehicles` y `<dataDir>/uploads/attachments`.
- La foto del vehículo es `vehicles.photo`, que guarda la clave (vehicles.ts:31-32). El adjunto es `attachments.storageKey`, único (attachments.ts:33).

Cómo se borra hoy (siempre en este orden: recoger claves, borrar filas, borrar ficheros):
- **Vehículo**, modules/vehicles/service.ts:121-128: `files = attachments.listByVehicle(id)`, luego `repo.delete(id)`, luego `storage.remove(photo)` y `storage.remove` de cada adjunto. `repo.delete` (vehicles/repository.ts:53-69) borra en una transacción los adjuntos 'maintenance' de los registros del vehículo con un subselect `inArray`, y después el vehículo.
- **Registro de mantenimiento**: maintenance/service.ts:145-149 y maintenance/repository.ts:8-22 (en el bloque de líneas 128-142 del fichero).
- **Adjunto**, attachments/service.ts:126-130: `repo.delete`, luego `storage.remove`.
- **Compensación al subir**: attachments/service.ts:91-107, si falla el insert hace `storage.remove`.
- **Compensación en data-import**, data-import/service.ts:379-396: si falla el insert, borra los ficheros ya guardados con `.catch` que registra con `log.error` sin romper el flujo.
- **Utilidades reutilizables**: attachments/repository.ts:40-48 `listByVehicle(vehicleId)` (por vehículo, no por usuario). Para un usuario basta `select storageKey from attachments where owner_id = ?` más `select photo from vehicles where owner_id = ? and photo is not null`. Como modelo de consulta "todo lo de un usuario" está data-export/repository.ts:22-80. No hay ninguna utilidad de borrado por usuario.
- **Patrón recomendado**: recoger las claves, `db.delete(user)` (la cascada hace el resto), y después `storage.remove` de cada clave con `.catch` + log, como en data-import. Un fichero huérfano es aceptable; una fila sin su fichero no lo es.

## 3. Patrones de módulo
- **Estructura**: `modules/<x>/{routes,service,repository}.ts`. Las factorías son `createXRepository(db)` y `createXService({ repo, ... })`, con `export type XService = ReturnType<...>`. Se conectan en app.ts:100-190 y se registran en app.ts:192-216 (prefijo /api).
- **Admin actual**: modules/admin/routes.ts:13-31 recibe `{ db, dispatcher }` y aplica `app.addHook('preHandler', app.requireAdmin)` a todo el plugin, antes de validar nada.
- **Autenticación**: plugins/auth.ts. `requireAdmin` (:214-217) da 401 sin sesión y 403 si no es admin. `currentUser(request)` está en :200-203.
- **Rutas**: modelo en modules/report-shares/routes.ts:15-48, con `FastifyPluginAsyncZod<{ service }>`, `schema: { params, body, response }` con esquemas de @ikrive/shared, `reply.status(201)` y `204` con `send()`.
- **Esquemas compartidos**: packages/shared/src/schemas/admin.ts (hoy solo `JOB_NAMES` y `jobRunSummarySchema`). Ahí deberían ir los de usuarios. El índice es packages/shared/src/index.ts:10. Hay `idParamSchema` y `meSchema` en schemas/common.ts:37 y :55-61, y `USER_ROLES` en packages/shared/src/enums.ts:1-2.
- **Errores**: apps/api/src/lib/errors.ts. Están `AppError(status, title, detail)`, `BadRequestError` (400), `UnauthorizedError` (401), `ForbiddenError` (403, :76), `NotFoundError` (404) y `ConflictError` (409, :88). Se serializan como problem+json en plugins/errors.ts:27-37. Para el último admin o uno mismo encaja `ConflictError` (como en vehicles/service.ts:161, 173) o `ForbiddenError`.
- **Tests de integración** (apps/api/test/):
  - helpers.ts: `createTestApp(env)` devuelve `{ app, db, dataDir }` (:15-31) con BD en `:memory:` y `DATA_DIR` temporal. `signUp(app, email, name)` devuelve `{ response, cookie }` (:36-45). El primer usuario registrado es admin y los siguientes son 'user'.
  - Modelo: test/admin-jobs.test.ts. `createUser` (:16-66) devuelve `userId` y `cookie`, `expectProblem` está en :77-81, y tiene casos de 401 y de 403 para usuario normal.
  - Comprobar ficheros en disco: test/vehicles.test.ts:186-214 y test/attachments.test.ts:85-90 (`existsSync`/`readdirSync` sobre `join(dataDir,'uploads',...)`).

## 4. Contar vehículos por usuario
Una sola consulta con `leftJoin` + `groupBy`, aprovechando `vehicles_owner_id_idx`:

```ts
db.select({ ...getTableColumns(user), vehicleCount: count(vehicles.id) })
  .from(user).leftJoin(vehicles, eq(vehicles.ownerId, user.id))
  .groupBy(user.id).orderBy(asc(user.createdAt)).all();
```

Precedentes: `groupBy` + agregado en vehicles/repository.ts:112-131 (`max()` con `leftJoin`), `count()` en auth.ts:12 y notifications/repository.ts:14, y `getTableColumns` en data-export/repository.ts:35. Hace falta `count(vehicles.id)` y no `count()`, para que un usuario sin vehículos dé 0. Para "último admin", `count()` de `user` con `role = 'admin'` dentro de la misma operación.
