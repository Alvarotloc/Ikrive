# Requirements — vehicle-stats-web

> Feature 25 (fase 5). Sección de estadísticas en la página del vehículo con cifras clave y gráficos Recharts, alimentada por `GET /api/vehicles/:id/stats` (feature 24, `VehicleStats` de `@ikrive/shared`).
> La API devuelve los valores en las unidades guardadas y marca la falta de datos solo con `null` (escalares) y `[]` (series). «Unidad de cantidad» = `fuelQuantityUnit(vehicle.fuelType, settings.volumeUnit)` (L, gal o kWh).

## R1
CUANDO el usuario abre la página de un vehículo, el sistema DEBE mostrar una sección «Estadísticas» con los datos de `GET /api/vehicles/:id/stats` de ese vehículo.

## R2
El sistema DEBE mostrar en la sección cinco cifras clave: distancia por año (`distance.perYear`), consumo medio (`consumption.average`), coste por distancia de combustible (`costPerDistance.fuel`), coste por distancia de mantenimiento (`costPerDistance.maintenance`) y coste total de propiedad (`spending.total`).

## R3
SI `distance.perYear` es `null` ENTONCES el sistema DEBE mostrar «—» en esa cifra con un texto que explica que hacen falta lecturas de odómetro separadas al menos 30 días.

## R4
SI `consumption.average` es `null` ENTONCES el sistema DEBE mostrar «—» en esa cifra con un texto que explica que hacen falta dos repostajes de depósito lleno sin repostajes olvidados entre ellos.

## R5
SI un coste por distancia es `null` ENTONCES el sistema DEBE mostrar «—» en esa cifra con un texto que explica que hacen falta al menos dos lecturas de odómetro con distancia recorrida.

## R6
El sistema DEBE mostrar un gráfico Recharts de distancia por mes a partir de `series.distanceByMonth`.

## R7
El sistema DEBE mostrar un gráfico Recharts de consumo por tramo a partir de `series.consumptionBySegment`, con un punto por tramo situado en su `endDate`.

## R8
El sistema DEBE mostrar un gráfico Recharts de gasto por mes a partir de `series.spendingByMonth`, con combustible y mantenimiento como series apiladas.

## R9
El sistema DEBE mostrar un gráfico Recharts de gasto por categoría de mantenimiento a partir de `spending.byCategory`, con el nombre traducido de cada categoría (`maintenance.categories.*`).

## R10
SI `series.distanceByMonth` está vacía ENTONCES el sistema DEBE mostrar en lugar de ese gráfico un estado vacío que explica que hacen falta al menos dos lecturas de odómetro.

## R11
SI `series.consumptionBySegment` está vacía ENTONCES el sistema DEBE mostrar en lugar de ese gráfico un estado vacío que explica que hacen falta dos repostajes de depósito lleno sin repostajes olvidados entre ellos.

## R12
SI `series.spendingByMonth` está vacía ENTONCES el sistema DEBE mostrar en lugar de ese gráfico un estado vacío que explica que hace falta un repostaje o un mantenimiento con coste.

## R13
SI `spending.byCategory` está vacío ENTONCES el sistema DEBE mostrar en lugar de ese gráfico un estado vacío que explica que hace falta un mantenimiento con coste.

## R14
El sistema DEBE mostrar las distancias con la unidad de distancia de los ajustes (`distanceUnit`) y los números con el separador decimal y de miles del idioma del usuario.

## R15
El sistema DEBE mostrar el consumo con hasta 2 decimales y la unidad `<unidad de cantidad>/100 <unidad de distancia>` (p. ej. «6,5 L/100 km», «18 kWh/100 km», «4,2 gal/100 mi»).

## R16
El sistema DEBE mostrar los importes en la moneda de los ajustes y los costes por distancia con entre 2 y 3 decimales seguidos de `/<unidad de distancia>` (p. ej. «0,085 €/km»).

## R17
El sistema DEBE mostrar los meses (`YYYY-MM`) y las fechas de los gráficos con el idioma del usuario y sin desplazarlos de día o mes por la zona horaria del navegador.

## R18
El sistema DEBE tomar todos los textos de la sección de `apps/web/src/i18n/locales/es.json` y `en.json`, con las mismas claves en ambos.

## Acceptance → requirements

| Criterio de `feature_list.json` | Requirements |
|---|---|
| Sección de estadísticas con km/año, consumo medio, coste por km (combustible y mantenimiento) y coste total de propiedad | R1, R2 |
| Gráficos con Recharts: km por mes, consumo por tramo y gasto por mes y por categoría | R6, R7, R8, R9 |
| Estado vacío que explica qué falta cuando no hay datos suficientes para una métrica o un gráfico | R3, R4, R5, R10, R11, R12, R13 |
| Unidades, moneda y formato de números y fechas según ajustes e idioma | R14, R15, R16, R17 |
| Todos los textos en es.json y en.json | R18 |
| Tests de componente cubren las cifras y los estados vacíos | R2, R3, R4, R5, R10, R11, R12, R13 (ver T8–T10) |
| `pnpm harness --full` en verde | T12 |
