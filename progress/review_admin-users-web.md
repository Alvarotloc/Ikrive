# Review — #38 admin-users-web

**Veredicto:** APPROVED

## Trazabilidad requirements ↔ tests
- R1: [x] `apps/web/src/features/navigation/nav-items.test.ts` › `includes the users entry only for admins` (orden exacto con `/admin/users` antes de `/settings`); `app-navigation.test.tsx` › `shows the users entry to an admin in the sidebar and the menu` (enlace `href="/admin/users"` justo antes de «Ajustes» en la barra lateral, en el menú móvil y navegación a la página)
- R2: [x] `nav-items.test.ts` (rol `user` y `undefined` sin la entrada); `app-navigation.test.tsx` › `hides the users entry from a regular user` (espera a que `me` esté en caché antes de afirmar la ausencia, en barra lateral y menú)
- R3: [x] `apps/web/src/features/admin-users/admin-route.test.tsx` › `redirects a regular user to the dashboard` (`pathname === '/'`, 0 llamadas a `/api/admin/` y `GET /admin/users` sin mock)
- R4: [x] `users-page.test.tsx` › `lists the users with role, status, sign-up date and vehicles` (orden de filas, nombre, email, rol, estado, fecha y plural de vehículos)
- R5: [x] `› shows the loading text and then the users` (respuesta retenida → «Cargando…» sin filas)
- R6: [x] `› shows an error when the list fails` (`role="alert"` con el texto y 0 `listitem`)
- R7: [x] `› changes a user's role` (cuerpo `{ role: 'admin' }` + toast), `› demotes another admin without confirmation`, `› refreshes the session and leaves after demoting yourself`
- R8: [x] `› changes a user's role`, `› disables an active user`, `› re-enables a disabled user`, `› deletes a user after confirming` (segunda `GET /admin/users`)
- R9: [x] `› refreshes the session and leaves after demoting yourself` (`GET /me` pedido, caché `me` con rol `user`, `pathname === '/'`)
- R10: [x] `› disables an active user` (POST enviado + toast «Cuenta desactivada»)
- R11: [x] `› re-enables a disabled user` (POST enviado + toast «Cuenta reactivada»)
- R12: [x] `› asks for confirmation before deleting and sends nothing when cancelled` (`alertdialog` con nombre en el título, email, aviso de vehículos/mantenimientos/repostajes/adjuntos e irreversible; 0 `DELETE`)
- R13: [x] `› deletes a user after confirming` (1 `DELETE` + toast)
- R14: [x] `› asks for confirmation before deleting and sends nothing when cancelled` (tras «Cancelar», 0 `DELETE`)
- R15: [x] `› disables demoting the last admin` (selector `disabled` + `toHaveAccessibleDescription` del texto `last_admin`)
- R16: [x] `› disables the actions locked for yourself` (Desactivar `disabled` + descripción accesible `self`)
- R17: [x] `› disables the actions locked for yourself` (Eliminar `disabled` + descripción accesible `self`)
- R18: [x] mismos dos tests con textos distintos para `self` y `last_admin`
- R19: [x] `errors.test.ts` › `maps a 409 …`; `users-page.test.tsx` › `shows a conflict and refreshes the list when an action returns 409` (toast traducido + segunda `GET`)
- R20: [x] `errors.test.ts` (500, 403, `TypeError` → `common.error`); `› shows the generic error when an action fails` (toast «Algo ha ido mal»)
- R21: [x] `sign-in-error.test.ts`; `login-page.test.tsx` › `shows a disabled account message when sign-in returns 403` (`role="alert"` con el texto y sin el genérico)
- R22: [x] `sign-in-error.test.ts` (401, 500); `login-page.test.tsx` › `shows invalid credentials when sign-in returns 401`
- R23: [x] `apps/web/src/i18n/locales.test.ts` › `es and en define the same keys` (verificado además a ojo: mismas claves nuevas en ambos)
- R24: [x] `› asks for confirmation before demoting yourself and keeps the role when cancelled` (`alertdialog` con ambos avisos, 0 `PUT`); `› refreshes the session and leaves after demoting yourself` (confirmar → `PUT { role: 'user' }`)
- R25: [x] `› asks for confirmation before demoting yourself and keeps the role when cancelled` (diálogo cerrado, 0 `PUT`, selector con valor `admin`)

## Tasks
- T1..T15: [x]

