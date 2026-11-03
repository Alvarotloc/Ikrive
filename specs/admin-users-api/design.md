# Design — admin-users-api

Módulo nuevo `admin-users` con endpoints propios bajo `/api/admin/users`, protegido por el `requireAdmin` existente. Una columna nueva `user.disabled_at` y un hook de Better Auth que impide crear sesión a un desactivado. Las reglas «último admin / uno mismo» viven en una función pura de `packages/shared` que la API usa para validar y para devolver `locks` a la web (#38).

## Plugin `admin` de Better Auth vs endpoints propios

| Criterio | Plugin `admin` (1.7.7) | Endpoints propios |
|---|---|---|
| Rol | Ya tenemos `role` en `additionalFields`; el plugin lo fusiona, pero `setRole` acepta cualquier string (incluso `"admin,user"`) salvo que se configure `roles` | `z.enum(USER_ROLES)` |
| Último admin / uno mismo | Solo `YOU_CANNOT_BAN/REMOVE_YOURSELF`; **nada del último admin** → hooks `before` sobre `/admin/*` propios igualmente | Una función pura compartida con la web |
| Listado | `list-users` sin nº de vehículos → endpoint propio igualmente | Una consulta `leftJoin` + `groupBy` |
| Borrado | `removeUser` no borra ficheros en disco → endpoint propio igualmente | Patrón de `vehicles/service.ts` |
| Errores | `APIError` con JSON de Better Auth, no `problem+json`; la web tendría dos formatos | `AppError` → RFC 7807 como el resto |
| Superficie | Añade `impersonate-user`, `create-user`, `set-user-password`, `list-user-sessions`… bajo `/api/auth/admin/*` que no queremos exponer (habría que bloquearlos) | Solo lo que pide el acceptance |
| BD | 4 columnas (`banned`, `ban_reason`, `ban_expires`, `session.impersonated_by`) | 1 columna (`disabled_at`) |
| Bloqueo de login | Incluido (`session.create.before`) | El mismo hook, ~6 líneas en `auth.ts` |

**Elección: endpoints propios.** De los cuatro requisitos del acceptance, el plugin solo resuelve bien uno (desactivar + cerrar sesiones), y para los otros tres (listado con vehículos, borrado con ficheros, último admin) habría que escribir código propio igualmente, con dos formatos de error y endpoints extra expuestos. Lo único que aporta (el hook de login) se replica en pocas líneas.

## Archivos

| Capa | Archivo | Cambio |
|---|---|---|
| shared | `packages/shared/src/enums.ts` | `USER_STATUSES = ['active', 'disabled']`, `ADMIN_USER_LOCK_REASONS = ['self', 'last_admin']` + tipos. |
| shared | `packages/shared/src/domain/admin-users.ts` (+ `.test.ts`) | `adminUserLocks`. |
| shared | `packages/shared/src/schemas/admin.ts` (+ `admin.test.ts` nuevo) | `adminUserSchema`, `adminUserLocksSchema`, `adminUserRoleUpdateSchema`. |
| shared | `packages/shared/src/index.ts` | Re-exportar `domain/admin-users`. |
| api | `apps/api/src/db/schema/auth.ts` | `user.disabledAt: integer({ mode: 'timestamp_ms' })` nullable. |
| api | `apps/api/src/db/migrations/0011_*.sql` | `pnpm db:generate` (`ALTER TABLE user ADD disabled_at integer`). |
| api | `apps/api/src/auth.ts` | `databaseHooks.session.create.before`: si el usuario tiene `disabledAt` → `APIError('FORBIDDEN', { message: 'This account is disabled' })`. |
| api | `apps/api/src/modules/admin-users/{repository,service,routes}.ts` (nuevos) | Módulo. |
| api | `apps/api/src/app.ts` | `createAdminUsersService({ repo: createAdminUsersRepository(db), storage, log: app.log })` y registrar `adminUsersRoutes` bajo `/api`. |
| test | `apps/api/test/admin-users.test.ts` (nuevo) | Integración. |

`disabledAt` **no** se añade a `additionalFields`: Better Auth no lo lee ni lo escribe (y `update-user` no puede tocarlo); solo lo usan el hook y el módulo.

## Esquemas y dominio (`packages/shared`)

```ts
// enums.ts
export const USER_STATUSES = ['active', 'disabled'] as const;
export const ADMIN_USER_LOCK_REASONS = ['self', 'last_admin'] as const;

// schemas/admin.ts
const lock = z.enum(ADMIN_USER_LOCK_REASONS).nullable();
export const adminUserLocksSchema = z.object({ demote: lock, disable: lock, delete: lock });
export const adminUserSchema = z.object({
  id: z.string(), name: z.string(), email: z.string(),
  role: z.enum(USER_ROLES), status: z.enum(USER_STATUSES),
  disabledAt: z.string().nullable(), createdAt: z.string(),   // ISO
  vehicleCount: z.number().int().min(0),
  isSelf: z.boolean(),
  locks: adminUserLocksSchema,
});
export const adminUserRoleUpdateSchema = z.object({ role: z.enum(USER_ROLES) });
// tipos: AdminUser, AdminUserLocks, AdminUserRoleUpdate, UserStatus, AdminUserLockReason

// domain/admin-users.ts
export function adminUserLocks(
  target: { id: string; role: UserRole; disabled: boolean },
  ctx: { actorId: string; activeAdminCount: number },
): AdminUserLocks
```

Reglas de `adminUserLocks` (`lastAdmin = role === 'admin' && !disabled && activeAdminCount <= 1`):

| Lock | Valor |
|---|---|
| `demote` | `null` si `role !== 'admin'`; `'last_admin'` si `lastAdmin`; si no `null` (degradarse a uno mismo se permite si hay otro admin activo) |
| `disable` / `delete` | `'self'` si `target.id === actorId`; `'last_admin'` si `lastAdmin`; si no `null` |

Promover y reactivar nunca se bloquean. Como el actor siempre es un admin activo, en `disable`/`delete` el caso `last_admin` solo se alcanza con un actor distinto que no cuente (R15 se prueba llamando al servicio directamente, ver Tests).

## Repositorio y servicio

```ts
// repository.ts — createAdminUsersRepository(db)
list(): AdminUserRow[]                    // user + count(vehicles.id), leftJoin, groupBy user.id, orderBy createdAt asc
find(id: string): AdminUserRow | undefined
countActiveAdmins(): number               // role = 'admin' AND disabled_at IS NULL
setRole(id: string, role: UserRole): void
disable(id: string, now: Date): void      // transacción: update disabled_at + delete session where user_id
enable(id: string): void
fileKeys(id: string): string[]            // vehicles.photo not null + attachments.storage_key por owner_id
delete(id: string): void                  // delete user; la cascada FK hace el resto

// service.ts — createAdminUsersService({ repo, storage, log })
list(actorId): AdminUser[]
setRole(actorId, id, role): AdminUser
disable(actorId, id, now = new Date()): AdminUser
enable(actorId, id): AdminUser
remove(actorId, id): Promise<void>
```

- Cada mutación: `find` → `NotFoundError('User not found')`; calcula `adminUserLocks` con `countActiveAdmins()`; si el lock correspondiente no es `null` → `ConflictError(detail)`; luego escribe y devuelve `toDto(find(id))`. better-sqlite3 es síncrono, así que comprobar y escribir no se intercalan con otra petición.
- `setRole` solo comprueba `demote` cuando pasa de `admin` a `user`; mismo rol → 200 sin escribir.
- `disable` sobre un desactivado / `enable` sobre un activo → 200 sin escribir (R10).
- `remove`: `keys = repo.fileKeys(id)` → `repo.delete(id)` → `storage.remove(key).catch(err => log.error({ err, key }, 'admin: could not remove a user file'))` por clave (mismo orden que `vehicles/service.ts` y misma compensación que `data-import`). Fichero huérfano aceptable; fila sin fichero no.
- Details de 409 fijos: `self` → `'You cannot disable or delete your own account'`; `last_admin` → `'The instance must keep at least one active admin'`.

## Contrato HTTP

Plugin `adminUsersRoutes` con `app.addHook('preHandler', app.requireAdmin)` (401/403 antes de validar params o cuerpo).

| Método y ruta | Cuerpo | Éxito | Errores |
|---|---|---|---|
| `GET /api/admin/users` | — | 200 `AdminUser[]` | 401 · 403 |
| `PUT /api/admin/users/:id/role` | `AdminUserRoleUpdate` | 200 `AdminUser` | 400 · 401 · 403 · 404 · 409 (`last_admin`) |
| `POST /api/admin/users/:id/disable` | — | 200 `AdminUser` | 401 · 403 · 404 · 409 (`self`, `last_admin`) |
| `POST /api/admin/users/:id/enable` | — | 200 `AdminUser` | 401 · 403 · 404 |
| `DELETE /api/admin/users/:id` | — | 204 | 401 · 403 · 404 · 409 (`self`, `last_admin`) |

Login de un desactivado (`POST /api/auth/sign-in/email` con contraseña correcta): 403 con el JSON de Better Auth (`{ code, message }`), no `problem+json`, porque lo responde Better Auth. Con contraseña incorrecta sigue siendo 401 (no revela el estado).

## Cómo lo usa la web (#38)

- Tipos y esquemas de `@ikrive/shared`: `AdminUser`, `AdminUserRoleUpdate`, `ADMIN_USER_LOCK_REASONS`, `USER_STATUSES`.
- **Acciones no permitidas:** la web no recalcula nada; lee `user.locks`. `locks.demote` solo aplica a admins; `locks.disable`/`locks.delete` con `'self'` o `'last_admin'` → botón deshabilitado con el texto i18n de esa razón. Promover y reactivar siempre habilitados.
- **Tras cualquier mutación** se invalida la query del listado entera: un cambio en un usuario altera los `locks` de otros (p. ej. promover a alguien libera al último admin). El 200 con el usuario actualizado sirve para un update optimista, no como fuente única.
- **409** solo debería verse en carreras (dos pestañas); se muestra el `detail` en un toast, como el resto de errores de la API.
- Si el actor se degrada a sí mismo, su siguiente petición a `/api/admin/*` da 403 y `/api/me` devuelve `role: 'user'`: la web debe refrescar `me` tras cambiar su propio rol.

## Tests (`apps/api/test/admin-users.test.ts`)

`setup()` = `createTestApp()` + `signUp` del admin (primera cuenta) y de otro usuario; helpers `expectProblem` (copiado de `admin-jobs.test.ts`) y `signIn(email)` contra `/api/auth/sign-in/email`. Ficheros: foto de vehículo y adjunto subidos por la API; existencia con `existsSync(join(dataDir, 'uploads', key))` como `vehicles.test.ts`. R13: se sustituye el fichero de la foto por un directorio (`rm` con `force` sin `recursive` falla) y se pasa un `logStream`. R15: se construye `createAdminUsersService({ repo: createAdminUsersRepository(db), storage, log })` sobre la `db` del test y se llama a `disable`/`remove` con un `actorId` inexistente contra el único admin → `ConflictError`.

## Impacto en UI

Ninguno (#38).

## Alternativas descartadas

- **Plugin `admin` de Better Auth:** ver tabla de arriba.
- **Un único `PATCH /api/admin/users/:id` con `{ role?, disabled? }`:** mezcla acciones con efectos distintos (cerrar sesiones) y protecciones distintas en un cuerpo; con rutas por acción cada una tiene un error y una mutación en la web.
- **Que la web calcule los locks:** necesitaría el nº de admins activos y duplicaría la regla; con `locks` en la respuesta la API es la única fuente (la función compartida sigue disponible si #38 la necesita).
- **Comprobar `disabledAt` en `authenticate` además de borrar sesiones:** sin `cookieCache`, borrar las sesiones invalida al instante; la comprobación extra añadiría una consulta por petición. Si algún día se activa `cookieCache`, habrá que revisarlo (Riesgos).
- **Borrado lógico del usuario:** el acceptance pide borrar con todos sus datos y adjuntos.

## Decisiones a validar (Gate 1)

1. **409 Conflict** (no 403) para «último admin» y «uno mismo»: el actor sí tiene permiso; es el estado de la instancia el que lo impide (igual que los conflictos de odómetro).
2. **Último admin = último admin activo:** los admins desactivados no cuentan. Se puede degradar o borrar a un admin desactivado.
3. **Un admin puede degradarse a sí mismo** si queda otro admin activo (el acceptance solo prohíbe desactivarse o borrarse).
4. **Cambiar el rol no cierra sesiones:** el rol se lee de BD en cada petición.
5. **Sin paginación ni búsqueda** en el listado: instancia self-hosted con pocas cuentas.
6. **Idempotencia:** desactivar un desactivado / reactivar un activo / poner el mismo rol → 200 sin cambios.
7. **Login de un desactivado → 403** con el formato de Better Auth; un mensaje específico en la pantalla de login queda fuera de #37 y #38.

## Riesgos

- **`cookieCache`:** si se activa en el futuro, un desactivado seguiría dentro hasta `maxAge`; habría que comprobar `disabledAt` en `authenticate` o subir `cookieCache.version`.
- **Borrado grande:** la cascada de un usuario con muchos datos corre en una sola sentencia síncrona; aceptable a esta escala.
- **Ficheros huérfanos** si falla `storage.remove` (se registran en el log).

## Fuera de alcance

- UI (#38), mensaje de «cuenta desactivada» en el login, crear usuarios o resetear contraseñas desde el admin, suplantación, interruptor de registro en la UI (sigue `DISABLE_SIGNUP`), auditoría de acciones de admin.
