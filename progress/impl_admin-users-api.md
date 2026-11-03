# Implementación — admin-users-api (#37)

## Cambios por archivo

| Archivo | Cambio |
|---|---|
| `packages/shared/src/enums.ts` | `USER_STATUSES`, `ADMIN_USER_LOCK_REASONS` y tipos `UserStatus`, `AdminUserLockReason`. |
| `packages/shared/src/domain/admin-users.ts` (nuevo) | `adminUserLocks(target, { actorId, activeAdminCount })`: `lastAdmin = admin && !disabled && count <= 1`; `demote` = `last_admin` o `null`; `disable`/`delete` = `self` > `last_admin` > `null`. |
| `packages/shared/src/domain/admin-users.test.ts` (nuevo) | 4 tests de T3. |
| `packages/shared/src/schemas/admin.ts` | `adminUserLocksSchema`, `adminUserSchema`, `adminUserRoleUpdateSchema` y tipos `AdminUserLocks`, `AdminUser`, `AdminUserRoleUpdate`. |
| `packages/shared/src/schemas/admin.test.ts` (nuevo) | `accepts the user roles`, `rejects unknown roles`. |
| `packages/shared/src/index.ts` | Re-exporta `domain/admin-users`. |
| `apps/api/src/db/schema/auth.ts` | `user.disabledAt: integer({ mode: 'timestamp_ms' })` nullable (fuera de `additionalFields`). |
| `apps/api/src/db/migrations/0011_user_disabled_at.sql` + `meta/` | Generada con `pnpm db:generate --name user_disabled_at`: `ALTER TABLE user ADD disabled_at integer`. |
| `apps/api/src/auth.ts` | `databaseHooks.session.create.before`: si el usuario tiene `disabledAt` → `APIError('FORBIDDEN', { message: 'This account is disabled' })`. |
| `apps/api/src/modules/admin-users/repository.ts` (nuevo) | `list`, `find` (leftJoin + `count(vehicles.id)` + groupBy; orden `createdAt` asc, desempate por `id`), `countActiveAdmins`, `setRole`, `disable` (transacción: `disabled_at` + borrado de `session`), `enable`, `fileKeys` (fotos + `attachments.storage_key` por `owner_id`), `delete` (cascada FK). |
| `apps/api/src/modules/admin-users/service.ts` (nuevo) | `list`, `setRole`, `disable`, `enable`, `remove`. 404 `User not found`; locks → `ConflictError` con los details fijos del design; idempotencia (mismo rol / ya desactivado / ya activo → sin escribir); `remove`: claves → filas → `storage.remove(...).catch(log.error)`. |
| `apps/api/src/modules/admin-users/routes.ts` (nuevo) | 5 rutas del contrato con esquemas de `@ikrive/shared`; `DELETE` → 204. Hook `requireAdmin` en `preValidation` (ver Desviaciones). |
| `apps/api/src/app.ts` | Composición `createAdminUsersService({ repo, storage, log: app.log })` y registro de `adminUsersRoutes` bajo `/api`. |
| `apps/api/test/admin-users.test.ts` (nuevo) | 16 tests de integración (T10–T15). |

## Trazabilidad

| R | Test |
|---|---|
| R1 | `apps/api/test/admin-users.test.ts › lists users with status and vehicle count`; `packages/shared/src/schemas/admin.test.ts › accepts the user roles` |
| R2 | `admin-users.test.ts › lists users with status and vehicle count` (2 con uno archivado, 1, 0) |
| R3 | `admin-users.test.ts › returns locks for the actor and the last admin` |
| R4 | `admin-users.test.ts › changes a user's role` |
| R5 | `admin-users.test.ts › changes a user's role` (promovido accede; degradado → 403 con la misma cookie, `/api/me` 200 `role: 'user'`) |
| R6 | `admin-users.test.ts › disables a user and closes their sessions` |
| R7 | `admin-users.test.ts › disables a user and closes their sessions` (sesiones a 0, cookie → 401) |
| R8 | `admin-users.test.ts › disables a user and closes their sessions` (sign-in → 403, sin `set-cookie`, sin sesión) |
| R9 | `admin-users.test.ts › re-enables a user` |
| R10 | `admin-users.test.ts › disable and enable are idempotent` |
| R11 | `admin-users.test.ts › deletes a user with all their data and files` |
| R12 | `admin-users.test.ts › deletes a user with all their data and files` (foto y adjunto ya no existen) |
| R13 | `admin-users.test.ts › still deletes when a file cannot be removed` (204, error nivel 50 con `key` en el log) |
| R14 | `admin-users.test.ts › cannot demote the last admin`; `domain/admin-users.test.ts › locks demote only for the last active admin` |
| R15 | `admin-users.test.ts › protects the last admin from being disabled or deleted` (servicio directo); `domain/admin-users.test.ts › locks disable and delete for self before last admin` |
| R16 | `admin-users.test.ts › cannot disable or delete yourself`; `domain/admin-users.test.ts › locks disable and delete for self before last admin` |
| R17 | `domain/admin-users.test.ts` (los 4 tests); el servicio usa la misma función para `locks` y para los 409 |
| R18 | `admin-users.test.ts › disabled admins do not count as admins`; `domain/admin-users.test.ts › ignores disabled admins in the count` |
| R19 | `admin-users.test.ts › returns 404 for an unknown user` |
| R20 | `admin-users.test.ts › rejects an invalid role`; `schemas/admin.test.ts › rejects unknown roles` |
| R21 | `admin-users.test.ts › returns 401 without a session` (las 5 rutas, también con cuerpo inválido) |
| R22 | `admin-users.test.ts › returns 403 for a regular user` (las 5 rutas, también con cuerpo inválido; sin cambios en BD) |

## `pnpm harness --full`

```
[OK]    44 features: 36 done, 7 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #37 admin-users-api (in_progress)
[OK]    Rama actual: feat/admin-users-api
[OK]    pnpm lint
[OK]    pnpm typecheck
[OK]    pnpm test        (shared 117 · api 293 · web 299)
[OK]    Arnés en verde.
```

## Desviaciones del spec

1. **Hook `preValidation` en vez de `preHandler`** en `adminUsersRoutes`. El design dice `app.addHook('preHandler', app.requireAdmin)` "(401/403 antes de validar params o cuerpo)", pero en Fastify la validación de params/cuerpo corre *antes* de `preHandler`. Con `preHandler`, un usuario normal (o sin sesión) que manda `PUT …/role` con un rol inválido recibía 400 en vez de 403/401, lo que incumple R21/R22 y la intención explícita del design. `preValidation` cumple ambos; el test `returns 403 for a regular user` lo cubre (y `returns 401 without a session` con `{ role: 'owner' }`). `adminRoutes` (jobs) no se ha tocado: no valida nada antes del handler.
2. **Desempate del orden por `id`** en `list()` (`orderBy(createdAt asc, id asc)`) para que sea determinista si dos altas comparten milisegundo. No cambia el contrato.
3. **Test extra** `accepts the user roles` en `schemas/admin.test.ts`, además del pedido `rejects unknown roles`.

Sin UI: no aplican capturas.
