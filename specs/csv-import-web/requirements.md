# Requirements — csv-import-web

> Feature 86 (fase 9). Pantalla `/import` que guía la importación de un CSV en un vehículo: elegir vehículo y fichero, confirmar el formato detectado o mapear columnas, ver la vista previa e importar. Reutiliza el parser (#84) y la importación con `dryRun` (#85) a través de `dataSource().csvImport.import`, con servidor y en modo local.
> «Asistente» = componente `CsvImportWizard` de la ruta `/import`. «Destino» = `distanceUnit` de los ajustes y `fuelQuantityUnit(vehicle.fuelType, volumeUnit)`. «Análisis» = `parseCsvImport(text, { target: destino, ...opciones })` ejecutado en el navegador. «Opciones» = `dateFormat`, `decimalSeparator` y `mapping` de `csvImportRequestSchema`. «Vista previa» = `csvImport.import(vehicleId, file, { ...opciones, dryRun: true })`. «Resumen» = `CsvImportSummary` de #85. «Botón Importar» = botón que lanza la importación sin `dryRun`.

## Acceso y entrada

## R1
El sistema DEBE mostrar en Ajustes, con servidor y en modo local, una tarjeta con un enlace a `/import`.

## R2
El asistente DEBE permitir elegir el vehículo destino entre todos los vehículos del usuario, con el primero preseleccionado, y un fichero `.csv`.

## R3
SI el usuario no tiene vehículos ENTONCES el asistente DEBE mostrar un aviso con un enlace a `/vehicles/new` en lugar del selector de fichero.

## R4
SI el fichero elegido supera `CSV_IMPORT_MAX_BYTES` ENTONCES el asistente DEBE mostrar un error con el tamaño máximo en MB sin leer el fichero, sin cargar ni llamar a `parseCsvImport` y sin enviar ninguna petición.

## Detección

## R5
CUANDO el usuario elige un CSV dentro del límite cuyo formato se reconoce, el asistente DEBE mostrar el nombre del formato detectado (Fuelio, Drivvo o LubeLogger).

## R6
CUANDO el análisis sin mapeo devuelve `unknown`, el asistente DEBE indicar que el fichero se tratará como CSV genérico y mostrar el formulario de mapeo con las cabeceras del fichero.

## R7
CUANDO el análisis de un formato reconocido devuelve `needs_options`, el asistente DEBE pedir solo las opciones de `missing` (`dateFormat`, `decimalSeparator`) y volver a analizar con las elegidas.

## R8
SI el análisis devuelve `unit_mismatch` ENTONCES el asistente DEBE mostrar las unidades del fichero y las del destino con un enlace a Ajustes, sin pedir la vista previa.

## Mapeo del CSV genérico

## R9
MIENTRAS se mapea un CSV genérico, el asistente DEBE ofrecer el tipo de registro, para cada campo de ese tipo (`CSV_KIND_COLUMNS`) una columna del fichero o ninguna, el formato de fecha y el separador decimal.

## R10
MIENTRAS falta el tipo, una columna obligatoria de `CSV_REQUIRED_COLUMNS`, el formato de fecha o el separador decimal del mapeo, el asistente DEBE mantener desactivado el botón Importar y no pedir la vista previa.

## Vista previa

## R11
CUANDO el análisis devuelve `parsed`, el asistente DEBE pedir la vista previa con las opciones elegidas y mostrar el recuento de filas válidas (suma de `created`), duplicadas (`duplicates`) y con error (`errors` + `rejected`).

## R12
CUANDO la vista previa o el resumen final traen filas en `errors`, `rejected` o `skipped`, el asistente DEBE listar las 50 primeras con su número de fila y su motivo traducido (código y campo, conflicto con su fecha y km, o motivo de omisión con su etiqueta).

## R13
CUANDO la vista previa trae `droppedFuelFields.notes` o `droppedFuelFields.station` a `true`, el asistente DEBE avisar de que las notas o la gasolinera de los repostajes, según cuál sea `true`, no se importan.

## R14
CUANDO la vista previa trae `encodingReplaced: true`, el asistente DEBE avisar de que el fichero puede no estar en UTF-8.

## R15
MIENTRAS la vista previa no ha respondido con éxito para el vehículo, el fichero y las opciones actuales, o ha respondido con 0 filas válidas (suma de `created` = 0), el asistente DEBE mantener desactivado el botón Importar.

## R23
CUANDO la vista previa responde con éxito con 0 filas válidas (suma de `created` = 0), el asistente DEBE indicar junto al botón Importar que no hay nada que importar.

## Importación y resumen

## R16
CUANDO el usuario pulsa el botón Importar, el asistente DEBE llamar a `csvImport.import` con el mismo vehículo, fichero y opciones de la vista previa y sin `dryRun`.

## R17
MIENTRAS la importación está en curso, el asistente DEBE desactivar el selector de vehículo, el de fichero, las opciones y el botón Importar, que muestra «Importando…».

## R18
CUANDO la importación termina, el asistente DEBE mostrar un resumen con los creados por tipo, los omitidos (`duplicates` + `skipped`) y los errores (`errors` + `rejected`).

## R19
CUANDO la importación termina, el sistema DEBE invalidar `queryKeys.vehicles.all`.

## R20
SI la vista previa o la importación fallan ENTONCES el asistente DEBE mostrar en un `role="alert"` el mensaje del estado (413 tamaño máximo, 400 CSV no importable con estas opciones, 404 vehículo no encontrado, otro error genérico).

## Modos e idiomas

## R21
MIENTRAS está activo el modo local, el asistente DEBE obtener la vista previa e importar con el `DataSource` local, sin peticiones HTTP.

## R22
El sistema DEBE definir en `es` y en `en` todos los textos del asistente, incluida una etiqueta para cada valor de `CSV_FORMATS`, `CSV_ROW_KINDS`, `CSV_COLUMNS`, `CSV_DATE_FORMATS`, `CSV_DECIMAL_SEPARATORS`, `CSV_ROW_ERROR_CODES`, `CSV_REJECT_REASONS` y `CSV_SKIP_REASONS`.

## Cobertura del acceptance

| Criterio de `feature_list.json` | Requirements |
|---|---|
| Tras elegir un CSV se muestra el formato detectado y una vista previa con el recuento de filas válidas, duplicadas y con error | R2, R5, R6, R7, R8, R11, R12, R15, R23 |
| Con un CSV genérico, el botón de importar está desactivado hasta mapear las columnas obligatorias | R9, R10 |
| Al terminar se muestra un resumen de creados, omitidos y errores | R16, R17, R18, R19, R20 |
| Tests de componente cubren detección, mapeo, vista previa y resumen | R5, R6, R9, R10, R11, R18 (tests de T10–T15) |
| Todos los textos existen en es y en | R22 |
| Si el CSV trae notas o gasolinera en los repostajes, la vista previa avisa de que esos datos no se importan | R13 |
| Si el fichero supera el tamaño máximo, el asistente lo indica y no lo lee ni lo procesa | R4 |
| `pnpm harness --full` pasa en verde | Última task de `tasks.md` |
| Descripción: disponible con servidor y en local | R1, R21 |

R3 y R14 cubren estados que el contrato de #85 ya expone (sin vehículos, `encodingReplaced`, que #85 pidió avisar en Gate 1).
