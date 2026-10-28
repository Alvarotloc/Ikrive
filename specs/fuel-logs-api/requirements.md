# Requirements — fuel-logs-api

> Feature 22 (fase 5). CRUD de repostajes por vehículo, enlazados con el odómetro como los mantenimientos.
> En la API los km se llaman `odometer` (unidad de `user_settings`). Sin adjuntos en esta feature.

## R1
El sistema DEBE persistir los repostajes en la tabla `fuel_logs` (vehículo, fecha, `odometer`, `quantity`, `total_price`, `price_per_unit`, `full_tank`, `missed_previous`, lectura enlazada), creada por una migración generada con drizzle-kit.

## R2
CUANDO se borra un vehículo, el sistema DEBE borrar en cascada sus repostajes.

## R3
El sistema DEBE validar el alta y la edición con esquemas zod de `@ikrive/shared` que exigen `quantity`, `totalPrice` y `pricePerUnit` estrictamente positivos y `odometer` entero obligatorio en el alta.

## R4
CUANDO el alta trae `quantity` y `totalPrice` pero no `pricePerUnit`, el sistema DEBE guardar `pricePerUnit = totalPrice / quantity` redondeado a 3 decimales.

## R5
CUANDO el alta trae `quantity` y `pricePerUnit` pero no `totalPrice`, el sistema DEBE guardar `totalPrice = quantity × pricePerUnit` redondeado a 2 decimales.

## R6
CUANDO el alta trae `totalPrice` y `pricePerUnit`, el sistema DEBE guardar ambos tal como llegan, sin comprobar que cuadren con la cantidad.

## R7
SI el alta no trae ni `totalPrice` ni `pricePerUnit` ENTONCES el sistema DEBE rechazarla con 400 `application/problem+json`.

## R8
SI el cuerpo de un alta o edición no cumple el esquema ENTONCES el sistema DEBE responder 400 `application/problem+json` sin guardar nada.

## R9
CUANDO se crea un repostaje sin `fullTank` ni `missedPrevious`, el sistema DEBE guardarlos como `true` y `false` respectivamente.

## R10
CUANDO el usuario hace `POST /api/vehicles/:id/fuel-logs` con un cuerpo válido, el sistema DEBE responder 201 con el repostaje creado, con ambos precios rellenos.

## R11
CUANDO el usuario hace `GET /api/vehicles/:id/fuel-logs`, el sistema DEBE devolver los repostajes del vehículo ordenados por fecha descendente, a igual fecha por `odometer` descendente y después por creación descendente.

## R12
CUANDO el usuario hace `GET /api/vehicles/:id/fuel-logs/:logId`, el sistema DEBE devolver ese repostaje.

## R13
CUANDO el usuario hace `PATCH /api/vehicles/:id/fuel-logs/:logId`, el sistema DEBE actualizar solo los campos enviados y responder 200 con el repostaje actualizado.

## R14
CUANDO un `PATCH` envía `quantity`, `totalPrice` o `pricePerUnit` sin enviar los dos precios, el sistema DEBE recalcular el precio no enviado con las reglas de R4/R5 sobre los valores resultantes (si no se envía ningún precio, conserva `totalPrice` y recalcula `pricePerUnit`).

## R15
CUANDO un `PATCH` no envía `quantity`, `totalPrice` ni `pricePerUnit`, el sistema NO DEBE modificar los precios guardados.

## R16
CUANDO el usuario hace `DELETE /api/vehicles/:id/fuel-logs/:logId`, el sistema DEBE borrar el repostaje y responder 204.

## R17
CUANDO el usuario crea un repostaje, el sistema DEBE crear una lectura de odómetro con `source: 'fuel'`, el mismo valor y la misma fecha, enlazada al repostaje.

## R18
CUANDO el usuario edita la fecha o el `odometer` de un repostaje, el sistema DEBE actualizar su lectura enlazada (o crearla si no existía) con el valor y la fecha resultantes.

## R19
CUANDO se valida la lectura de un repostaje editado con `findOdometerConflict`, el sistema DEBE excluir de la comparación la lectura enlazada a ese mismo repostaje.

## R20
SI la lectura de un alta o edición entra en conflicto con las lecturas vecinas ENTONCES el sistema DEBE responder 409 `application/problem+json` sin guardar ni el repostaje ni la lectura.

## R21
SI la fecha de un alta o edición es posterior a hoy en la zona horaria del usuario ENTONCES el sistema DEBE responder 400 `application/problem+json` sin guardar nada.

## R22
CUANDO el usuario borra un repostaje, el sistema DEBE borrar también su lectura de odómetro enlazada.

## R23
SI se hace `DELETE /api/vehicles/:id/odometer/:readingId` sobre una lectura `source: 'fuel'` ENTONCES el sistema DEBE responder 409 `application/problem+json` sin borrar la lectura ni el repostaje.

## R24
SI el vehículo de la ruta no existe o pertenece a otro usuario ENTONCES el sistema DEBE responder 404 en todos los endpoints de repostajes.

## R25
SI el `logId` no existe, pertenece a otro vehículo o a otro usuario ENTONCES el sistema DEBE responder 404 en `GET`, `PATCH` y `DELETE`.

## R26
El sistema DEBE exponer en `@ikrive/shared` la función pura `fuelQuantityUnit(fuelType, volumeUnit)`, que devuelve `'kwh'` para `electric` y `volumeUnit` para cualquier otro combustible (incluido `plugin_hybrid`).

## Trazabilidad acceptance → requirements

| Criterio de `feature_list.json` | Requirements |
|---|---|
| `GET\|POST .../fuel-logs` y `GET\|PATCH\|DELETE .../fuel-logs/:logId`; vehículo o repostaje ajeno → 404 | R10, R11, R12, R13, R16, R24, R25 |
| Schemas zod en `packages/shared`; precio por unidad ↔ total calculados; cantidad y precios positivos | R3, R4, R5, R6, R7, R8, R9, R14, R15 |
| Crear crea lectura `fuel` validada con `findOdometerConflict` (409); editar la actualiza; borrar la borra | R17, R18, R19, R20, R21, R22 |
| La lectura de un repostaje no se borra desde el endpoint de odómetro | R23 |
| Migración `fuel_logs` con cascada al borrar el vehículo | R1, R2 |
| Tests de integración: CRUD, lectura asociada, conflicto de km, autorización | R8–R25 (tasks T9–T15) |
| `pnpm harness --full` en verde | T16 |
| Descripción: cantidad en L o kWh según el combustible del vehículo | R26 |
