# Exploración #37 admin-users-api: autenticación y roles

> Rutas relativas a la raíz del repo. Guardado por el leader a partir del informe del agente Explore (solo lectura).

## 1. Better Auth en apps/api
- **Versión instalada:** better-auth 1.7.7.
- **Configuración:** `apps/api/src/auth.ts`, `createAuth(db, config)` L11-49.
  - **Plugins:** ninguno (no existe la clave `plugins`).
  - **Opciones activas:** `emailAndPassword` con mínimo 8 caracteres (L24), `drizzleAdapter` sqlite (L23), `rateLimit` solo en producción (L30).
  - **Sesión:** sin bloque `session` → cookie cache y `secondaryStorage` desactivadas.
- **Campo `role`:** `user.additionalFields.role` = `{ type:'string', required:false, defaultValue:'user', input:false }` (L25-29).
  - Tipos: `SessionUser = Auth['$Infer']['Session']['user']` (L9).
  - Enum: `USER_ROLES = ['admin','user']` en `packages/shared/src/enums.ts:1`, usado por el zod de `packages/shared/src/schemas/common.ts:42`.
- **Primer usuario y `DISABLE_SIGNUP`:** `databaseHooks.user.create.before` (auth.ts L35-41).
  - Cuenta usuarios; si ya hay alguno y `DISABLE_SIGNUP` está activo lanza `APIError('FORBIDDEN')`; si no, `role = existing===0 ? 'admin' : 'user'`.
  - El hook `after` (L42-44) crea la fila de `userSettings`.
  - `DISABLE_SIGNUP` en `apps/api/src/config.ts:17` (`booleanString.default(false)`).
- **Esquema Drizzle:** `apps/api/src/db/schema/auth.ts`, `casing: 'snake_case'` (drizzle.config.ts, `db/client.ts:18`), `foreign_keys = ON` (`client.ts:16`).
  - `user` (L16-24): id, name, email unique, emailVerified, image, `role: text({ enum: USER_ROLES }).notNull().default('user')`, createdAt/updatedAt. El enum es solo de tipos; SQLite no tiene CHECK.
  - `session` (L26-40): token unique, expiresAt, ipAddress, userAgent, userId FK cascade, índice `session_user_id_idx`.
  - `account` (L42-61): userId FK cascade, `password`.
  - `verification` (L63-73).
  - No hay columnas banned, disabledAt ni impersonatedBy.
  - Migraciones en `apps/api/src/db/migrations`; la última es `0010_report_shares.sql`.

## 2. Protección de las rutas solo-admin
- **Decoradores:** `apps/api/src/plugins/auth.ts`.
  - `authenticate` (L27-31): `auth.api.getSession` con las cabeceras, `UnauthorizedError` (401), rellena `request.user`.
  - `requireAdmin` (L33-36): `await app.authenticate(request); if (currentUser(request).role !== 'admin') throw new ForbiddenError();`
  - `currentUser()` (L19-22). Puente Fastify ↔ Better Auth en `/api/auth/*` (L39-59).
- **Errores:** `apps/api/src/lib/errors.ts:31-35`, `ForbiddenError` → 403 `application/problem+json`.
- **Uso:** `apps/api/src/modules/admin/routes.ts:18` aplica `app.addHook('preHandler', app.requireAdmin)` a todo el plugin. Solo existe `POST /admin/jobs/:name/run` (L20-30). Registrado en `apps/api/src/app.ts:216` bajo `/api` (L218); plugin de auth en `app.ts:97`.
  - Las rutas nuevas de usuarios pueden ir en el mismo `adminRoutes` (o un plugin hermano con el mismo hook) y heredan 401/403.
- **Tests:**
  - `apps/api/test/admin-jobs.test.ts`: 401 sin sesión (L144-150), 403 para usuario normal (L154-164), helper `expectProblem` (L77-80).
  - `apps/api/test/auth.test.ts`: primer usuario admin (L5-14), `DISABLE_SIGNUP` → 403 (L16-20), 401 (L22-26).
  - `createTestApp(env?)` y `signUp(app, email, name)` en `apps/api/test/helpers.ts` (L15, L36). El primer `signUp` es el admin.

## 3. Plugin `admin` de Better Auth 1.7.7
Base: `apps/api/node_modules/better-auth/dist/plugins/admin/`.

