# Requirements — maintenance-schedules-api

> Feature 13 (fase 4). Reglas periódicas de mantenimiento por vehículo, su próximo vencimiento y la vinculación con los mantenimientos.
> Nombres en la API (camelCase, distancia en la unidad del usuario, igual que `odometer`): `intervalMonths`, `intervalDistance` (= `interval_km`), `warnDays` y `warnDistance` (= umbral de aviso), `lastDoneDate` y `lastDoneOdometer` (= último realizado), `nextDueDate`, `nextDueOdometer` (= `next_due_km`), `nextDueDateEstimated`, `status`, `scheduleId`.
> «Hoy» es la fecha actual en la zona horaria del usuario (`user_settings.timezone`).

## R1
El sistema DEBE persistir las reglas en la tabla `maintenance_schedules` (vehículo, título, categoría, `interval_months` opcional, `interval_distance` opcional, `warn_days`, `warn_distance`, `last_done_date`, `last_done_odometer` opcional), creada por una migración generada con drizzle-kit.

## R2
El sistema DEBE añadir a `maintenance_records` la columna `schedule_id`, nullable y con FK a `maintenance_schedules`, y exponerla como `scheduleId` en el alta, la edición y la respuesta de los mantenimientos.

## R3
El sistema DEBE validar el alta y la edición de reglas con esquemas zod de `@ikrive/shared` cuya categoría solo admite valores de `MAINTENANCE_CATEGORIES`.

## R4
SI el cuerpo de un alta de regla no trae ni `intervalMonths` ni `intervalDistance` ENTONCES el sistema DEBE responder 400 `application/problem+json` sin guardar nada.

## R5
SI una edición de regla deja la regla sin `intervalMonths` ni `intervalDistance` ENTONCES el sistema DEBE responder 400 `application/problem+json` sin modificar la regla.

## R6
CUANDO el usuario hace `POST /api/vehicles/:id/schedules` con un cuerpo válido, el sistema DEBE responder 201 con la regla creada y sus campos calculados.

## R7
CUANDO el usuario hace `GET /api/vehicles/:id/schedules`, el sistema DEBE devolver las reglas del vehículo ordenadas por fecha de creación ascendente.

## R8
CUANDO el usuario hace `GET /api/vehicles/:id/schedules/:scheduleId`, el sistema DEBE devolver esa regla.

## R9
CUANDO el usuario hace `PATCH /api/vehicles/:id/schedules/:scheduleId`, el sistema DEBE actualizar solo los campos enviados y responder 200 con la regla recalculada.

## R10
CUANDO el usuario hace `DELETE /api/vehicles/:id/schedules/:scheduleId`, el sistema DEBE borrar la regla y responder 204.

## R11
CUANDO se borra una regla, el sistema DEBE conservar sus mantenimientos vinculados con `schedule_id` a null.

## R12
SI el vehículo de la ruta no existe o pertenece a otro usuario ENTONCES el sistema DEBE responder 404 en todos los endpoints de reglas.

## R13
SI el `scheduleId` no existe, pertenece a otro vehículo o a otro usuario ENTONCES el sistema DEBE responder 404 en `GET`, `PATCH` y `DELETE`.

## R14
El sistema DEBE devolver en cada regla `nextDueDate`, `nextDueDateEstimated`, `nextDueOdometer` y `status` (`ok` | `due_soon` | `overdue`) calculados al leer con la función pura de `@ikrive/shared`, a partir de hoy y de las lecturas de odómetro del vehículo.

## R15
CUANDO la regla tiene `intervalDistance` y `lastDoneOdometer`, el sistema DEBE calcular `nextDueOdometer = lastDoneOdometer + intervalDistance` (y null en otro caso).

## R16
CUANDO la regla tiene `intervalMonths`, el sistema DEBE calcular la fecha de vencimiento por meses sumando `intervalMonths` a `lastDoneDate`, ajustando al último día del mes si el día no existe (31 ene + 1 mes = 28/29 feb).

