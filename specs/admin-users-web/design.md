# Design — admin-users-web

Ruta nueva `/_app/admin/users` con guarda de rol en `beforeLoad`, una feature `features/admin-users/` (queries + página + fila) y dos retoques: la navegación filtra la entrada solo-admin y el login distingue el 403 de cuenta desactivada. Sin cambios en la API, `packages/shared` ni la BD: se consumen `AdminUser`, `AdminUserRoleUpdate`, `USER_ROLES` y `AdminUserLockReason` de `@ikrive/shared` tal como los dejó #37.

## Archivos

| Capa | Archivo | Cambio |
|---|---|---|
| web | `src/lib/query-keys.ts` | `adminUsers: ['admin-users'] as const`. |
| web | `src/features/admin-users/queries.ts` (nuevo) | `adminUsersQuery`, `useSetUserRole`, `useDisableUser`, `useEnableUser`, `useDeleteUser`. |
| web | `src/features/admin-users/errors.ts` (+ `.test.ts`) (nuevo) | `adminUserErrorKey(error)`. |
| web | `src/features/admin-users/users-page.tsx` (nuevo) | `AdminUsersPage`: `PageHeader`, estados carga / error, `<ul>` de `UserRow`. |
| web | `src/features/admin-users/user-row.tsx` (nuevo) | Fila: datos, selector de rol, desactivar/reactivar, `DeleteUserDialog`, textos de los locks. |
| web | `src/features/admin-users/users-page.test.tsx` (nuevo) | Tests de componente de la página. |
| web | `src/routes/_app/admin/users.tsx` (nuevo) | `beforeLoad` con la guarda; `component: AdminUsersPage`. |
| web | `src/features/navigation/nav-items.ts` (+ `nav-items.test.ts` nuevo) | Entrada `{ to: '/admin/users', icon: Users, label: 'nav.users', adminOnly: true }` antes de Ajustes y `navItemsFor(role)`. |
| web | `src/features/navigation/app-navigation.tsx` | `useQuery(meQuery)` → `navItemsFor(me?.role)` en barra lateral y menú móvil. |
| web | `src/features/navigation/app-navigation.test.tsx` | `GET /me` en los mocks por defecto (`role: 'user'`) + página `/admin/users` en el router de prueba + tests nuevos. |
| web | `src/features/auth/sign-in-error.ts` (+ `.test.ts`) (nuevo) | `signInErrorKey(error)`. |
| web | `src/routes/login.tsx` | `setError(t(signInErrorKey(error)))`. |
| web | `src/features/auth/login-page.test.tsx` (nuevo) | Login completo con `routeTree` en `/login`. Fuera de `routes/` para que el plugin del router no lo trate como ruta. |
| web | `src/features/admin-users/admin-route.test.tsx` (nuevo) | Redirección de un no admin con `routeTree`. |
| i18n | `src/i18n/locales/{es,en}.json` | `nav.users`, `auth.accountDisabled`, namespace `adminUsers`. |

## Guarda de la ruta

```ts
// routes/_app/admin/users.tsx
export const Route = createFileRoute('/_app/admin/users')({
  beforeLoad: ({ context }) => {
    if (context.me.role !== 'admin') throw redirect({ to: '/' });   // `me` lo devuelve el beforeLoad de /_app
  },
  component: AdminUsersPage,
});
```

