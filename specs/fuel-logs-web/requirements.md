# Requirements — fuel-logs-web

> Feature 23 (fase 5). Lista de repostajes en la ficha del vehículo (`/vehicles/$vehicleId`) y formulario rápido de alta/edición, con borrado, sobre la API de la feature 22 (`/api/vehicles/:id/fuel-logs`).
> «km» = campo `odometer` (unidad de distancia de `user_settings`). «Unidad de cantidad» = `fuelQuantityUnit(vehicle.fuelType, settings.volumeUnit)` de `@ikrive/shared` (kWh solo para `electric`). «Los tres valores» = cantidad, precio total y precio por unidad.

## Lista

## R1
CUANDO el usuario abre la ficha de un vehículo, el sistema DEBE mostrar una sección «Repostajes» con los repostajes devueltos por `GET /api/vehicles/:id/fuel-logs`.

## R2
El sistema DEBE ordenar la lista del repostaje más reciente al más antiguo (fecha descendente; a igual fecha, `odometer` descendente y después `createdAt` descendente).

## R3
El sistema DEBE mostrar en cada repostaje su fecha, sus km con la unidad de distancia del usuario, la cantidad con la unidad de cantidad, el precio total con la moneda del usuario, el precio por unidad con la moneda del usuario y hasta 3 decimales, y si fue a depósito lleno o parcial.

## R4
MIENTRAS el vehículo no tiene repostajes, el sistema DEBE mostrar un mensaje de lista vacía en lugar de la lista.

## R5
MIENTRAS el vehículo no está activo (vendido o archivado), el sistema NO DEBE mostrar el botón «Añadir repostaje».

## Formulario

## R6
CUANDO el usuario pulsa «Añadir repostaje», el sistema DEBE abrir el formulario con la fecha de hoy, «Depósito lleno» marcado y «Me salté un repostaje anterior» desmarcado.

## R7
CUANDO se abre el formulario de alta de un vehículo con lecturas de km, el sistema DEBE proponer en el campo de km el valor de su última lectura (`vehicle.odometer.value`) y mostrar esa lectura con su fecha como referencia.

## R8
CUANDO el usuario deja rellenos dos de los tres valores y el tercero vacío, el sistema DEBE calcular el tercero en el formulario (precio total redondeado a 2 decimales, precio por unidad a 3, cantidad a 3) y marcarlo como calculado.

## R9
CUANDO el usuario modifica uno de los dos valores de los que se calculó el tercero, el sistema DEBE recalcular el valor calculado.

## R10
SI al enviar el formulario quedan menos de dos de los tres valores rellenos ENTONCES el sistema DEBE mostrar en los campos vacíos un error que pide rellenar al menos dos de los tres, sin llamar a la API.

## R11
SI al enviar el formulario un valor no es un número positivo dentro de los límites de `createFuelLogSchema`, o los km no son un entero válido ENTONCES el sistema DEBE mostrar el error junto al campo (`aria-invalid`) sin llamar a la API.

## R12
El sistema DEBE interpretar un único punto o coma en la cantidad, el precio total o el precio por unidad siempre como separador decimal, nunca de miles («58,36» → 58.36; «40.125» → 40.125; «1.459» → 1.459), admitiendo hasta 3 decimales en la cantidad, 2 en el precio total y 3 en el precio por unidad.

## R25
SI la cantidad, el precio total o el precio por unidad contienen más de un separador («1.234,56») o caracteres que no son dígitos ni un separador ENTONCES el sistema DEBE mostrar junto al campo el error de número no válido (`aria-invalid`) sin reinterpretar el valor ni llamar a la API.

## R26
SI la cantidad, el precio total o el precio por unidad tienen más decimales de los admitidos (3, 2 y 3) ENTONCES el sistema DEBE mostrar junto al campo un error que indique el máximo de decimales de ese campo (`aria-invalid`) sin redondear el valor ni llamar a la API.

