# Design — vehicle-stats-api

Todo el cálculo vive en `packages/shared` como funciones puras (el modo local de la futura app móvil las reutiliza). La API solo carga los datos del vehículo con los repositorios que ya existen, llama a `computeVehicleStats()` y responde. Sin cambios de BD.

## Archivos

| Capa | Archivo | Cambio |
|---|---|---|
| shared | `packages/shared/src/domain/odometer.ts` | Extraer el cálculo de distancia/día de `averageDistancePerYear` a un helper interno y añadir `averageDistancePerMonth()` (mismo umbral de 30 días). `averageDistancePerYear` mantiene su contrato (lo usa la ficha). |
| shared | `packages/shared/src/domain/stats.ts` (nuevo) | `roundMoney`, `distanceDriven`, `distanceByMonth`, `consumptionSegments`, `averageConsumption`, `costPerDistance`, `spendingByCategory`, `spendingByMonth`, `computeVehicleStats`. |
| shared | `packages/shared/src/domain/stats.test.ts` (nuevo) | Tests unitarios (ver tasks). |
| shared | `packages/shared/src/schemas/stats.ts` (nuevo) | `vehicleStatsSchema` + tipo `VehicleStats`. |
| shared | `packages/shared/src/index.ts` | Exportar `domain/stats` y `schemas/stats`. |
| api | `apps/api/src/modules/stats/service.ts` (nuevo) | `createStatsService({ vehicles, fuelLogs, maintenance })` → `forVehicle(userId, vehicleId): VehicleStats`. |
| api | `apps/api/src/modules/stats/routes.ts` (nuevo) | `GET /vehicles/:id/stats`. |
| api | `apps/api/src/app.ts` | Sacar `createFuelLogsRepository(db)` a una variable `fuelLogsRepo`, crear `statsService` y registrar `statsRoutes`. |
| api | `apps/api/src/modules/maintenance/service.ts` | `spending()` usa `roundMoney` de shared en vez del redondeo en línea (mismo resultado). |
| test | `apps/api/test/stats.test.ts` (nuevo) | Integración. |

El módulo `stats` no tiene `repository.ts`: no tiene tabla propia y reutiliza `vehiclesRepo.findOwned` / `listReadings`, `fuelLogsRepo.listByVehicle` y `maintenanceRepo.listByVehicle`.

## Fórmulas (`domain/stats.ts`)

Entrada mínima, sin depender de las filas de Drizzle:

```ts
export interface StatsFuelLog { date: string; odometer: number; quantity: number; totalPrice: number; fullTank: boolean; missedPrevious: boolean }
export interface StatsMaintenanceRecord { date: string; category: MaintenanceCategory; cost: number | null }
export interface VehicleStatsInput {
  purchasePrice: number | null;
  readings: readonly OdometerPoint[];
  fuelLogs: readonly StatsFuelLog[];
  maintenance: readonly StatsMaintenanceRecord[];
}
export function computeVehicleStats(input: VehicleStatsInput): VehicleStats;
```

