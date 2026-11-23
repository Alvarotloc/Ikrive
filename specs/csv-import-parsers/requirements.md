# Requirements — csv-import-parsers

> Feature 84 (fase 9). Funciones puras en `packages/shared` que detectan y convierten un CSV de Fuelio, Drivvo, LubeLogger o uno genérico a un modelo normalizado. Sin persistencia, endpoints ni UI (#85 y #86).
> «Parser» = `parseCsvImport(text, options)` de `@ikrive/shared/csv-import`. «Fila» = registro del CSV; su número es la línea física (desde 1) donde empieza. «Resultado `parsed`/`unknown`/`needs_options`/`unit_mismatch`» = valor de `status` (`design.md`). «Destino» = `options.target`, unidades de distancia y cantidad del vehículo. «Celda importada» = fecha o valor de odómetro, cantidad, total, precio por unidad o coste, en una columna que el formato importa (tabla de `design.md`) y en una fila que no va a `skipped`.

## Detección

## R1
CUANDO el texto contiene una sección `## Log` (entrecomillada o con comas de relleno) con columnas de fecha y `Odo`, el sistema DEBE detectar el formato `fuelio`.

## R2
CUANDO el texto contiene marcadores `#`/`##` y una sección de repostajes de 21 columnas, aunque sus nombres estén traducidos, el sistema DEBE detectar el formato `drivvo`.

## R3
CUANDO un CSV sin secciones tiene las columnas de un registro de LubeLogger (combustible, servicio, odómetro o impuesto), el sistema DEBE detectar el formato `lubelogger` y su tipo de registro.

## R4
SI el texto está vacío o no coincide con ningún formato y no hay mapeo ENTONCES el sistema DEBE devolver `unknown` con las cabeceras leídas, sin lanzar una excepción.

## Lectura del CSV

## R5
El sistema DEBE leer ficheros con BOM, finales de línea LF o CRLF y separador `,` o `;`, con el mismo resultado normalizado.

## R6
CUANDO un campo entrecomillado tiene texto tras la comilla de cierre, el sistema DEBE añadir ese texto al mismo campo sin desplazar las columnas siguientes.

## R7
SI una comilla no se cierra en 4096 caracteres o antes del fin del fichero ENTONCES el sistema DEBE devolver un error `malformed_row` en esa fila y seguir leyendo desde la línea siguiente.

## Fechas, decimales y unidades

## R8
El sistema DEBE resolver el formato de fecha por este orden: `options.dateFormat`, `ymd` si todas las fechas importadas empiezan por `YYYY-MM-DD` (aunque el fichero declare otro formato) y formato declarado en el fichero (`ImportCSVDateFormat`).

## R9
SI el formato de fecha no se puede resolver ENTONCES el sistema DEBE devolver `needs_options` con `dateFormat` en `missing` y sin filas.

## R10
CUANDO no hay `options.decimalSeparator` y las celdas numéricas importadas usan un solo separador, el sistema DEBE usarlo como separador decimal sin tener en cuenta las columnas no importadas.

## R11
SI sin `options.decimalSeparator` las celdas numéricas importadas mezclan `.` y `,`, o un odómetro importado coincide con `^\d{1,3}([.,]\d{3})+$`, ENTONCES el sistema DEBE devolver `needs_options` con `decimalSeparator` en `missing` y sin filas.

## R12
CUANDO lee un importe, el sistema DEBE ignorar un símbolo de moneda (`$`, `€`, `£`) y los espacios al principio o al final.

## R13
SI las unidades conocidas del fichero difieren del destino ENTONCES el sistema DEBE devolver `unit_mismatch` con ambas unidades, sin filas y sin convertir valores.

## R14
DONDE se indica `options.sourceUnits`, el sistema DEBE usarlas en lugar de las unidades detectadas en el fichero.

## Normalización por formato

## R15
CUANDO lee una fila de `## Log` de Fuelio, el sistema DEBE producir un repostaje con `Price` como total, `VolumePrice` como precio por unidad, `Full` como depósito lleno y `Missed` como repostaje anterior omitido.

## R16
CUANDO lee una fila de `## Costs` de Fuelio cuya categoría de `## CostCategories` es de mantenimiento según la tabla de `design.md`, el sistema DEBE producir un mantenimiento con esa categoría.

## R17
CUANDO lee `##Refuelling` de Drivvo, el sistema DEBE tomar cada campo por su posición y no por el nombre de la cabecera.

## R18
CUANDO una fila de Drivvo tiene varios combustibles sin electricidad, el sistema DEBE producir un único repostaje con cantidades y totales sumados, precio medio ponderado y el aviso `merged_fuels`.

## R19
SI una fila de Drivvo combina electricidad con otro combustible ENTONCES el sistema DEBE devolver un error `mixed_fuel_units` en esa fila.

## R20
CUANDO lee `##Service` de Drivvo, el sistema DEBE producir un mantenimiento con el tipo como título, el local como taller y las notas como descripción.

## R21
CUANDO lee un CSV de combustible de LubeLogger, el sistema DEBE producir repostajes con los alias de columna de `design.md`, invirtiendo las columnas de parcial para obtener `fullTank`.

## R22
CUANDO lee un CSV de servicio de LubeLogger, el sistema DEBE producir mantenimientos con `description` como título y `notes` como descripción.

## R23
CUANDO lee un CSV de odómetro de LubeLogger, el sistema DEBE producir lecturas de km con la fecha y el valor de `odometer`.

## R24
CUANDO una fila es un gasto que no es mantenimiento (categoría de Fuelio sin correspondencia, `##Expense` de Drivvo, impuesto de LubeLogger), el sistema DEBE omitirla y añadirla a `skipped` con motivo `not_maintenance`.

## R25
CUANDO una fila de `## Costs` de Fuelio tiene `isTemplate` o `isIncome` activos, el sistema DEBE omitirla y añadirla a `skipped` con motivo `template` o `income`.

## Modelo normalizado

## R26
El sistema DEBE devolver cada fila válida con `data` conforme a `createOdometerReadingSchema`, `createFuelLogSchema` o `createMaintenanceRecordSchema` según su `kind`.

## R27
CUANDO un repostaje o mantenimiento trae odómetro, el sistema NO DEBE producir además una fila `odometer` para ese registro.

## R28
CUANDO un odómetro tiene decimales, el sistema DEBE redondearlo al entero más cercano y añadir el aviso `odometer_rounded`.

## R29
CUANDO un mantenimiento trae el odómetro vacío o a 0, el sistema DEBE normalizarlo a `null`.

## R30
El sistema DEBE asignar a cada fila una `key` determinista calculada solo con sus campos normalizados, de modo que la misma fila dé la misma `key` en cualquier fichero y formato.

## R31
DONDE el formato trae un identificador propio (`UniqueId` de Fuelio), el sistema DEBE conservarlo en `sourceId`.

## CSV genérico

## R32
CUANDO se indica `options.mapping` con tipo de registro, índices de columna, formato de fecha y separador decimal, el sistema DEBE convertir el CSV con ese mapeo sin aplicar la detección de formato.

## R33
SI al mapeo le falta una columna obligatoria o un índice está fuera de rango ENTONCES el sistema DEBE devolver `needs_options` con `columns.<campo>` en `missing` y sin filas.

## Errores y portabilidad

## R34
SI una fila es inválida ENTONCES el sistema DEBE añadir a `errors` su número de fila, su código y su campo, y seguir procesando las demás.

## R35
El módulo `csv-import` NO DEBE usar APIs de Node (`node:*`, `Buffer`, `process`, `require`) fuera de sus tests.

## R36
El repositorio DEBE incluir fixtures de Fuelio, Drivvo y LubeLogger escritos a mano con datos inventados, y un test por formato que afirme su detección y sus filas normalizadas.

## Datos no importados

## R37
CUANDO devuelve `parsed`, el sistema DEBE indicar en `droppedFuelFields` si alguna fila `fuel` de `rows` traía en el origen notas (`notes`) o gasolinera (`station`) no vacías.

## Cobertura del acceptance

| Criterio de `feature_list.json` | Requirements |
|---|---|
| Fixtures anonimizados de Fuelio, Drivvo y LubeLogger, con un test por formato de detección y filas normalizadas | R1, R2, R3, R15–R25, R36 |
| CSV genérico con mapeo explícito de columnas, formato de fecha y separador decimal | R32, R33 |
| Una fila inválida se devuelve como error con su número y no impide procesar las demás | R7, R19, R34 |
| Un CSV no reconocido devuelve formato desconocido, sin excepción | R4 |
| `pnpm harness --full` en verde | Última task de `tasks.md` |

R37 no cubre un criterio de #84: da a #86 el dato para su criterio «la vista previa avisa de que las notas y la gasolinera no se importan».
