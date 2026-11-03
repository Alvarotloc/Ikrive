# Requirements — admin-users-api

> Feature 37 (fase 7). Endpoints solo para admin bajo `/api/admin/users` para gestionar las cuentas de la instancia. Endpoints propios (no el plugin `admin` de Better Auth; justificación en `design.md`). El registro sigue gobernado por `DISABLE_SIGNUP`. La consume #38 `admin-users-web`.
> **Admin activo** = usuario con `role: 'admin'` y sin `disabledAt`. **Último admin** = el único admin activo de la instancia. **Actor** = el admin de la sesión. **Usuario** (DTO) = `AdminUser` de `packages/shared` (ver `design.md`). Todos los errores son `application/problem+json`.

## Listado

## R1
CUANDO un admin hace `GET /api/admin/users`, el sistema DEBE responder 200 con todos los usuarios de la instancia ordenados por fecha de alta ascendente, cada uno con `id`, `name`, `email`, `role`, `status` (`active` | `disabled`), `disabledAt`, `createdAt` y `vehicleCount`.

## R2
El sistema DEBE calcular `vehicleCount` como el número de vehículos del usuario, incluidos archivados y vendidos, y `0` si no tiene ninguno.

## R3
El sistema DEBE incluir en cada usuario `isSelf` (es el actor) y `locks: { demote, disable, delete }`, donde cada valor es `'self'`, `'last_admin'` o `null` según `adminUserLocks` (R14–R18), para que la web deshabilite las acciones no permitidas.

## Rol

## R4
CUANDO un admin hace `PUT /api/admin/users/:id/role` con `{ role }` válido, el sistema DEBE guardar el rol y responder 200 con el usuario actualizado.

## R5
CUANDO cambia el rol de un usuario, el sistema DEBE aplicar el rol nuevo desde la siguiente petición de ese usuario sin cerrar sus sesiones (un admin degradado recibe 403 en `/api/admin/*`; un usuario promovido accede).

## Desactivar y reactivar

## R6
CUANDO un admin hace `POST /api/admin/users/:id/disable`, el sistema DEBE guardar `disabledAt` con la hora actual y responder 200 con el usuario en `status: 'disabled'`.

## R7
CUANDO se desactiva un usuario, el sistema DEBE borrar todas sus sesiones en la misma transacción, de modo que sus cookies respondan 401.

## R8
MIENTRAS un usuario está desactivado, el sistema DEBE rechazar su inicio de sesión con 403 sin crear sesión.

## R9
CUANDO un admin hace `POST /api/admin/users/:id/enable`, el sistema DEBE poner `disabledAt` a `null` y responder 200 con el usuario en `status: 'active'`, que vuelve a poder iniciar sesión.

## R10
SI se desactiva un usuario ya desactivado o se reactiva uno activo ENTONCES el sistema DEBE responder 200 sin modificarlo (conserva el `disabledAt` original).

## Borrar

## R11
CUANDO un admin hace `DELETE /api/admin/users/:id`, el sistema DEBE borrar el usuario y, en cascada, todas sus filas (sesiones, cuenta, ajustes, vehículos y sus datos, adjuntos, notificaciones, canales, feed y enlaces de informe) y responder 204.

## R12
CUANDO se borra un usuario, el sistema DEBE eliminar del disco las fotos de sus vehículos y los ficheros de sus adjuntos después de borrar las filas.

## R13
SI falla la eliminación de algún fichero tras borrar las filas ENTONCES el sistema DEBE registrar el error en el log y responder igualmente 204.

## Protecciones

## R14
SI la petición quitaría el rol `admin` al último admin ENTONCES el sistema DEBE responder 409 sin cambiar nada.

## R15
SI la petición desactivaría o borraría al último admin ENTONCES el sistema DEBE responder 409 sin cambiar nada.

## R16
SI el actor intenta desactivarse o borrarse a sí mismo ENTONCES el sistema DEBE responder 409 sin cambiar nada.

## R17
El sistema DEBE exponer en `packages/shared` la función pura `adminUserLocks(target, { actorId, activeAdminCount })`, usada tanto para `locks` (R3) como para las comprobaciones de R14–R16, con precedencia `self` sobre `last_admin` en `disable` y `delete`.

## R18
El sistema DEBE excluir a los admins desactivados del recuento de admins activos, de modo que nunca bloquean ni cuentan como «otro admin».

## Errores y autorización

## R19
SI `:id` no corresponde a ningún usuario ENTONCES el sistema DEBE responder 404 en `PUT …/role`, `POST …/disable`, `POST …/enable` y `DELETE`.

## R20
SI el cuerpo de `PUT …/role` no tiene un `role` de `USER_ROLES` ENTONCES el sistema DEBE responder 400 sin cambiar nada.

## R21
SI la petición a cualquier ruta de `/api/admin/users` no tiene sesión ENTONCES el sistema DEBE responder 401.

## R22
SI el usuario de la sesión no es admin ENTONCES el sistema DEBE responder 403 en cualquier ruta de `/api/admin/users` sin cambiar nada.

## Acceptance → requirements

| Criterio de `feature_list.json` | Requirements |
|---|---|
| El admin puede listar los usuarios (nombre, email, rol, estado, fecha de alta y nº de vehículos) | R1, R2, R3 |
| El admin puede cambiar el rol, desactivarlo (no puede iniciar sesión y se cierran sus sesiones), reactivarlo y borrarlo con todos sus datos y adjuntos | R4, R5, R6, R7, R8, R9, R10, R11, R12, R13, R19, R20 |
| No se puede quitar el rol, desactivar ni borrar al último admin, ni el admin puede desactivarse o borrarse a sí mismo | R14, R15, R16, R17, R18 |
| Los no admin reciben 403 en todas estas rutas | R22 (y R21 sin sesión) |
| Tests de integración cubren cada acción, la protección del último admin y el 403 | R1–R22 (tests en `tasks.md`) |
| pnpm harness --full pasa en verde | última task de `tasks.md` |