## R13
El sistema DEBE mostrar las etiquetas de cantidad y de precio por unidad con la unidad de cantidad del vehículo, y las de km y precios con la unidad de distancia y la moneda del usuario.

## R14
CUANDO el usuario envía el formulario de alta con datos válidos, el sistema DEBE hacer `POST /api/vehicles/:id/fuel-logs` con fecha, km, los tres valores y las dos casillas, cerrar el formulario y confirmar con un toast.

## R15
El sistema DEBE usar en el formulario campos de entrada aptos para el móvil: `inputMode="numeric"` en los km y `inputMode="decimal"` en los tres valores.

## Edición y borrado

## R16
CUANDO el usuario pulsa editar en un repostaje, el sistema DEBE abrir el mismo formulario precargado con los valores de ese repostaje.

## R17
CUANDO el usuario envía el formulario de edición con datos válidos, el sistema DEBE hacer `PATCH /api/vehicles/:id/fuel-logs/:logId` con todos los campos, cerrar el formulario y confirmar con un toast.

## R18
CUANDO el usuario pulsa borrar en un repostaje, el sistema DEBE pedir confirmación en un `AlertDialog` y solo hacer `DELETE /api/vehicles/:id/fuel-logs/:logId` si el usuario confirma.

## R19
CUANDO un alta, edición o borrado de repostaje termina con éxito, el sistema DEBE invalidar `queryKeys.vehicles.all` para refrescar los km del vehículo, sus lecturas y la lista de repostajes.

## Errores

## R20
SI la API responde 409 al guardar el formulario ENTONCES el sistema DEBE mostrar en el campo de km un mensaje que explique que los km no encajan con las lecturas del vehículo, sin cerrar el formulario.

## R21
SI la API responde 400 sin `errors` (fecha futura) al guardar ENTONCES el sistema DEBE mostrar el mensaje de fecha futura en el campo de fecha sin cerrar el formulario.

## R22
SI la API responde con cualquier otro error al guardar o al borrar ENTONCES el sistema DEBE mostrar el mensaje genérico `common.error` (en el formulario con `role="alert"`, o en un toast al borrar).

## i18n y presentación

## R23
El sistema DEBE definir todos los textos de la feature (namespace `fuel.*`, incluida una etiqueta por cada valor de `FUEL_QUANTITY_UNITS`) en `es.json` y en `en.json`.

## R24
El sistema DEBE ser usable a 375 px de ancho y en modo oscuro (formulario con scroll dentro del diálogo y filas sin desbordamiento horizontal), comprobado con capturas.
## R27
MIENTRAS el formulario está en modo edición, el sistema DEBE mostrar junto a los tres valores una pista que explique que, al vaciar uno de ellos, se recalcula a partir de los otros dos.
## R28
CUANDO el usuario vacía o modifica el valor calculado, el sistema NO DEBE volver a calcularlo ni sobrescribirlo hasta que el usuario modifique uno de los otros dos valores.

## Acceptance → requirements

| Criterio de `feature_list.json` | Requirements |
|---|---|
| La ficha muestra la lista de repostajes (fecha, km, cantidad, precio total, precio por unidad y depósito lleno), del más reciente al más antiguo | R1, R2, R3, R4 |
| Formulario rápido, usable en el móvil: dos de cantidad/total/precio unitario calculan el tercero; km propuestos a partir de la última lectura | R5, R6, R7, R8, R9, R10, R11, R12, R14, R15, R24, R25, R26, R28 |
| Editar y borrar (con confirmación); se refrescan los km del vehículo | R16, R17, R18, R19, R27 |
| Unidades y moneda según los ajustes; kWh en eléctricos | R3, R13 |
| Un 409 de km se muestra en el campo de km con un mensaje claro | R20, R21, R22 |
| Todos los textos en es.json y en.json | R23 |
| Tests de componente del formulario (cálculo y validación) y de la lista | R8, R9, R10, R11, R12, R25, R26, R1, R2, R3 (ver `tasks.md`) |
| `pnpm harness --full` en verde | todas (última task) |