Sin `loader`: la página usa `useQuery(adminUsersQuery)` para tener estados de carga y error propios (R5, R6) y para que los tests de la página no dependan del `routeTree` completo (ver Riesgos, #46).

## Queries y mutaciones

```ts
export const adminUsersQuery = queryOptions({
  queryKey: queryKeys.adminUsers,
  queryFn: () => api.get<AdminUser[]>('/admin/users'),
});

// Todas comparten un helper con `onSettled: invalidateQueries({ queryKey: queryKeys.adminUsers })`:
// en éxito porque un cambio altera los locks de otras filas (R8); en 409 porque la lista está desfasada (R19).
useSetUserRole()  // ({ id, role }: { id: string } & AdminUserRoleUpdate) => api.put<AdminUser>(`/admin/users/${id}/role`, { role })
useDisableUser()  // (id) => api.post<AdminUser>(`/admin/users/${id}/disable`)
useEnableUser()   // (id) => api.post<AdminUser>(`/admin/users/${id}/enable`)
useDeleteUser()   // (id) => api.delete<void>(`/admin/users/${id}`)

// errors.ts
export function adminUserErrorKey(error: unknown): 'adminUsers.errors.conflict' | 'common.error'
// ApiError con status 409 → conflict; cualquier otra cosa → common.error

// features/auth/sign-in-error.ts
export function signInErrorKey(error: { status: number }): 'auth.accountDisabled' | 'auth.invalidCredentials'
// 403 → accountDisabled; resto → invalidCredentials
```

Auto-degradación (R24, R25, R9): en `UserRow`, si la fila es `isSelf` con rol `admin` y se elige `user`, no se llama a la mutación: se abre `DemoteSelfDialog` (estado `confirmingDemote`). El `Select` es controlado con el valor del servidor (`user.role`), así que cancelar solo cierra el diálogo y el selector sigue en «Administrador» sin lógica extra. Confirmar → `setRole`; tras `setRole` con éxito sobre la fila `isSelf` hacia `user`, `await queryClient.fetchQuery({ ...meQuery, staleTime: 0 })` y `navigate({ to: '/' })`. La entrada «Usuarios» desaparece sola porque la navegación lee `meQuery`.

## Contrato HTTP consumido (de #37)

| Acción | Petición | Éxito | Errores relevantes para la web |
|---|---|---|---|
| Listar | `GET /api/admin/users` | 200 `AdminUser[]` | 401 / 403 → estado de error (R6) |
| Rol | `PUT /api/admin/users/:id/role` `{ role }` | 200 `AdminUser` | 409 `last_admin` (carrera) |
| Desactivar | `POST …/:id/disable` | 200 | 409 `self` / `last_admin` |
| Reactivar | `POST …/:id/enable` | 200 | — |
| Borrar | `DELETE …/:id` | 204 | 409 `self` / `last_admin` |
| Login | `POST /api/auth/sign-in/email` | 200 | **403** `{"message":"This account is disabled"}` (JSON de Better Auth, sin `code`); 401 `INVALID_EMAIL_OR_PASSWORD` con contraseña incorrecta (comprobado con un script contra la API real) |

`authClient.signIn.email` devuelve `{ error: { status, message } }`: `signInErrorKey` solo mira `status`.

## Impacto en UI

- **Página:** `PageHeader` con título «Usuarios» y una descripción breve. Lista de tarjetas (`<ul>`/`<li>` con borde fino, patrón de `fuel-logs-section`), no `<table>`, para que funcione igual en móvil.
- **Fila:** nombre (`font-display`) y email; `Badge variant="stamp"` con el rol traducido; `Badge` `status` («Activa») o `danger` («Desactivada»); «Alta: {fecha}» con `useFormat().date` y «{n} vehículos» (plural i18n).
- **Acciones** (se apilan bajo los datos en móvil):
  - `Select` nativo controlado (`value={user.role}`) con `aria-label="Rol de {name}"` y opciones de `USER_ROLES`; al cambiar dispara la mutación, salvo al degradarse a uno mismo.
  - **Degradarse a uno mismo:** `AlertDialog` `DemoteSelfDialog` (título «¿Quitarte el rol de administrador?», descripción: perderás el acceso de administrador al instante y solo otro admin podrá devolvértelo; «Cancelar» / «Quitarme el rol» en `variant="destructive"`). Degradar a otros usuarios y promover no piden confirmación.
  - Botón «Desactivar» (fila activa) o «Reactivar» (fila desactivada). Sin confirmación.
  - Botón destructivo «Eliminar» → `AlertDialog` (`AlertDialogTitle` «¿Eliminar a {name}?», descripción con el email y el aviso irreversible, «Cancelar» / «Eliminar» en `variant="destructive"`), como `DeleteFuelLogDialog`.
  - Mientras una mutación de la fila está en vuelo, sus controles se deshabilitan.
- **Locks (R15–R18):** cada control bloqueado lleva `disabled` y `aria-describedby` hacia un `<p id="user-{id}-lock-{reason}">` visible (texto pequeño, `text-muted-foreground`) bajo las acciones; si dos controles comparten motivo apuntan al mismo párrafo. Promover y reactivar nunca se bloquean (la API no los bloquea).
- **Feedback:** `toast.success` por acción (`adminUsers.roleChanged`, `disabled`, `enabled`, `deleted`) y `toast.error(t(adminUserErrorKey(e)))`.
- **Carga / error:** `common.loading`; error en `<p role="alert">` con `adminUsers.loadError`. No hay estado vacío: siempre existe al menos el admin.
- **Login:** el mismo `<p role="alert">` actual, con `auth.accountDisabled`.
- Modo oscuro: solo tokens existentes. Revisión visual en claro, oscuro y móvil.

### Textos nuevos (es)

`nav.users` «Usuarios» · `auth.accountDisabled` «Esta cuenta está desactivada. Contacta con el administrador de la instancia.» · `adminUsers.{title, description, loadError, roleLabel, roles.admin «Administrador», roles.user «Usuario», status.active «Activa», status.disabled «Desactivada», createdAt «Alta: {{date}}», vehicles_one/_other, disable, enable, delete, deleteTitle, deleteDescription, roleChanged, disabled, enabled, deleted, demoteSelfTitle, demoteSelfDescription, demoteSelfConfirm, locks.self, locks.last_admin, errors.conflict «Esa acción ya no está permitida; se ha actualizado la lista.»}`.

## Alternativas descartadas

- **Recalcular los locks en la web con `adminUserLocks`:** necesitaría el nº de admins activos y duplicaría la regla; la API ya devuelve `locks` (decisión de #37).
- **Explicación en tooltip sobre el botón deshabilitado:** un `button disabled` no recibe foco ni hover fiable y en móvil no hay hover; un texto visible enlazado con `aria-describedby` funciona en todos los casos y es fácil de afirmar en tests.
- **Detectar la cuenta desactivada por el `message` de Better Auth o añadir un `code` en la API:** el texto es frágil y el `code` obliga a tocar `apps/api/src/auth.ts` en una feature web; hoy el sign-in solo responde 403 por cuenta desactivada (la verificación de email no está activada).
- **Guarda en el componente (`<Navigate>`) en vez de `beforeLoad`:** pintaría la página un instante y lanzaría `GET /admin/users` (incumple R3).
- **Confirmar escribiendo el email del usuario:** más fricción de la que pide el acceptance; el `alertdialog` con botón destructivo es el patrón de borrado del resto de la app.

## Decisiones a validar (Gate 1)

1. **Ruta `/admin/users`** (espejo de la API) y entrada «Usuarios» con icono `Users` justo antes de «Ajustes».
2. **Desactivar y reactivar sin confirmación** (son reversibles); solo borrar pide confirmación.
3. **Degradarse a uno mismo pide confirmación** (`alertdialog`, pedido en Gate 1); tras confirmar se refresca `me` y se navega a `/`. Degradar a otros y promover siguen sin confirmación.
4. **403 en el sign-in = cuenta desactivada**, sin cambios en la API (ver alternativas). Si algún día se activa la verificación de email, habrá que distinguir por `code`.
5. **409 con mensaje traducido propio**, no el `detail` de la API (está en inglés), y se refresca la lista.
6. **Se muestra también el nº de vehículos** (viene en el DTO y ayuda a valorar un borrado).

## Riesgos

- **Test intermitente con `routeTree` (#46):** solo `admin-route.test.tsx` y `login-page.test.tsx` montan la app entera; los de la página usan un router en memoria mínimo como `app-navigation.test.tsx`.
- **`meQuery` en caché 5 min:** si otro admin degrada al actor, la entrada sigue visible hasta refrescar `me`; al abrir la página, `GET /admin/users` da 403 y se ve el estado de error (R6), sin acciones posibles.
- **Tests existentes de la navegación:** pasan a necesitar `GET /me` en sus mocks (una petición no declarada falla el test).

## Fuera de alcance

- Cortar los accesos por token de cuentas desactivadas (#45), crear usuarios o resetear contraseñas, búsqueda/paginación, interruptor de registro (sigue `DISABLE_SIGNUP`), cambios en la API.
