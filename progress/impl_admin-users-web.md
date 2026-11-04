# Implementación — #38 admin-users-web

Rama `feat/admin-users-web`. Tasks T1–T15 de `specs/admin-users-web/tasks.md` marcadas. Sin cambios en la API, `packages/shared` ni la BD.

## Cambios por archivo

| Archivo | Cambio |
|---|---|
| `apps/web/src/i18n/locales/{es,en}.json` | `nav.users`, `auth.accountDisabled` y namespace `adminUsers` (título, descripción, `loadError`, `roleLabel`, `roles.*`, `status.*`, `createdAt`, `vehicles_one/_other`, acciones, diálogos de borrado y de auto-degradación, toasts, `locks.self`, `locks.last_admin`, `errors.conflict`). |
| `apps/web/src/features/auth/sign-in-error.ts` (+ `.test.ts`) | `signInErrorKey(error)`: 403 → `auth.accountDisabled`; resto → `auth.invalidCredentials`. |
| `apps/web/src/routes/login.tsx` | `setError(t(signInErrorKey(error)))`. |
| `apps/web/src/features/auth/login-page.test.tsx` | Login completo con `routeTree` en `/login` (403 y 401). |
| `apps/web/src/features/navigation/nav-items.ts` (+ `nav-items.test.ts`) | Campo `adminOnly`, entrada `{ to: '/admin/users', icon: Users, label: 'nav.users', adminOnly: true }` antes de Ajustes y `navItemsFor(role)`. |
| `apps/web/src/features/navigation/app-navigation.tsx` | Hook interno `useNavItems()` (`useQuery(meQuery)` → `navItemsFor(me?.role)`), usado en la barra lateral y en el menú móvil. |
| `apps/web/src/features/navigation/app-navigation.test.tsx` | `GET /me` (`role: 'user'`) en los mocks por defecto, página `/admin/users` en el router de prueba y dos tests nuevos. |
| `apps/web/src/lib/query-keys.ts` | `adminUsers: ['admin-users']`. |
| `apps/web/src/features/admin-users/queries.ts` | `adminUsersQuery` y `useSetUserRole`/`useDisableUser`/`useEnableUser`/`useDeleteUser`, con un helper común que hace `onSettled` → `invalidateQueries(adminUsers)`. |
| `apps/web/src/features/admin-users/errors.ts` (+ `.test.ts`) | `adminUserErrorKey(error)`: `ApiError` 409 → `adminUsers.errors.conflict`; resto → `common.error`. |
| `apps/web/src/features/admin-users/user-row.tsx` | `UserRow`: datos, `Select` nativo controlado (`value={user.role}`), Desactivar/Reactivar, `DeleteUserDialog`, `DemoteSelfDialog`, párrafos de motivo `user-{id}-lock-{reason}` enlazados con `aria-describedby` (uno por motivo distinto), controles deshabilitados mientras hay una mutación en vuelo, toasts y auto-degradación (`fetchQuery({ ...meQuery, staleTime: 0 })` + `navigate({ to: '/' })`). |
| `apps/web/src/features/admin-users/users-page.tsx` | `AdminUsersPage`: `PageHeader`, «Cargando…», error con `role="alert"`, `<ul>` de `UserRow`. |
| `apps/web/src/routes/_app/admin/users.tsx` | `beforeLoad`: `context.me.role !== 'admin'` → `redirect({ to: '/' })`; `component: AdminUsersPage`. |
| `apps/web/src/routeTree.gen.ts` | Regenerado por el plugin del router (ruta nueva). |
| `apps/web/src/features/admin-users/admin-route.test.tsx` | Redirección de un no admin con `routeTree`. |
| `apps/web/src/features/admin-users/users-page.test.tsx` | 15 tests de componente de la página (router en memoria mínimo `/admin/users` + `/`). |

## Trazabilidad

