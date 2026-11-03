# Review — #37 admin-users-api

**Veredicto:** APPROVED

## Trazabilidad requirements ↔ tests
- R1: [x] `apps/api/test/admin-users.test.ts` › `lists users with status and vehicle count` (200, orden por `createdAt` fijado a fechas distintas, `id/name/email/role/status/createdAt/vehicleCount` exactos con `toEqual`, `disabledAt` null/string, cada fila pasa `adminUserSchema`)
- R2: [x] mismo test (Bob 2 con uno archivado, admin 1, Carol 0)
- R3: [x] `› returns locks for the actor and the last admin` (`isSelf`, `demote: 'last_admin'`, `disable/delete: 'self'`; usuario normal todo `null`)
- R4: [x] `› changes a user's role` (200 con `role: 'admin'` y fila en BD)
- R5: [x] mismo test (el promovido accede con la misma cookie; degradado → 403 en `/api/admin/users` y `/api/me` 200 `role: 'user'`)
- R6: [x] `› disables a user and closes their sessions` (200 `status: 'disabled'`, `disabledAt >= before` e igual en BD)
- R7: [x] mismo test (sesiones de Bob a 0, cookie → 401, la del admin sigue válida); transacción en `repository.ts` `disable()`
- R8: [x] mismo test (sign-in con contraseña correcta → 403, sin `set-cookie`, 0 sesiones)
- R9: [x] `› re-enables a user` (200 `status: 'active'`, `disabledAt: null` en BD, sign-in 200 y 1 sesión)
- R10: [x] `› disable and enable are idempotent` (segundo disable conserva `disabledAt` en respuesta y BD; enable sobre activo 200)
- R11: [x] `› deletes a user with all their data and files` (204; sin filas en `user`, `session`, `account`, `user_settings`, `vehicles`, `attachments`, `notifications`; sign-in 401; admin intacto)
- R12: [x] mismo test (foto y adjunto existían y ya no existen en disco)
- R13: [x] `› still deletes when a file cannot be removed` (foto sustituida por directorio → 204, usuario borrado, adjunto borrado, exactamente un error nivel 50 con `key` en el log)
- R14: [x] `› cannot demote the last admin` (409 + detail, sigue `admin`; con segundo admin → 200) + `domain/admin-users.test.ts` › `locks demote only for the last active admin`
- R15: [x] `› protects the last admin from being disabled or deleted` (servicio directo con actor ajeno → `ConflictError` en `disable` y `remove`, sin cambios ni sesiones borradas) + test de dominio
- R16: [x] `› cannot disable or delete yourself` (409 + detail `self` en ambos con otro admin activo, sin cambios, sesión intacta)
- R17: [x] `packages/shared/src/domain/admin-users.test.ts` (4 tests, precedencia `self` > `last_admin` comprobada con count 1); el servicio usa `adminUserLocks` tanto para `locks` como para los 409
- R18: [x] `› disabled admins do not count as admins` (admin desactivado no libera al actor → 409; se puede degradar al desactivado) + `› ignores disabled admins in the count`
- R19: [x] `› returns 404 for an unknown user` (las cuatro mutaciones, `problem+json`)
- R20: [x] `› rejects an invalid role` (`owner`, `admin,user`, ausente → 400 y rol sin cambiar) + `schemas/admin.test.ts` › `rejects unknown roles`
- R21: [x] `› returns 401 without a session` (las 5 rutas, también con cuerpo inválido; sin cambios en BD)
- R22: [x] `› returns 403 for a regular user` (las 5 rutas, también con cuerpo inválido; filas de los tres usuarios y sesión del admin sin cambios)

## Tasks
- T1..T16: [x]

