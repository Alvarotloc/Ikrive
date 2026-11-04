# Requirements — admin-users-web

> Feature 38 (fase 7). Pantalla web `/admin/users` para que el admin gestione las cuentas sobre la API de #37 (`/api/admin/users`, contrato en `specs/admin-users-api/design.md`). La web no recalcula reglas: lee `isSelf` y `locks` de cada `AdminUser`.
> **Admin** = usuario de la sesión (`GET /api/me`) con `role: 'admin'`. **Fila** = un usuario del listado. **Motivo** = valor no nulo de un lock (`'self'` o `'last_admin'`).

## Navegación y acceso

## R1
MIENTRAS el usuario de la sesión es admin, el sistema DEBE mostrar una entrada «Usuarios» que enlaza a `/admin/users` en la barra lateral y en el menú móvil.

## R2
MIENTRAS el usuario de la sesión no es admin, el sistema NO DEBE mostrar la entrada «Usuarios» en la barra lateral ni en el menú móvil.

## R3
CUANDO un usuario que no es admin navega a `/admin/users`, el sistema DEBE redirigirle a `/` sin hacer `GET /api/admin/users`.

## Listado

## R4
CUANDO el admin abre `/admin/users`, el sistema DEBE mostrar una fila por usuario de `GET /api/admin/users`, en el orden de la respuesta, con nombre, email, rol, estado (activa / desactivada), fecha de alta y nº de vehículos.

## R5
MIENTRAS el listado se está cargando, el sistema DEBE mostrar el texto de carga en lugar de las filas.

## R6
SI `GET /api/admin/users` falla ENTONCES el sistema DEBE mostrar un mensaje de error con `role="alert"` en lugar del listado.

## Cambiar el rol

## R7
CUANDO el admin elige otro rol en el selector de una fila (salvo degradarse a sí mismo, que antes pide confirmación según R24), el sistema DEBE enviar `PUT /api/admin/users/:id/role` con `{ role }` y mostrar un toast de éxito.

## R8
CUANDO termina bien cualquier acción (rol, desactivar, reactivar, borrar), el sistema DEBE invalidar la query del listado completo, de modo que las filas y sus `locks` se vuelven a pedir.

## R9
CUANDO el admin se quita a sí mismo el rol `admin` (fila con `isSelf`), el sistema DEBE volver a pedir `GET /api/me` y navegar a `/`.

## R24
CUANDO el admin elige `user` en el selector de su propia fila (`isSelf`, rol `admin`), el sistema DEBE abrir un diálogo de confirmación (`alertdialog`) que avisa de que perderá el acceso de administrador al instante y de que solo otro admin podrá devolvérselo, sin enviar ninguna petición; al confirmarlo se aplican R7 y R9.

## R25
CUANDO el admin cancela el diálogo de R24, el sistema DEBE cerrarlo sin enviar `PUT /api/admin/users/:id/role` y con el selector de nuevo en «Administrador».

## Desactivar y reactivar

## R10
CUANDO el admin pulsa «Desactivar» en una fila activa, el sistema DEBE enviar `POST /api/admin/users/:id/disable` y mostrar un toast de éxito.

## R11
CUANDO el admin pulsa «Reactivar» en una fila desactivada, el sistema DEBE enviar `POST /api/admin/users/:id/enable` y mostrar un toast de éxito.

## Borrar

## R12
CUANDO el admin pulsa «Eliminar» en una fila, el sistema DEBE abrir un diálogo de confirmación (`alertdialog`) con el nombre y email del usuario y el aviso de que se borran sus vehículos, mantenimientos, repostajes y adjuntos de forma irreversible, sin enviar ninguna petición.

## R13
CUANDO el admin confirma el diálogo de borrado, el sistema DEBE enviar `DELETE /api/admin/users/:id` y mostrar un toast de éxito.

## R14
CUANDO el admin cancela el diálogo de borrado, el sistema NO DEBE enviar `DELETE /api/admin/users/:id`.

## Acciones no permitidas

## R15
SI una fila tiene `locks.demote` no nulo ENTONCES el sistema DEBE deshabilitar su selector de rol con una descripción accesible (`aria-describedby`) que explica el motivo.

## R16
SI una fila tiene `locks.disable` no nulo ENTONCES el sistema DEBE deshabilitar su botón «Desactivar» con una descripción accesible que explica el motivo.

## R17
SI una fila tiene `locks.delete` no nulo ENTONCES el sistema DEBE deshabilitar su botón «Eliminar» con una descripción accesible que explica el motivo.

## R18
El sistema DEBE mostrar un texto distinto para cada motivo: `'self'` («no puedes desactivar ni eliminar tu propia cuenta») y `'last_admin'` («debe quedar al menos un administrador activo»).

## Errores de las acciones

## R19
SI una acción responde 409 ENTONCES el sistema DEBE mostrar un toast con un mensaje traducido de acción ya no permitida e invalidar el listado.

## R20
SI una acción falla con cualquier otro error ENTONCES el sistema DEBE mostrar un toast con el error genérico (`common.error`).

## Login de una cuenta desactivada

## R21
SI `POST /api/auth/sign-in/email` responde 403 ENTONCES la pantalla de login DEBE mostrar en el `role="alert"` el mensaje específico de cuenta desactivada en lugar de «Email o contraseña incorrectos».

## R22
SI `POST /api/auth/sign-in/email` responde con un error distinto de 403 ENTONCES la pantalla de login DEBE seguir mostrando «Email o contraseña incorrectos».

## Textos

## R23
El sistema DEBE definir cada texto nuevo en `apps/web/src/i18n/locales/es.json` y `en.json` con las mismas claves.

## Acceptance → requirements

| Criterio de `feature_list.json` | Requirements |
|---|---|
| El admin ve una entrada «Usuarios» en la navegación; los demás no la ven y la ruta les redirige | R1, R2, R3 |
| La pantalla lista los usuarios con su rol, estado y fecha de alta, y permite cambiar el rol, desactivar, reactivar y borrar (este último con confirmación explícita) | R4, R5, R6, R7, R8, R9, R10, R11, R12, R13, R14, R19, R20, R24, R25 |
| Las acciones no permitidas (último admin, uno mismo) aparecen deshabilitadas con una explicación | R15, R16, R17, R18 |
| Si un usuario desactivado intenta iniciar sesión, el login muestra un mensaje específico en lugar del genérico | R21, R22 |
| Todos los textos nuevos están en es.json y en.json | R23 |
| Tests de componente cubren el listado, cambiar el rol, desactivar y borrar | R4, R7, R10, R12, R13, R24, R25 (tests en `tasks.md`) |
| pnpm harness --full pasa en verde | última task de `tasks.md` |
