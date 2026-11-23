# Exploración: formatos CSV de otras apps (#84 `csv-import-parsers`)

> Investigado el 2026-11-23 en código y ejemplos públicos. **Ninguno es una especificación oficial** y no se ha probado con un export reciente de cada app: el spec debe tratarlo como riesgo.
> **Fixtures:** escribirlos a mano con datos inventados. No copiar los CSV de estos repositorios, que contienen datos reales de sus autores y pueden tener otra licencia.

## Fuelio

Fuentes: `dundee/fuelio2fuelly` (`convert.py`, `example-fuelio.csv`) y `Programistyk/FuelioImport` (`fueliobackupbuilder.class.php`).

- Un fichero con secciones: `## Vehicle`, `## Log`, `## CostCategories`, `## Costs`. El marcador puede venir entrecomillado (`"## Log"`) o con comas de relleno (`## Log,,,,,`).
- Cabecera de `## Log`:
  `Data, Odo (km), Fuel (litres), Full, Price (optional), l/100km (optional), latitude (optional), longitude (optional), City (optional), Notes (optional), Missed, TankNumber, FuelType, VolumePrice, StationID (optional), ExcludeDistance, UniqueId, TankCalc`
- Variaciones vistas: con y sin espacio (`Odo (km)` / `Odo(km)`), unidad en la cabecera (`Odo (mi)`), y versiones con solo las 14 primeras columnas.
- `Full`: `1` lleno, `0` parcial. `Missed`: repostaje anterior no registrado. `Price`: coste total. `VolumePrice`: precio por unidad.
- `## Vehicle` trae `DistUnit`, `FuelUnit` e `ImportCSVDateFormat`, que puede servir para interpretar las fechas.
- Cabecera de `## CostCategories`: `CostTypeID, Name, priority`.
- Cabecera de `## Costs`: `CostTitle, Date, Odo, CostTypeID, Notes, Cost, flag, idR, read, RemindOdo, RemindDate, isTemplate, RepeatOdo, RepeatMonths, isIncome, UniqueId`. Las filas `isTemplate` no son gastos realizados, y `isIncome` son ingresos.
- `UniqueId` existe en versiones recientes y es útil para la deduplicación de #85.

## Drivvo

Fuentes: `milkway/drivvo` (export real de 2019) y `Programistyk/FuelioImport` (`drivvoprovider.class.php`).

- Un fichero con secciones: `##Vehicle`, `##Refuelling`, `##Expense`, `##Service`. **Los nombres van traducidos** (vistos `#Reabastecimiento`, `#Servicio`, con una sola `#`).
- Cabecera de `##Refuelling` (en inglés):
  `Odometer (km), Date, Fuel, Price / L, Total cost, Volume, Filled tank completely, Second fuel, Price / L, Total cost, Volume, Filled tank completely 2, Third fuel, Price / L, Total cost, Volume, Filled tank completely 3, Fuel efficiency, Gas station, Reason, Notes`
- **La cabecera está malformada:** contiene `"Filled tank completely" 2,"Third fuel"`, con texto tras la comilla de cierre. Un parser CSV estricto falla o desplaza columnas. Además repite nombres. Hay que leer `##Refuelling` **por posición** (21 campos: 0 odómetro, 1 fecha, 2 combustible, 3 precio, 4 total, 5 volumen, 6 lleno, 7-11 segundo combustible, 12-16 tercero, 17 eficiencia, 18 gasolinera, 19 motivo, 20 notas).
- Fechas `YYYY-MM-DD HH:mm:ss`. Booleanos traducidos: `Yes`, `Si`, `Tak`, `Ja` / `No`, `Nie`, `Nein`.
- Un repostaje puede tener hasta tres combustibles en la misma fila.
- Cabecera de `##Expense`: `Odometer (km), Date, Total cost, Type of expense, Local expense, Reason, Notes`.
- Cabecera de `##Service`: `Odometer (km), Date, Total cost, Type of service, Local service, Notes`.

## LubeLogger

Fuente: `hargata/lubelog` (`MapProfile/ImportMappers.cs`, `Models/Shared/ImportModel.cs`, `Controllers/Vehicle/ImportController.cs`).

- **Un CSV por tipo de registro**, sin secciones: combustible, servicio, reparación, mejora, odómetro, impuestos, etc. El tipo se deduce de las columnas.
- Nombres aceptados por su importador (sin distinguir mayúsculas):
  - Fecha: `date`, `fuelup_date` (o `day`, `month`, `year`).
  - Odómetro: `odometer`, `odo`; `initialodometer` en odómetro.
  - Volumen: `fuelconsumed`, `gallons`, `liters`, `litres`, `consumption`, `quantity`, `qty`.
  - Coste: `cost`, `total cost`, `totalcost`, `total price`; `price`.
  - Lleno: `isfilltofull`, `filled up`; parcial: `partial_fuelup`, `partial tank`, `partial_fill`.
  - Repostaje omitido: `missed_fuelup`, `missedfuelup`, `missed fill up`, `missed_fill`.
  - Otros: `description`, `notes`, `note`, `tags`.
- Booleanos `True` / `False`.
- **Depende de la configuración regional:** las fechas se escriben con el formato del servidor y su plantilla pone el coste con símbolo de moneda (`$123.45`). Una fecha como `03/04/2025` es ambigua sin saber el formato.

## Implicaciones para el spec

1. El parser CSV tiene que tolerar comillas malformadas, BOM, CRLF, y separador `,` o `;`.
2. Fechas y decimales ambiguos no se adivinan en silencio: se usa el formato conocido o se pide en las opciones.
3. Unidades (km/mi, litros/galones) del fichero frente a las del usuario: Ikrive guarda los km en la unidad del usuario sin convertir. Decidir qué hace el parser si no coinciden.
4. Gastos que no son mantenimiento (`## Costs` de Fuelio, `##Expense` de Drivvo, impuestos de LubeLogger): la tabla de gastos llega en #87, después de esta feature. Decidir si el modelo normalizado los conserva ya o se omiten y se informan.
5. Repostajes con varios combustibles en Drivvo: decidir cómo se representan.
