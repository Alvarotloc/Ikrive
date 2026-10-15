# Requirements — maintenance-timeline-web

> Feature 6 (fase 3). Timeline de mantenimientos en la ficha del vehículo (`/vehicles/$vehicleId`) con alta, edición y borrado, sobre la API de la feature 4.
> «km» = campo `odometer` (unidad de `user_settings`).

## R1
CUANDO el usuario abre la ficha de un vehículo, el sistema DEBE mostrar una sección de mantenimientos con los registros devueltos por `GET /api/vehicles/:id/maintenance`.

## R2
El sistema DEBE ordenar la timeline del mantenimiento más reciente al más antiguo (fecha descendente y, a igual fecha, `createdAt` descendente).

## R3
El sistema DEBE agrupar los registros de la timeline por año, con el año como encabezado de cada grupo y los grupos en orden descendente.

## R4
El sistema DEBE ofrecer un filtro por categoría con la opción «Todas» más una opción por cada categoría presente en los registros del vehículo, en el orden de `MAINTENANCE_CATEGORIES`.

## R5
CUANDO el usuario selecciona una categoría en el filtro, el sistema DEBE mostrar solo los registros de esa categoría.

## R6
SI la categoría seleccionada deja de tener registros (p. ej. tras borrar el último) ENTONCES el sistema DEBE volver al filtro «Todas».

## R7
El sistema DEBE mostrar la categoría traducida de cada registro con `Badge variant="stamp"`.

## R8
El sistema DEBE mostrar en cada registro su fecha y título y, solo cuando existen, los km con la unidad del usuario, el taller y el coste con la moneda del usuario.

## R9
MIENTRAS el vehículo no tiene mantenimientos, el sistema DEBE mostrar un mensaje de timeline vacía en lugar de la lista y el filtro.

## R10
CUANDO el usuario envía el formulario de alta con datos válidos, el sistema DEBE hacer `POST /api/vehicles/:id/maintenance`, cerrar el formulario y confirmar con un toast.

## R11
El sistema DEBE validar el formulario con react-hook-form y un esquema construido a partir de los campos de `createMaintenanceRecordSchema` de `@ikrive/shared`, convirtiendo km y coste vacíos en `null` y aceptando coste en notación española o inglesa.

## R12
SI el formulario no supera la validación ENTONCES el sistema DEBE mostrar el error junto al campo correspondiente sin llamar a la API.

## R13
CUANDO el usuario pulsa editar en un registro, el sistema DEBE abrir el mismo formulario precargado con los valores del registro.

## R14
CUANDO el usuario envía el formulario de edición con datos válidos, el sistema DEBE hacer `PATCH /api/vehicles/:id/maintenance/:recordId` con todos los campos (km vacío → `odometer: null`), cerrar el formulario y confirmar con un toast.

## R15
CUANDO el usuario pulsa borrar en un registro, el sistema DEBE pedir confirmación en un `AlertDialog` y solo hacer `DELETE /api/vehicles/:id/maintenance/:recordId` si el usuario confirma.

## R16
SI la API responde 409 al guardar el formulario ENTONCES el sistema DEBE mostrar un mensaje de conflicto de odómetro en el campo de km sin cerrar el formulario.

## R17
SI la API responde 400 sin `errors` (fecha futura) al guardar el formulario ENTONCES el sistema DEBE mostrar el mensaje de fecha futura en el campo de fecha sin cerrar el formulario.

## R18
SI la API responde con cualquier otro error al guardar o borrar ENTONCES el sistema DEBE mostrar el mensaje genérico `common.error` al usuario.

## R19
CUANDO un alta, edición o borrado de mantenimiento termina con éxito, el sistema DEBE invalidar las queries bajo `queryKeys.vehicles.all` para refrescar timeline, km actuales y lecturas.

## R20
El sistema DEBE definir todos los textos nuevos de la feature en `es.json` y en `en.json`, con el mismo conjunto de claves en ambos.

## R21
El sistema DEBE mostrar la timeline, el filtro y el formulario sin desbordamiento horizontal a 375 px de ancho y legibles en modo claro y oscuro.

## R22
MIENTRAS el vehículo no está activo (vendido o archivado), el sistema DEBE ocultar el botón «Añadir mantenimiento».

## Trazabilidad acceptance → requirements

| Criterio de `feature_list.json` | Requirements |
|---|---|
| La ficha muestra la timeline, del más reciente al más antiguo | R1, R2, R3, R9 |
| Filtrable por categoría y categoría con `Badge variant="stamp"` | R4, R5, R6, R7, R8 |
| Crear y editar con react-hook-form y los esquemas de `@ikrive/shared` | R10, R11, R12, R13, R14, R19, R22 |
| Borrar pide confirmación | R15, R19 |
| Conflicto de odómetro de la API en el campo de km | R16, R17, R18 |
| Textos en `es.json` y `en.json` | R20 |
| Móvil y modo oscuro | R21 |
| Lógica pura nueva con tests unitarios | R2, R3, R4, R5, R6, R8, R11, R16, R17, R18 (T2, T4) |

## Verificación por requirement

Unitarios (`*.test.ts`, Node) para la lógica pura; de componente (`*.test.tsx`, jsdom, `renderWithProviders` + `mockApi`) para el comportamiento de UI. Nombres exactos de los tests en `tasks.md`.

| Req | Unitario | Componente | Otro |
|---|---|---|---|
| R1 | — | `maintenance-timeline.test.tsx` (T14) | montaje en la ruta: T11 |
| R2, R3 | `timeline.test.ts` (T2) | `maintenance-timeline.test.tsx` (T14) | |
| R4, R5, R6 | `timeline.test.ts` (T2) | `maintenance-timeline.test.tsx` (T14) | |
| R7 | — | `maintenance-timeline.test.tsx` (T14) | etiquetas: `locales.test.ts` (T6) |
| R8 | `timeline.test.ts` (T2) | `maintenance-timeline.test.tsx` (T14) | |
| R9, R15, R22 | — | `maintenance-timeline.test.tsx` (T14) | |
| R10, R12, R13, R14, R19 | `form.test.ts` (T4: R12, R13) | `maintenance-form.test.tsx` (T13) | |
| R11, R16, R17 | `form.test.ts` (T4) | `maintenance-form.test.tsx` (T13) | |
| R18 | `form.test.ts` (T4) | `maintenance-form.test.tsx` (guardar) y `maintenance-timeline.test.tsx` (borrar) | |
| R20 | `locales.test.ts` (T6) | — | |
| R21 | — | — | capturas claro/oscuro/375 px (T11) |