- **Esquema** (`schema.mjs` L2-31): en `user` añade `role` (string, input:false), `banned` (boolean, default false), `banReason`, `banExpires` (date); en `session` añade `impersonatedBy`.
  - Con migraciones Drizzle habría que añadir estas columnas a `db/schema/auth.ts` y generar migración (`banned`, `ban_reason`, `ban_expires`, `session.impersonated_by`). El CLI de Better Auth no aplica.
- **Compatibilidad con el `role` propio:**
  - `mergeSchema` (admin.mjs L86) combina el `role` del plugin con `additionalFields.role`; ambos string, sin choque.
  - Su hook `user.create.before` (admin.mjs L27-32) devuelve `{ role: defaultRole, ...user }` → el rol que trae el dato tiene prioridad.
  - Los hooks de plugins se ejecutan antes que los del usuario (`dist/context/helpers.mjs` L22-25 vs L43-45), así que el hook de Ikrive (admin/user) sigue mandando. Compatible.
- **Roles y permisos:** por defecto `adminRoles: ['admin']`, `defaultRole: 'user'` (admin.mjs L12-16). `hasPermission` divide el role por comas y consulta `defaultRoles` (`access/statement.mjs`). Sin permiso lanza `APIError FORBIDDEN` con su propio código, no el problem+json de Ikrive.
- **Endpoints** (`routes.mjs`), todos con `adminMiddleware` (L17-21):
  - `setRole` → `POST /admin/set-role` (L44-79). Solo valida el valor si se pasa `opts.roles`; si no, acepta cualquier string (incluso varios roles separados por comas).
  - `listUsers` → `GET /admin/list-users` (L324-385): limit, offset, search, filter, sortBy, `total`. **No devuelve nº de vehículos.**
  - `banUser` (L508-541): YOU_CANNOT_BAN_YOURSELF (L533), `banned:true` + banReason/banExpires (L534-539), `deleteUserSessions` (L540).
  - `unbanUser` (L449-…): limpia banned/banReason/banExpires.
  - `revokeUserSessions` (L712-736) → `deleteUserSessions(userId)`.
  - `removeUser` (L755-782): YOU_CANNOT_REMOVE_YOURSELF (L779), `deleteUserSessions` + `deleteUser`.
  - Otros: `adminUpdateUser` (L233; `banned:true` también borra sesiones, L305), `createUser`, `getUser`, `listUserSessions`, `impersonateUser`/`stopImpersonating`, `setUserPassword`, `userHasPermission`.
  - **Ninguno protege al último admin**: habría que hacerlo en código propio (hooks `before` en `/admin/*` o endpoints propios).
- **Bloqueo de login de un baneado** (admin.mjs L33-52): hook `session.create.before`; si `banned` y `banExpires` pasado, desbanea; si no, `APIError FORBIDDEN` `BANNED_USER`. Las sesiones existentes no se revisan en `getSession`; dependen de que `banUser` las borre.
- **Qué borra `removeUser`:** `internalAdapter.deleteUser` (`dist/db/internal-adapter.mjs` L232-245) borra `session`, `account` y `user`; el resto cae por FK cascade. **No borra ficheros en disco** (adjuntos `storageKey`, fotos `vehicles.photo`). Patrón a reutilizar: `apps/api/src/modules/vehicles/service.ts` (leer claves → borrar filas → `storage.remove`).

## 4. Cerrar las sesiones de otro usuario sin el plugin
- Sin cookie cache ni `secondaryStorage`, `getSession` (`dist/api/routes/session.mjs` L39-48) valida cada petición contra `session`; `db.delete(session).where(eq(session.userId, id))` invalida al instante.
  - Si se activara `session.cookieCache`, la sesión cacheada seguiría válida hasta `maxAge`; `cookieCache.version` (L59-66) permite invalidarla.
- Equivalente: `(await auth.$context).internalAdapter.deleteUserSessions(userId)` (`internal-adapter.mjs` L503-521).
- Bloquear el login de un desactivado sin plugin: columna propia (`disabledAt` o `banned`) + `databaseHooks.session.create.before` en `auth.ts` que lance `APIError('FORBIDDEN')`. Defensa extra: comprobar la columna en `authenticate`/`requireAdmin`.
