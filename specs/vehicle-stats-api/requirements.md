# Requirements — vehicle-stats-api

> Feature 24 (fase 5). Fórmulas de estadísticas como funciones puras en `@ikrive/shared` y `GET /api/vehicles/:id/stats`.
> «Distancia» es el km u otra unidad guardada (`user_settings.distanceUnit`); «cantidad» son L, gal o kWh tal como se guardaron. Nada se convierte.
> Las lecturas son todas las de `odometer_readings` (`manual`, `maintenance` y `fuel`), ordenadas por fecha y después por valor.

## R1
El sistema DEBE calcular la distancia recorrida de un vehículo como el valor de la última lectura menos el de la primera, o `null` si hay menos de dos lecturas.

## R2
El sistema DEBE calcular km/año y km/mes como la distancia por día entre la primera y la última lectura multiplicada por 365 y por 365/12, redondeadas a entero.

## R3
SI hay menos de dos lecturas o la primera y la última están separadas menos de 30 días ENTONCES el sistema DEBE devolver `null` en km/año y km/mes.

## R4
El sistema DEBE generar la serie de distancia por mes (`YYYY-MM`, del mes de la primera lectura al de la última, sin huecos) repartiendo la distancia entre lecturas consecutivas por interpolación lineal por días, de modo que la suma de la serie sea igual a la distancia recorrida.

## R5
SI hay menos de dos lecturas ENTONCES el sistema DEBE devolver la serie de distancia por mes vacía.

## R6
CUANDO hay dos repostajes de depósito lleno consecutivos (ordenados por fecha y `odometer`), el sistema DEBE calcular un tramo con `distance` = diferencia de `odometer`, `quantity` = suma de las cantidades de los repostajes posteriores al primero hasta el segundo incluido, y `consumption` = `quantity / distance × 100` redondeado a 2 decimales.

## R7
SI algún repostaje posterior al lleno inicial de un tramo, hasta el lleno final incluido, tiene `missedPrevious` ENTONCES el sistema DEBE excluir ese tramo de la serie y del consumo medio.

## R8
SI la distancia de un tramo es 0 ENTONCES el sistema DEBE excluir ese tramo de la serie y del consumo medio.

## R9
El sistema DEBE calcular el consumo medio como `Σ quantity / Σ distance × 100` de los tramos válidos, redondeado a 2 decimales.

## R10
SI no hay ningún tramo válido (incluido tener menos de dos repostajes de depósito lleno) ENTONCES el sistema DEBE devolver el consumo medio `null` y la serie de consumo por tramo vacía.

## R11
El sistema DEBE calcular el coste por distancia de combustible como la suma de `totalPrice` de todos los repostajes dividida entre la distancia recorrida (R1), redondeado a 3 decimales.

## R12
El sistema DEBE calcular el coste por distancia de mantenimiento como la suma de `cost` de todos los mantenimientos con coste dividida entre la distancia recorrida (R1), redondeado a 3 decimales.

## R13
SI la distancia recorrida es `null` o 0 ENTONCES el sistema DEBE devolver `null` en ambos costes por distancia.

## R14
El sistema DEBE calcular el coste total de propiedad como precio de compra (0 si no hay) + gasto total en combustible + gasto total en mantenimiento, devolviendo también cada componente, todo redondeado a céntimos.

## R15
El sistema DEBE calcular el gasto por categoría de mantenimiento sumando `cost` de los mantenimientos con coste, una entrada por categoría con al menos uno, ordenadas de mayor a menor total y redondeadas a céntimos.

## R16
El sistema DEBE generar la serie de gasto por mes (`YYYY-MM`, del primer al último mes con un repostaje o un mantenimiento con coste, sin huecos y con 0 en los meses vacíos) con el gasto de combustible y el de mantenimiento por separado, redondeados a céntimos.

## R17
SI un repostaje tiene `quantity`, `totalPrice` o `pricePerUnit` igual a 0 ENTONCES el sistema DEBE devolver todas las métricas y series con números finitos o `null`, nunca `NaN` ni `Infinity`.

## R18
CUANDO el usuario hace `GET /api/vehicles/:id/stats` sobre un vehículo suyo, el sistema DEBE responder 200 con las métricas y series de R1–R16 calculadas con los datos de ese vehículo y validadas con `vehicleStatsSchema` de `@ikrive/shared`.

## R19
CUANDO el vehículo no tiene lecturas, repostajes ni mantenimientos, el sistema DEBE responder 200 con las métricas de ratio a `null`, los gastos a 0 (más el precio de compra si lo hay) y las series vacías.

## R20
SI el vehículo no existe o pertenece a otro usuario ENTONCES el sistema DEBE responder 404 `application/problem+json`.

## R21
El sistema DEBE devolver en `spending.maintenance` el mismo total que `GET /api/vehicles/:id/maintenance/spending`.

## R22
El sistema DEBE devolver distancias, cantidades e importes en las unidades y la moneda en que se guardaron, sin convertirlos según `user_settings`.

## Trazabilidad acceptance → requirements

| Criterio de `feature_list.json` | Requirements |
|---|---|
| Funciones puras con tests en `packages/shared`: km/año y km/mes; consumo medio y por tramo entre llenos (tramo con `missed_previous` no cuenta); coste por km de combustible y mantenimiento; TCO; gasto por categoría | R1, R2, R4, R6, R7, R9, R11, R12, R14, R15, R16 |
| Sin datos suficientes (< 2 lecturas, < 2 llenos, km recorridos 0) → `null`, sin errores ni divisiones por cero | R3, R5, R8, R10, R13 |
| Repostaje con precio o cantidad 0 → sin división por cero, `Infinity` ni `NaN`; test unitario | R17 |
| `GET /api/vehicles/:id/stats` con métricas y series (km por mes, consumo por tramo, gasto por mes) en unidades guardadas; 404 ajeno | R4, R6, R16, R18, R20, R22 |
| Tests de integración con datos reales y con vehículo sin datos | R18, R19 (tasks T8, T9) |
| `pnpm harness --full` en verde | T11 |
| Instrucción del leader: no duplicar el gasto de mantenimiento de #8 | R21 |