## Checkpoints
- C1: [x] `pnpm harness` OK, una sola feature activa (#37 `in_progress`), rama `feat/admin-users-api`.
- C2: [x] Spec completo en EARS, tabla de acceptance completa, tasks `[x]`, cada `R<n>` con test leído.
- C3: [x] El diff solo toca los archivos de la tabla de `design.md` (+ `progress/`). Sin refactors ajenos; `adminRoutes` (jobs) no se ha tocado.
- C4: [x] Módulo `modules/admin-users/{routes,service,repository}.ts`, cableado en `app.ts`, esquemas de `@ikrive/shared`; errores `NotFoundError`/`ConflictError` (RFC 7807); columna en `db/schema/auth.ts` + migración `0011_user_disabled_at.sql` generada (snapshot 0011 con `prevId` = id de 0010, única diferencia la columna `disabled_at`); lógica pura en `packages/shared` con tests. Sin web (#38).
- C5: [x] Sin `any`/`@ts-ignore`/`console.log`; fechas de auditoría como ISO timestamp (no son fechas de calendario); sin ficheros nuevos subidos.
- C6: [x] `pnpm harness --full` en verde (shared 117 · api 293 · web 299), ejecutado por mí. SQLite en memoria real, sin mocks de BD (solo `log.error` con `vi.fn()` en el test de servicio). Sin UI → sin capturas.
- C7: [x] `progress/impl_admin-users-api.md` con archivos, mapa y salida; `progress/current.md` al día; `docs/PLAN.md` no cambia (la fase 7 sigue abierta con #38).

## Valoración de la desviación `preValidation`
Correcta y necesaria. En Fastify el orden es `onRequest → preParsing → parsing → preValidation → validation → preHandler`, así que con `preHandler` un no admin con cuerpo inválido recibiría 400 en vez de 401/403, lo que contradice R21/R22 y el propio texto del design («401/403 antes de validar params o cuerpo»). `preValidation` cumple la intención del spec; el hook queda encapsulado en el plugin (no usa `fastify-plugin`) y solo afecta a estas cinco rutas. Los tests lo fijan con `{ role: 'owner' }` sin sesión (401) y con usuario normal (403).

## Seguridad (revisado específicamente)
- **Acceso no admin:** las cinco rutas están en el plugin con `requireAdmin` (sesión + rol leído de BD en cada petición); 401/403 probados en todas. El rol de la sesión se lee vía `getSession` sin `cookieCache`, así que la degradación es inmediata (R5 probado).
- **Bloqueo de login:** `databaseHooks.session.create.before` corre en cualquier `createSession` de Better Auth (sign-in email; no hay OAuth, magic link, reset de contraseña ni `autoSignInAfterVerification` configurados que creen sesiones por otra vía). Las sesiones existentes se borran en la misma transacción que `disabled_at`. `disabledAt` no está en `additionalFields`, así que `update-user` no puede tocarlo. No encuentro bypass.
- **Carreras:** check y escritura son síncronos (better-sqlite3) y en `remove` todo lo que decide va antes del primer `await`.
- **Migración 0011:** `ALTER TABLE user ADD disabled_at integer` nullable, sin pérdida de datos, journal y snapshot coherentes.
- **Borrado de ficheros:** claves (fotos + `attachments.storage_key` por `owner_id`) leídas antes de borrar filas; borrado de filas por cascada FK (`foreign_keys = ON`; todas las FKs a `user` son `cascade`); fallos de `storage.remove` registrados sin abortar. Las únicas carpetas que escribe `storage.save` son `vehicles` y `attachments`, ambas cubiertas.

## Hallazgos
Ninguno bloqueante.

## Avisos para el humano (no bloquean)
- El test de R11 comprueba 7 tablas (las que fija T13); `notification_channels`, `calendar` (feed), `report_shares` y los datos de mantenimiento/combustible no se afirman explícitamente. Van por la misma cascada FK, así que el riesgo es bajo.
- Un cuerpo JSON mal formado se rechaza en el *parsing*, antes de `preValidation`, así que un no admin con JSON roto recibe 400, no 403. No revela nada ni cambia datos.
- Desactivar no revoca el feed de calendario ni los enlaces públicos de informe del usuario (van por token, no por sesión). Está fuera del acceptance, pero conviene decidir si #38 o una feature futura lo trata.
- Riesgo ya documentado en el design: si algún día se activa `cookieCache`, habrá que comprobar `disabledAt` en `authenticate`.

## Cambios requeridos
Ninguno.
