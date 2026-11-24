# Requirements — csv-import-apply

> Feature 85 (fase 9). Guarda en un vehículo del usuario las filas que devuelve `parseCsvImport` (#84), en la API y en el DataSource local, con las reglas de odómetro de siempre y de forma atómica. Sin UI (#86).
> «Importación» = `POST /api/vehicles/:id/csv-import` o `dataSource().csvImport.import(vehicleId, file, options)` en modo local. «Fila» = elemento de `rows` de un resultado `parsed`; su número es `sourceRow`. «Clave» = `csvRowKey`. «Resumen» = cuerpo conforme a `csvImportSummarySchema` (`design.md`). «Hoy» = la fecha de hoy en la zona horaria del usuario. «Lecturas aceptadas» = lecturas que la misma importación ya va a crear antes de la fila evaluada.

## Escritura

## R1
CUANDO el usuario envía un CSV válido a la importación, el sistema DEBE crear en una única transacción las lecturas de km, los repostajes y los mantenimientos de todas las filas aceptadas.

## R2
SI una escritura falla durante la importación ENTONCES el sistema DEBE deshacer todas las escrituras de esa importación y responder 500 `application/problem+json`.

## R3
CUANDO se importa una fila `fuel`, o una fila `maintenance` con odómetro, el sistema DEBE crear su lectura vinculada con `source: 'fuel'` o `'maintenance'`, la fecha de la fila y su odómetro.

## R4
CUANDO se importa una fila `odometer`, el sistema DEBE crear una lectura con `source: 'manual'`.

## Duplicados

## R5
CUANDO la clave de una fila coincide con la de un repostaje, un mantenimiento o una lectura (de cualquier origen) que el vehículo ya tiene, el sistema DEBE omitir la fila y contarla en `duplicates`.

## R6
CUANDO varias filas del mismo fichero comparten clave, el sistema DEBE guardar solo la primera según el orden de proceso y contar las demás en `duplicates`.

## R7
CUANDO una fila `odometer` tiene la misma fecha y valor que la lectura vinculada de un repostaje o mantenimiento aceptado del mismo fichero, el sistema DEBE omitirla y contarla en `duplicates`.

## Reglas de odómetro

## R8
El sistema DEBE procesar primero las filas `fuel` y `maintenance` por número de fila y después las filas `odometer` por número de fila, comparando cada una con las lecturas del vehículo más las lecturas aceptadas.

## R9
SI el odómetro de una fila contradice las lecturas del vehículo o las lecturas aceptadas (`validateOdometerWrite`) ENTONCES el sistema DEBE omitir la fila y devolverla en `rejected` con su número de fila, su `kind`, `reason: 'odometer_conflict'` y la lectura con la que choca.

## R10
SI la fecha de una fila es posterior a hoy ENTONCES el sistema DEBE omitir la fila y devolverla en `rejected` con `reason: 'future_date'` y `conflict: null`.

## Respuesta

## R11
CUANDO la importación termina, el sistema DEBE responder 201 con un resumen que incluye el formato, los creados por `kind`, `duplicates`, `rejected`, los `errors` y `skipped` del parser y `droppedFuelFields`.

## R12
DONDE la petición lleva `dryRun: true`, el sistema DEBE responder 200 con el mismo resumen que daría la importación, sin escribir nada.

## Rechazos

## R13
SI el vehículo no existe o pertenece a otro usuario ENTONCES el sistema DEBE responder 404 `application/problem+json` sin escribir nada.

## R14
SI el fichero supera `CSV_IMPORT_MAX_BYTES` ENTONCES la API DEBE responder 413 `application/problem+json` sin llamar a `parseCsvImport` y sin escribir nada.

## R15
SI la petición no es multipart o no trae el fichero en el campo `file` ENTONCES la API DEBE responder 400 `application/problem+json` sin escribir nada.

## R16
SI el campo `options` no es JSON o no cumple `csvImportRequestSchema` ENTONCES el sistema DEBE responder 400 `application/problem+json` con `errors` cuyos `path` son relativos a las opciones, sin escribir nada.

## R17
SI `parseCsvImport` devuelve `unknown`, `needs_options` o `unit_mismatch` ENTONCES el sistema DEBE responder 400 `application/problem+json` con un `errors[]` que señala `file`, cada opción que falta (`dateFormat`, `decimalSeparator`, `mapping.columns.<campo>`) o `sourceUnits`, sin escribir nada.

## Entrada

## R18
El sistema DEBE llamar al parser con las unidades de destino del servidor o del dispositivo (`distanceUnit` de los ajustes y `fuelQuantityUnit(vehicle.fuelType, volumeUnit)`), nunca con unidades enviadas en la petición.

## R19
El sistema DEBE decodificar el fichero como UTF-8, con o sin BOM, antes de pasarlo a `parseCsvImport`.

## R28
CUANDO la decodificación UTF-8 sustituye algún byte inválido por `U+FFFD`, el sistema DEBE devolver `encodingReplaced: true` en el resumen, tanto en la API como en modo local y tanto en la importación como con `dryRun: true`, y `encodingReplaced: false` en caso contrario.

## DataSource

## R20
CUANDO la web llama a `csvImport.import` con servidor, el `DataSource` HTTP DEBE enviar un multipart a `/vehicles/:id/csv-import` con el campo `options` (JSON) antes del campo `file`.

## R21
MIENTRAS está activo el modo local, CUANDO se importa un CSV válido, el sistema DEBE crear en una única transacción de la base del dispositivo las mismas filas que la API y devolver un resumen conforme a `csvImportSummarySchema`.

## R22
MIENTRAS está activo el modo local, el sistema DEBE aplicar las mismas reglas de duplicados, orden, conflicto de odómetro y fecha futura que la API (R5–R10).

## R23
MIENTRAS está activo el modo local, SI el vehículo no existe ENTONCES el sistema DEBE rechazar con un `ApiError` 404 `Vehicle not found` sin escribir nada.

## R24
MIENTRAS está activo el modo local, SI el fichero supera `CSV_IMPORT_MAX_BYTES` ENTONCES el sistema DEBE rechazar con un `ApiError` 413 (`request file too large`, el mismo título que la API) sin leer el fichero, sin llamar a `parseCsvImport` y sin escribir nada.

## R25
MIENTRAS está activo el modo local, DONDE las opciones llevan `dryRun: true`, el sistema DEBE devolver el resumen sin escribir nada.

## R26
MIENTRAS está activo el modo local, SI una escritura falla durante la importación ENTONCES el sistema DEBE deshacer todas las escrituras de esa importación.

## R27
MIENTRAS está activo el modo local, SI las opciones no cumplen `csvImportRequestSchema` o el parser no devuelve `parsed` ENTONCES el sistema DEBE rechazar con un `ApiError` 400 con los mismos `errors` que la API, sin escribir nada.

## Cobertura del acceptance

| Criterio de `feature_list.json` | Requirements |
|---|---|
| Una petición crea las lecturas, repostajes y mantenimientos en una única transacción | R1, R2, R3, R4, R11 |
| Importar dos veces el mismo fichero no crea duplicados y la respuesta los cuenta como omitidos | R5, R6, R7, R11 |
| Las filas con conflicto de odómetro se informan por fila y no se guardan | R8, R9, R10 |
| Importar en un vehículo de otro usuario responde 404 | R13 |
| El modo local aplica las mismas reglas, comprobado con tests del DataSource local | R20, R21, R22, R23, R25, R26, R27 |
| CSV por encima del tamaño máximo: 413 en la API antes del parser y error equivalente en local | R14, R24 |
| `pnpm harness --full` en verde | Última task de `tasks.md` |
| Cambio pedido en Gate 1: avisar si el fichero puede no ser UTF-8 | R28 |

R12 sirve el criterio de #86 «vista previa con el recuento de filas válidas, duplicadas y con error», que solo se puede calcular contra la base de datos. R15–R19 fijan los bordes del contrato de entrada (`design.md`). R28 lo pidió el humano en Gate 1 para que #86 avise de que el fichero puede no estar en UTF-8.
