# Requirements — maintenance-schedules-web

> Feature 14 (fase 4). Sección «Próximos mantenimientos» en la ficha del vehículo y selector de regla en el formulario de mantenimiento. Consume el contrato de `maintenance-schedules-api` (#13): `GET|POST /api/vehicles/:id/schedules`, `PATCH|DELETE /api/vehicles/:id/schedules/:scheduleId` y `scheduleId` en los mantenimientos.
> Las distancias de la API ya vienen en la unidad del usuario (`intervalDistance`, `warnDistance`, `lastDoneOdometer`, `nextDueOdometer`); la web solo las formatea.

## R1
CUANDO el usuario abre la ficha de un vehículo, el sistema DEBE mostrar la sección «Próximos mantenimientos» con las reglas que devuelve `GET /api/vehicles/:id/schedules`.

## R2
El sistema DEBE ordenar las reglas por estado (`overdue`, `due_soon`, `ok`) y, dentro del mismo estado, por `nextDueDate` ascendente, después por `nextDueOdometer` ascendente (los null al final en ambos casos) y por último por título.

## R3
El sistema DEBE mostrar en cada regla su próximo vencimiento con la fecha formateada en el locale del usuario y los km con `format.distance` en su unidad de distancia, omitiendo la parte que sea null.

## R4
MIENTRAS `nextDueDateEstimated` es `true`, el sistema DEBE mostrar junto a la fecha de vencimiento la marca «estimada».

## R5
SI una regla tiene `nextDueDate` y `nextDueOdometer` a null ENTONCES el sistema DEBE mostrar en su lugar el texto «Sin datos suficientes para calcular el vencimiento».

## R6
El sistema DEBE mostrar en cada regla un `Badge` con el texto «Al día», «Próximo» o «Vencido» según `status` (`ok`, `due_soon`, `overdue`), con una variante visual distinta para cada estado.

## R7
El sistema DEBE mostrar en cada regla su título, su categoría traducida y su intervalo («Cada 12 meses o 15.000 km», «Cada 12 meses», «Cada 15.000 km») con la distancia en la unidad del usuario.

## R8
SI el vehículo no tiene reglas ENTONCES el sistema DEBE mostrar un mensaje de estado vacío en la sección.

## R9
MIENTRAS el vehículo no está `active`, el sistema NO DEBE mostrar el botón «Añadir regla».

## R10
CUANDO el usuario envía el formulario de regla con campos inválidos, el sistema DEBE mostrar los errores traducidos en cada campo (`aria-invalid`) usando un esquema derivado de `createMaintenanceScheduleSchema` de `@ikrive/shared`, sin llamar a la API.

## R11
SI el usuario envía el formulario de regla sin intervalo en meses ni en distancia ENTONCES el sistema DEBE mostrar en el campo de meses el error traducido «Indica un intervalo en meses o en {{unit}}» sin llamar a la API.

## R12
CUANDO el usuario guarda una regla nueva válida, el sistema DEBE enviar `POST /api/vehicles/:id/schedules` con los números parseados y sin `lastDoneDate` ni `lastDoneOdometer` si se dejaron vacíos, cerrar el diálogo, mostrar un toast y recargar la sección.

## R13
CUANDO el usuario edita una regla, el sistema DEBE abrir el formulario relleno con sus valores y enviar `PATCH /api/vehicles/:id/schedules/:scheduleId` con todos los campos, con los intervalos y `lastDoneOdometer` vacíos como `null`.

## R14
CUANDO el usuario confirma el borrado de una regla, el sistema DEBE enviar `DELETE /api/vehicles/:id/schedules/:scheduleId`, mostrar un toast y recargar las reglas y los mantenimientos del vehículo, y NO enviarlo si cancela.

## R15
SI la API responde con error al guardar o borrar una regla ENTONCES el sistema DEBE mostrar el mensaje genérico de error (en el formulario, que sigue abierto, o en un toast al borrar).

## R16
MIENTRAS el vehículo tiene reglas, el formulario de mantenimiento DEBE mostrar un selector «Regla» con la opción «Ninguna» y las reglas del vehículo, preseleccionando la `scheduleId` del mantenimiento al editar.

## R17
CUANDO el usuario guarda un mantenimiento, el sistema DEBE enviar `scheduleId` con la regla elegida, o `null` si eligió «Ninguna».

## R18
CUANDO se guarda un mantenimiento, el sistema DEBE recargar las reglas del vehículo para que la sección muestre el nuevo vencimiento.

## R19
El sistema DEBE etiquetar los campos de distancia del formulario de regla con la unidad de distancia del usuario.

## R20
El sistema DEBE tener todos los textos nuevos en `es.json` y `en.json` con las mismas claves.

## R21
El sistema DEBE mostrar la sección y el formulario de regla legibles en modo oscuro y a 375 px de ancho.

## Trazabilidad acceptance → requirements

| Criterio de `feature_list.json` | Requirements |
|---|---|
| Reglas en la ficha ordenadas por vencimiento, próximo vencimiento (fecha y/o km, marca de estimada) y Badge al día / próximo / vencido | R1, R2, R3, R4, R5, R6, R7, R8, R21 |
| Crear, editar y borrar desde la ficha con formulario validado con `@ikrive/shared`; borrar pide confirmación | R9, R10, R11, R12, R13, R14, R15 |
| El formulario de mantenimiento vincula a una regla y al guardar la sección se actualiza | R16, R17, R18 |
| Km en la unidad del usuario y fechas en su locale | R3, R7, R19 |
| Textos en `es.json` y `en.json` | R20 |
| Tests de componente: listado con estados, alta de regla y vinculación desde el formulario de mantenimiento | R1–R18 (tests en T4, T9, T11, T12) |
| `pnpm harness --full` en verde | T14 (todos) |
