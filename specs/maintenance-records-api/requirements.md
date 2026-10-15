# Requirements — maintenance-records-api

> Feature 4 (fase 3). CRUD de mantenimientos por vehículo, enlazados con el odómetro.
> En la API el «km» se llama `odometer` (la unidad depende de `user_settings`, como en `vehicles`).

## R1
El sistema DEBE persistir los mantenimientos en la tabla `maintenance_records` (vehículo, fecha, `odometer` opcional, categoría, título, descripción, taller, coste, `include_in_report`), creada por una migración generada con drizzle-kit.

## R2
El sistema DEBE validar el alta y la edición con esquemas zod de `@ikrive/shared` cuya categoría solo admite valores de `MAINTENANCE_CATEGORIES`.

## R3
SI el cuerpo de un alta o edición no cumple el esquema ENTONCES el sistema DEBE responder 400 `application/problem+json` sin guardar nada.

## R4
CUANDO el usuario hace `POST /api/vehicles/:id/maintenance` con un cuerpo válido, el sistema DEBE responder 201 con el mantenimiento creado.

## R5
CUANDO el usuario hace `GET /api/vehicles/:id/maintenance`, el sistema DEBE devolver los mantenimientos del vehículo ordenados por fecha descendente (y, a igual fecha, por creación descendente).

## R6
CUANDO el usuario hace `GET /api/vehicles/:id/maintenance/:recordId`, el sistema DEBE devolver ese mantenimiento.

## R7
CUANDO el usuario hace `PATCH /api/vehicles/:id/maintenance/:recordId`, el sistema DEBE actualizar solo los campos enviados y responder 200 con el mantenimiento actualizado.

## R8
CUANDO el usuario hace `DELETE /api/vehicles/:id/maintenance/:recordId`, el sistema DEBE borrar el mantenimiento y responder 204.

## R9
CUANDO el usuario crea un mantenimiento con `odometer`, el sistema DEBE crear una lectura de odómetro con `source: 'maintenance'`, el mismo valor y la misma fecha, enlazada al mantenimiento.

## R10
CUANDO el usuario crea un mantenimiento sin `odometer`, el sistema NO DEBE crear ninguna lectura de odómetro.

## R11
CUANDO el usuario edita la fecha o el `odometer` de un mantenimiento y el resultado tiene `odometer`, el sistema DEBE actualizar su lectura enlazada (o crearla si no existía) con el valor y la fecha resultantes.

## R12
CUANDO el usuario edita un mantenimiento con `odometer: null`, el sistema DEBE borrar su lectura de odómetro enlazada.

## R13
CUANDO se valida la lectura de un mantenimiento editado con `findOdometerConflict`, el sistema DEBE excluir de la comparación la lectura enlazada a ese mismo mantenimiento.

## R14
SI la lectura de un alta o edición entra en conflicto con las lecturas vecinas ENTONCES el sistema DEBE responder 409 `application/problem+json` sin guardar ni el mantenimiento ni la lectura.

## R15
SI la fecha de un alta o edición es posterior a hoy en la zona horaria del usuario ENTONCES el sistema DEBE responder 400 `application/problem+json` sin guardar nada.

## R16
CUANDO el usuario borra un mantenimiento, el sistema DEBE borrar también su lectura de odómetro enlazada.

## R17
SI el vehículo de la ruta no existe o pertenece a otro usuario ENTONCES el sistema DEBE responder 404 en todos los endpoints de mantenimiento.

## R18
SI el `recordId` no existe, pertenece a otro vehículo o a otro usuario ENTONCES el sistema DEBE responder 404 en `GET`, `PATCH` y `DELETE`.

## Trazabilidad acceptance → requirements

| Criterio de `feature_list.json` | Requirements |
|---|---|
| Tabla `maintenance_records` con su migración drizzle-kit | R1 |
| Esquemas zod de alta, edición y respuesta en `@ikrive/shared`, categoría con `MAINTENANCE_CATEGORIES` | R2, R3 |
| `GET` y `POST /api/vehicles/:id/maintenance` (más reciente primero) | R4, R5 |
| `GET`, `PATCH` y `DELETE .../maintenance/:recordId` | R6, R7, R8 |
| Crear o editar con km crea o actualiza una lectura `maintenance` validada con `findOdometerConflict` | R9, R10, R11, R12, R13, R15 |
| Conflicto → 4xx problem+json sin guardar mantenimiento ni lectura | R14 |
| Borrar un mantenimiento borra su lectura | R16 |
| Vehículo o mantenimiento de otro usuario → 404 | R17, R18 |
| `apps/api/test/maintenance.test.ts` cubre CRUD, odómetro y autorización | R3–R18 (tests en tasks T9–T13) |