| R | Test(s) |
|---|---|
| R1 | `navigation/nav-items.test.ts › includes the users entry only for admins`; `navigation/app-navigation.test.tsx › shows the users entry to an admin in the sidebar and the menu` |
| R2 | `navigation/nav-items.test.ts › includes the users entry only for admins`; `navigation/app-navigation.test.tsx › hides the users entry from a regular user` |
| R3 | `admin-users/admin-route.test.tsx › redirects a regular user to the dashboard` (comprobado que falla si se quita la guarda) |
| R4 | `admin-users/users-page.test.tsx › lists the users with role, status, sign-up date and vehicles` |
| R5 | `users-page.test.tsx › shows the loading text and then the users` |
| R6 | `users-page.test.tsx › shows an error when the list fails` |
| R7 | `users-page.test.tsx › changes a user's role`, `› refreshes the session and leaves after demoting yourself`, `› demotes another admin without confirmation` |
| R8 | `users-page.test.tsx › changes a user's role`, `› disables an active user`, `› re-enables a disabled user`, `› deletes a user after confirming` (segunda `GET /admin/users`) |
| R9 | `users-page.test.tsx › refreshes the session and leaves after demoting yourself` |
| R10 | `users-page.test.tsx › disables an active user` |
| R11 | `users-page.test.tsx › re-enables a disabled user` |
| R12 | `users-page.test.tsx › asks for confirmation before deleting and sends nothing when cancelled` |
| R13 | `users-page.test.tsx › deletes a user after confirming` |
| R14 | `users-page.test.tsx › asks for confirmation before deleting and sends nothing when cancelled` |
| R15 | `users-page.test.tsx › disables demoting the last admin` |
| R16 | `users-page.test.tsx › disables the actions locked for yourself` |
| R17 | `users-page.test.tsx › disables the actions locked for yourself` |
| R18 | `users-page.test.tsx › disables the actions locked for yourself` (texto `self`), `› disables demoting the last admin` (texto `last_admin`) |
| R19 | `admin-users/errors.test.ts › maps a 409 to the conflict message and the rest to the generic error`; `users-page.test.tsx › shows a conflict and refreshes the list when an action returns 409` |
| R20 | `errors.test.ts › maps a 409 …`; `users-page.test.tsx › shows the generic error when an action fails` |
| R21 | `auth/sign-in-error.test.ts › maps a 403 to the disabled account message and the rest to invalid credentials`; `auth/login-page.test.tsx › shows a disabled account message when sign-in returns 403` |
| R22 | `auth/sign-in-error.test.ts › maps a 403 …`; `auth/login-page.test.tsx › shows invalid credentials when sign-in returns 401` |
| R23 | `i18n/locales.test.ts › es and en define the same keys` |
| R24 | `users-page.test.tsx › asks for confirmation before demoting yourself and keeps the role when cancelled`, `› refreshes the session and leaves after demoting yourself` |
| R25 | `users-page.test.tsx › asks for confirmation before demoting yourself and keeps the role when cancelled` |

## Revisión visual (T14)

SPA construida (`vite build --outDir <scratchpad>/web-dist`) y servida por la API en el puerto 3123 (`WEB_DIST_DIR`, `DATA_DIR` en el scratchpad). El 3000 y el 5173 los usan otros procesos. Datos reales: Ana (primera cuenta, admin, último admin → selector bloqueado por `last_admin` y Desactivar/Eliminar por `self`), Bruno (usuario con 1 vehículo) y Carla (desactivada con `POST /admin/users/:id/disable`). Con curl se comprobó que `POST /api/auth/sign-in/email` de Carla responde `403 {"message":"This account is disabled"}`. Capturas con playwright-core contra `/usr/bin/google-chrome` (fuera del repo):