## Checkpoints
- C1: [x] `pnpm harness` en verde; una sola feature activa (#38 `in_progress`); rama `feat/admin-users-web`.
- C2: [x] Spec completo, EARS, tabla acceptance → R cubre los 7 criterios; tasks todas `[x]`; cada R con test leído.
- C3: [x] El diff solo toca los archivos de la tabla de `design.md` (+ `routeTree.gen.ts` regenerado, `progress/`). Desviaciones menores documentadas (import estático de `auth-client` en el test, `adminOnly: false` explícito, ancho del selector).
- C4: [x] Sin cambios de API/BD (no aplica). Web: código en `features/admin-users/`, `adminUsersQuery` con `queryOptions`, textos en es/en, `PageHeader`, `Badge` (`stamp`, `status`, `danger`), `AlertDialog` como el resto de la app.
- C5: [x] Sin `any`, `@ts-ignore`, `console.log` ni TODOs; fecha de alta con `format.date` (corta a `YYYY-MM-DD` en UTC). Ficheros: no aplica.
- C6: [x] `pnpm harness --full` en verde en mi ejecución (shared 117, web 322, api 293). Tests con resultados concretos y solo `mockApi`. Capturas claro/oscuro/móvil referenciadas (revisadas `users-dark.png` y `users-mobile.png`: locks visibles, estados y diálogo correctos).
- C7: [x] `progress/impl_admin-users-web.md` con archivos, mapa R → test y verificación; `progress/current.md` al día; `docs/PLAN.md` no necesita cambios (la fase 7 sigue abierta).

## Hallazgos
Ninguno bloqueante. Lógica revisada:
- Guarda `beforeLoad` en `routes/_app/admin/users.tsx:6` usa `context.me` del `beforeLoad` de `/_app`: el no admin no llega a montar la página ni a pedir el listado (R3).
- `user-row.tsx:73-77`: el `Select` controlado con `user.role` hace que cancelar el diálogo de auto-degradación no requiera revertir estado (R25); la confirmación solo salta en `isSelf && admin → user` (R7 para el resto).
- `queries.ts:19`: `onSettled` invalida en éxito y error (R8, R19).
- `user-row.tsx:45`: el lock de `disable` se ignora en filas desactivadas, coherente con «reactivar nunca se bloquea».

## Flakiness y tests con `routeTree` (pregunta del leader)
- **Siguen el criterio de Riesgos del design:** solo `admin-route.test.tsx` y `login-page.test.tsx` montan el `routeTree`; los 15 tests de la página usan un router en memoria mínimo, como pide el design.
- **No agravan el flaky de forma medible.** Mediciones mías:
  - 5 × `pnpm -r test` completo: 4 verdes, 1 fallo en `use-user-locale.test.tsx › shows the authenticated app…` (preexistente, alcance de #46). Ningún fallo en los tests nuevos.
  - 6 × suite web **excluyendo** `admin-route.test.tsx` y `login-page.test.tsx`, con la suite de la API en paralelo como carga: 1 fallo en `settings-page.test.tsx › saves the reminder hour`. El flaky aparece igual sin los tests nuevos.
- `admin-route.test.tsx` está bien endurecido: no espera al render del chunk perezoso del dashboard, sino a `router.state.location` y a la petición del loader (`waitFor`, no `findBy*` de 1 s).
- `login-page.test.tsx` sí usa `findByLabelText('Email')` tras cargar el chunk perezoso de `/login`, que es el patrón de #46 (`findBy*` con timeout de 1 s). No ha fallado en ninguna de mis ejecuciones, pero conviene incluirlo en el arreglo de #46 (ver Avisos).

## Avisos para el humano (no bloquean)
- `apps/web/src/features/auth/login-page.test.tsx:26` — el `findByLabelText('Email')` espera la carga del chunk perezoso con el timeout por defecto: añádelo a la lista de #46 cuando se arregle de forma general.
- `apps/web/src/features/auth/login-page.test.tsx:8` — el `import '@/lib/auth-client'` estático soluciona en el test un problema general: un módulo code-split que importa `authClient` después del setup se queda con el `fetch` del primer test. Lo más robusto sería importarlo en `src/test/setup.ts`; encaja en #46 o en una feature `sdd: false`.
- Las capturas de T14 están en el scratchpad de la sesión (fuera del repo) y se borrarán al terminar; si quieres conservarlas, cópialas antes del merge.
- `meQuery` en caché 5 min (Riesgos del design): si otro admin degrada al actor, la entrada «Usuarios» se sigue viendo hasta refrescar; la página muestra el error de R6. Es el comportamiento aceptado en el spec.

## Cambios requeridos
Ninguno.