- **Orden:** lecturas por fecha y valor (`byDateThenValue`, como `latestOdometerReading`); repostajes por fecha y `odometer` (el orden de entrada desempata). Las funciones no asumen que la entrada venga ordenada.
- **Divisiones:** una sola `ratio(numerator, denominator)` interna que devuelve `null` si el denominador es ≤ 0 o el resultado no es finito. El único divisor posible es una distancia; precios y cantidades solo se suman, así que un 0 (redondeo de `resolveFuelPrices`, aviso del reviewer de #22) da 0, nunca `NaN`/`Infinity` (R17).
- **Distancia por mes (R4):** se interpola el odómetro en el día 1 de cada mes entre lecturas consecutivas (días UTC con `Date.parse`) y se **redondea el valor interpolado en cada frontera**; cada mes es la diferencia entre fronteras (la primera y la última son las lecturas reales), así la suma es exacta. Ej.: `2025-01-01 → 10 000` y `2025-03-01 → 15 900` dan `[{2025-01: 3100}, {2025-02: 2800}, {2025-03: 0}]`.
- **Tramos (R6–R8):** se recorre la lista ordenada; cada lleno cierra el tramo abierto por el lleno anterior. `quantity` del tramo incluye los parciales intermedios y el lleno final, no el inicial. Los parciales antes del primer lleno se ignoran.
- **Consumo medio (R9):** ponderado por distancia (Σ cantidad / Σ distancia), no la media de los consumos de cada tramo.
- **Gasto de combustible:** Σ `totalPrice` de todos los repostajes (incluidos los de tramos excluidos: son gasto real).
- **Redondeo:** importes a 2 decimales (`roundMoney`), consumo a 2, coste por distancia a 3, distancias a entero. Se redondea al final, nunca resultados intermedios.

## Contrato HTTP

| Método y ruta | Éxito | Errores |
|---|---|---|
| `GET /api/vehicles/:id/stats` | 200 `VehicleStats` | 401 sin sesión · 404 `Vehicle not found` (inexistente o ajeno) |

`preHandler: app.authenticate`, `params: idParamSchema`, `response: { 200: vehicleStatsSchema }`. Sin query string.

```ts
export const vehicleStatsSchema = z.object({
  distance: z.object({
    driven: z.number().int().nullable(),        // R1
    perYear: z.number().int().nullable(),       // R2, R3
    perMonth: z.number().int().nullable(),
  }),
  consumption: z.object({ average: z.number().nullable() }), // cantidad / 100 unidades de distancia (R9, R10)
  costPerDistance: z.object({ fuel: z.number().nullable(), maintenance: z.number().nullable() }), // R11–R13
  spending: z.object({                          // R14
    purchase: z.number().nullable(),
    fuel: z.number(),
    maintenance: z.number(),
    total: z.number(),
    byCategory: z.array(z.object({ category: z.enum(MAINTENANCE_CATEGORIES), total: z.number() })), // R15
  }),
  series: {
    distanceByMonth: z.array(z.object({ month: monthSchema, distance: z.number().int() })),          // R4
    consumptionBySegment: z.array(z.object({                                                       // R6
      startDate: isoDateSchema, endDate: isoDateSchema,
      distance: z.number().int(), quantity: z.number(), consumption: z.number(),
    })),
    spendingByMonth: z.array(z.object({ month: monthSchema, fuel: z.number(), maintenance: z.number() })), // R16
  },
});
// monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)
```

zod 4 rechaza `NaN` e `Infinity` en `z.number()`: si alguna fórmula los produjera, la respuesta fallaría en vez de filtrarlos (segunda red para R17).

## Impacto en UI

Ninguno en esta feature. La web (#25) recibe series listas para Recharts (un punto por mes sin huecos, tramos con fecha final) y formatea con `useFormat` y `fuelQuantityUnit()`. `distanceUnit`/`quantityUnit` no van en la respuesta: la web ya tiene los ajustes y el vehículo.

## Alternativas descartadas

- **Agregar en SQL (`GROUP BY strftime('%Y-%m', date)`, como `sumCost`)**: el acceptance pide funciones puras con tests unitarios, y el modo local de la app móvil no tendrá esta API.
- **Atribuir la distancia al mes de la lectura** (diferencia con la lectura anterior): con lecturas espaciadas (p. ej. una cada tres meses) el gráfico muestra picos y meses a 0 que no reflejan el uso. La interpolación lineal reparte la distancia por días.
- **Consumo medio como media de los consumos por tramo**: sobrepondera tramos cortos; el ponderado por distancia es el estándar (Fuelly, Spritmonitor).
- **Un endpoint por métrica o reutilizar `/maintenance/spending`**: la ficha de estadísticas pide todo a la vez; una sola respuesta evita N peticiones. `/maintenance/spending` se conserva para la ficha (R21 garantiza que cuadran).
- **Devolver MPG para usuarios en millas/galones**: se mantiene `cantidad / 100 unidades` («en las unidades guardadas»); la inversión a MPG, si se quiere, es presentación de la web.

## Decisiones a validar (Gate 1)

1. La distancia sale **solo de las lecturas de odómetro**; `purchaseOdometer` no cuenta como lectura (la ficha ya muestra «km desde la compra» aparte).
2. km/año y km/mes son `null` con lecturas separadas menos de 30 días (umbral ya usado por `averageDistancePerYear`), aunque haya dos lecturas.
3. Coste por distancia = gasto total / distancia entre primera y última lectura (todas las fuentes). El primer repostaje cuenta aunque su combustible se gaste después: sesgo pequeño a cambio de una fórmula simple.
4. Consumo en `cantidad / 100 unidades de distancia` (L/100 km, kWh/100 km, gal/100 mi).
5. Se cuentan todos los mantenimientos con coste, también `includeInReport: false` (igual que #8). Los que no tienen coste no aparecen en `byCategory`; uno con coste 0 sí.
6. El precio de compra entra en el coste total pero **no** en la serie de gasto por mes (dominaría el gráfico).
7. La serie de gasto por mes acaba en el último mes con gasto, no en el mes actual: la respuesta no depende de «hoy».
8. Vehículos vendidos o archivados: mismas estadísticas, sin recortar por `soldAt`.

## Riesgos

- Coma flotante en sumas de importes: redondeo final a céntimos en una sola función (`roundMoney`) compartida con #8.
- Rendimiento: se cargan todas las filas del vehículo por petición; con volúmenes personales (cientos o pocos miles de filas) es trivial y no requiere caché.
- Fechas: los meses se derivan de `YYYY-MM-DD` con `slice(0, 7)` y los días en UTC, sin zona horaria.

## Fuera de alcance

La UI (#25), filtros por rango de fechas, caché, conversión de unidades o monedas, depreciación o valor de reventa en el coste total, consumo separado combustible/electricidad en híbridos enchufables, gasto por categoría por mes.