## R17
El sistema DEBE calcular la media de distancia diaria con las lecturas fechadas en los últimos 90 días (hoy incluido), y devolver null si hay menos de 2, si abarcan menos de 30 días o si la media no es positiva.

## R18
CUANDO la regla tiene `nextDueOdometer` y la media diaria no es null, el sistema DEBE estimar la fecha de vencimiento por distancia como la fecha de la última lectura más `ceil(max(0, nextDueOdometer − valor de la última lectura) / media)` días (y null en otro caso).

## R19
El sistema DEBE devolver como `nextDueDate` la más temprana entre la fecha por meses y la estimada por distancia (null si no hay ninguna), con `nextDueDateEstimated: true` solo cuando procede de la estimación.

## R20
SI hoy es igual o posterior a la fecha por meses, o el valor de la última lectura es igual o mayor que `nextDueOdometer`, ENTONCES el sistema DEBE devolver `status: 'overdue'`.

## R21
MIENTRAS la regla no está vencida, el sistema DEBE devolver `status: 'due_soon'` si hoy es igual o posterior a la fecha por meses menos `warnDays` días o si el valor de la última lectura es igual o mayor que `nextDueOdometer − warnDistance`.

## R22
MIENTRAS la regla no está vencida ni próxima, el sistema DEBE devolver `status: 'ok'`, sin usar nunca la fecha estimada para el estado.

## R23
CUANDO el usuario crea una regla con `lastDoneDate` o `lastDoneOdometer`, el sistema DEBE guardar esos valores como último realizado.

## R24
CUANDO el usuario crea una regla sin `lastDoneDate`, el sistema DEBE usar la fecha de compra del vehículo o, si no la tiene, la fecha de hoy.

## R25
CUANDO el usuario crea una regla sin `lastDoneOdometer`, el sistema DEBE usar los km de compra del vehículo o, si no los tiene, el valor de la última lectura (null si no hay lecturas).

## R26
CUANDO el usuario crea o edita un mantenimiento cuyo `scheduleId` resultante apunta a una regla y su fecha es igual o posterior a `lastDoneDate`, el sistema DEBE fijar `lastDoneDate` y `lastDoneOdometer` de la regla a la fecha y el `odometer` del mantenimiento en la misma transacción.

## R27
SI la fecha del mantenimiento vinculado es anterior a `lastDoneDate` de la regla ENTONCES el sistema NO DEBE modificar el último realizado de la regla.

## R28
SI el `scheduleId` de un alta o edición de mantenimiento no es una regla del mismo vehículo ENTONCES el sistema DEBE responder 400 `application/problem+json` sin guardar nada.

## Trazabilidad acceptance → requirements

| Criterio de `feature_list.json` | Requirements |
|---|---|
| Tabla `maintenance_schedules` con su migración y `maintenance_records.schedule_id` referenciándola | R1, R2 |
| `GET\|POST /schedules` y `GET\|PATCH\|DELETE /schedules/:scheduleId` con zod de `@ikrive/shared`; 400 sin intervalos | R3, R4, R5, R6, R7, R8, R9, R10 |
| Solo el propietario accede (404 al resto) | R12, R13 |
| `next_due_date`, `next_due_km`, estado; fecha estimada con la media de 90 días, null sin datos | R14, R15, R16, R17, R18, R19, R20, R21, R22 |
| Último realizado opcional al crear; si no, compra del vehículo; si no, creación + última lectura | R23, R24, R25 |
| Mantenimiento con `schedule_id` actualiza último realizado y vencimiento; borrar la regla deja `schedule_id` null | R11, R26, R27, R28 |
| Vencimiento y media km/día como funciones puras con tests (meses, km, lo primero, umbral, sin datos) | R15–R22 (tests en T3) |
| Tests de integración de CRUD, autorización y recálculo al vincular | R4–R13, R23–R28 (tests en T12–T17) |
| `pnpm harness --full` en verde | T19 (todos) |