- `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/310d2b57-e5ec-4fd1-98ec-e06d0839b7e1/scratchpad/shots/users-light.png`
- `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/310d2b57-e5ec-4fd1-98ec-e06d0839b7e1/scratchpad/shots/users-dark.png`
- `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/310d2b57-e5ec-4fd1-98ec-e06d0839b7e1/scratchpad/shots/users-mobile.png`
- `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/310d2b57-e5ec-4fd1-98ec-e06d0839b7e1/scratchpad/shots/delete-dialog-light.png`
- `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/310d2b57-e5ec-4fd1-98ec-e06d0839b7e1/scratchpad/shots/delete-dialog-dark.png`
- `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/310d2b57-e5ec-4fd1-98ec-e06d0839b7e1/scratchpad/shots/delete-dialog-mobile.png`
- `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/310d2b57-e5ec-4fd1-98ec-e06d0839b7e1/scratchpad/shots/login-disabled-light.png`
- `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/310d2b57-e5ec-4fd1-98ec-e06d0839b7e1/scratchpad/shots/login-disabled-dark.png`
- `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/310d2b57-e5ec-4fd1-98ec-e06d0839b7e1/scratchpad/shots/login-disabled-mobile.png`
- `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/310d2b57-e5ec-4fd1-98ec-e06d0839b7e1/scratchpad/shots/menu-mobile.png` (entrada «Usuarios» activa en el menú móvil)

Observación: en móvil (390 px) el botón «Eliminar» baja a una segunda línea bajo el selector y «Desactivar», porque el `<select>` toma el ancho de «Administrador». Se ve ordenado y encaja con «las acciones se apilan bajo los datos en móvil».

## `pnpm harness --full`

Tres ejecuciones seguidas al final, todas en verde:

```
[OK]    46 features: 37 done, 8 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #38 admin-users-web (in_progress)
[OK]    Rama actual: feat/admin-users-web
[OK]    pnpm lint
[OK]    pnpm typecheck
packages/shared  Tests 117 passed (117)
apps/web         Tests 322 passed (322)
apps/api         Tests 293 passed (293)
[OK]    pnpm test
[OK]    Arnés en verde.
```

### Intermitencia observada (#46)

En ejecuciones anteriores de `pnpm -r test` / `pnpm harness --full` fallaron de forma intermitente los tests que montan el `routeTree` completo: `settings-page.test.tsx › saves the reminder hour`, `use-user-locale.test.tsx › shows the authenticated app…` (ya existían) y, en una primera versión, el nuevo `admin-route.test.tsx`. El patrón es el de #46: un `findBy*` agota su timeout de 1 s mientras se carga el chunk perezoso de la ruta (`autoCodeSplitting`). La frecuencia dependía de la carga de la máquina: llegó a 3 fallos en 4 ejecuciones y después hubo 0 en 6 y 0 en 3. Excluir cualquiera de los ficheros nuevos no cambió el resultado de forma clara.

- Para `admin-route.test.tsx` se quitó la espera al render del dashboard, que R3 no pide. Ahora espera a `router.state.location.pathname === '/'` y a la petición del loader del dashboard, y afirma que no hubo ninguna petición a `/api/admin/`. Sigue fallando si se quita la guarda. Desde ese cambio no ha vuelto a fallar.
- Los dos tests que ya existían no se han tocado porque son el alcance de #46.

## Desviaciones del spec

1. **`login-page.test.tsx` importa `@/lib/auth-client` de forma estática.** Con `autoCodeSplitting` el componente del login se carga de forma perezosa durante el primer test. Entonces `createAuthClient` (que guarda `fetch` en `customFetchImpl` al importarse) se quedaba con el `mockApi` de ese test, y el segundo test recibía la respuesta del primero (comprobado con trazas). Importarlo al principio del fichero hace que vea el `fetch` diferido de `src/test/setup.ts`, como pretende ese setup. El cambio solo afecta al test y está explicado en un comentario. El problema de fondo, módulos code-split que importan `authClient` después del setup, podría afectar a otros tests futuros con `routeTree` que llamen a `authClient` en varios tests del mismo fichero. Se podría resolver de forma general importando `auth-client` en `src/test/setup.ts`, pero eso queda fuera del alcance de `design.md`.
2. **`nav-items.ts`**: todas las entradas llevan `adminOnly` explícito (`false`/`true`) para que el tipo `as const` sea homogéneo y `navItemsFor` filtre sin casts. No cambia ningún comportamiento.
3. **Ancho del selector de rol**: `min-w-32 sm:min-w-40`, un ajuste de maquetación hecho tras la revisión visual.
