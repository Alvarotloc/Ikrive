# Design — vehicle-stats-web

Casi todo en `apps/web`. Sin cambios en la API ni en la BD. En `packages/shared` solo se borra la constante `DAY_MS` sin usar de `src/domain/stats.ts` (warning de biome que quedó al cerrar #24).

Consume `GET /api/vehicles/:id/stats` tal cual (contrato en `specs/vehicle-stats-api/design.md` y `progress/explore_vehicle-stats-web_api-contract.md`). Copia la estructura de `features/fuel/`: `queries.ts`, un hook de formato y un componente de sección con su test.

## Archivos

| Capa | Archivo | Cambio |
|---|---|---|
| shared | `packages/shared/src/domain/stats.ts` | Borrar `const DAY_MS = 86_400_000;` (l. 37). |
| web/deps | `apps/web/package.json` | `pnpm --filter @ikrive/web add recharts` (3.x). Si pnpm avisa de un peer `react-is`, se añade también. |
| web/lib | `apps/web/src/lib/query-keys.ts` | `vehicles.stats(id) = ['vehicles','detail',id,'stats']`, con un comentario que explica que cuelga de `vehicles.all`. |
| web/feature | `apps/web/src/features/stats/queries.ts` (nuevo) | `statsQuery(vehicleId)` → `api.get<VehicleStats>(...)`. |
| web/feature | `apps/web/src/features/stats/format.ts` (nuevo) + `format.test.ts` | Formateadores puros: dependen solo de locale, moneda y unidades. |
| web/feature | `apps/web/src/features/stats/use-stats-format.ts` (nuevo) | Hook que junta `useFormat`, `useFuelFormat(fuelType).unitLabel` y `format.ts`. |
| web/feature | `apps/web/src/features/stats/stats-charts.tsx` (nuevo) | Los cuatro gráficos de Recharts, cada uno dentro de `ChartFigure`. |
| web/feature | `apps/web/src/features/stats/vehicle-stats-section.tsx` (nuevo) + `.test.tsx` | `VehicleStatsSection`: un Card con las cifras (`Metric`) y la rejilla de gráficos. |
| web/route | `apps/web/src/routes/_app/vehicles/$vehicleId/index.tsx` | El loader añade `ensureQueryData(statsQuery)`. `<VehicleStatsSection vehicle={vehicle} />` va entre `MaintenanceSection` y la tarjeta «Gestionar». |
| i18n | `apps/web/src/i18n/locales/{es,en}.json` | Namespace `stats.*`. Los nombres de categoría se reutilizan de `maintenance.categories.*`. |

## Datos y refresco

- `statsQuery` sigue el patrón de `fuelLogsQuery`. El componente usa `useSuspenseQuery`, y el loader precarga la query junto a las demás. El 404 ya lo convierte en `notFound()`.
- La clave cuelga de `['vehicles','detail',id]`. Las mutaciones de repostajes, mantenimientos, lecturas y del vehículo (precio de compra) ya invalidan `vehicles.all`, así que no hace falta tocar ninguna mutación.

## Tipos y firmas

```ts
// format.ts (puro, sin React)
export interface StatsFormatOptions {
  locale: string;
  currency: string;
  distanceUnit: DistanceUnit;
  quantityUnitLabel: string; // t(`fuel.units.${unit}`): 'L' | 'gal' | 'kWh'
}
export function createStatsFormatters(o: StatsFormatOptions): {
  consumption(value: number): string;     // «6,5 L/100 km»: hasta 2 decimales
  costPerDistance(value: number): string; // «0,085 €/km»: moneda, entre 2 y 3 decimales
  month(month: string): string;           // '2025-03' → «mar 2025» (UTC)
  shortDate(iso: string): string;         // '2025-03-10' → «10 mar» (UTC), para el eje X
  number(value: number): string;          // ticks de los ejes, sin decimales
};

// use-stats-format.ts
export function useStatsFormat(fuelType: FuelType):
  ReturnType<typeof createStatsFormatters> & Pick<ReturnType<typeof useFormat>, 'distance' | 'money' | 'date' | 'distanceUnit'>;

// vehicle-stats-section.tsx (sin dependencias de TanStack Router)
export function VehicleStatsSection(props: { vehicle: Pick<Vehicle, 'id' | 'fuelType'> }): JSX.Element;
```

## UI

- **Cabecera:** `Card` con título «Estadísticas» y descripción «Con todo el histórico del vehículo».
- **Cifras:** se reutiliza `Metric` de `features/vehicles/dossier.tsx` en una rejilla `sm:grid-cols-2 xl:grid-cols-5`.
  - Si la cifra es `null`: `value="—"` y la explicación de R3–R5 en el `hint`, como hace `perYearPending` en el dossier.
  - El coste total siempre es un número. Su `hint` muestra el desglose: compra (si la hay), combustible y mantenimiento.
- **Gráficos:** rejilla `lg:grid-cols-2`. Cada gráfico es un `ChartFigure`: un `<figure>` con un `<figcaption className="label-caps">`, que le da al gráfico un rol `figure` con nombre accesible. Dentro va un `ResponsiveContainer` de 240 px de alto.
  - Distancia por mes: `BarChart`.
  - Consumo por tramo: `LineChart` con puntos. El eje X usa `shortDate(endDate)`. El tooltip muestra el rango con `date`, la distancia y el consumo.
  - Gasto por mes: `BarChart` con dos `Bar` y `stackId`, más una leyenda.
  - Por categoría: `BarChart` con `layout="vertical"`.
  - Ejes y tooltips formatean siempre con `useStatsFormat`. No se muestra nunca el valor en crudo.
- **Estado vacío:** si la serie está vacía, el `ChartFigure` muestra en lugar del gráfico `<p className="py-3 text-sm text-muted-foreground">`, el mismo estilo que `fuel-logs-section`.
- **Colores:** variables CSS (`var(--color-primary)`, `var(--color-accent-strong)`, `var(--color-deep)`, `var(--color-border)` para la rejilla). Así el modo oscuro funciona sin código extra. Combustible y mantenimiento usan siempre los mismos dos colores en todos los gráficos.
- **Móvil:** una columna. En el gráfico de categorías, el eje Y tiene una anchura fija suficiente para «Inspección».

## i18n (`stats.*`)

`title`, `description`, `metrics.{perYear,consumption,fuelCostPerDistance,maintenanceCostPerDistance,totalCost,totalCostHint}`, `pending.{perYear,consumption,costPerDistance}`, `charts.{distanceByMonth,consumptionBySegment,spendingByMonth,spendingByCategory}`, `series.{distance,consumption,fuel,maintenance}`, `empty.{distanceByMonth,consumptionBySegment,spendingByMonth,spendingByCategory}`. `locales.test.ts` ya comprueba que es y en tienen las mismas claves.

## Tests

- **`format.test.ts` (unit):** formateadores con `es` y `en`, km/mi, L/gal/kWh y EUR/USD. Incluye un mes y una fecha en el límite UTC.
- **`vehicle-stats-section.test.tsx` (dom):** `mockApi` con `GET /settings` y `GET /vehicles/v1/stats` dentro de `<Suspense>`.
  - Las cifras se buscan por su etiqueta, igual que en `maintenance-spending.test.tsx`.
  - Los gráficos se buscan con `getByRole('figure', { name })`.
  - jsdom no tiene `ResizeObserver`: se stubea con `vi.stubGlobal` en el propio test (el setup lo deshace). Además se pasa `initialDimension` al `ResponsiveContainer` para que Recharts pinte el SVG.
  - Lo que se ve dentro del SVG de los ejes no se afirma: el formato se cubre en `format.test.ts`.

## Alternativas descartadas

- **Calcular las estadísticas en el navegador** con `computeVehicleStats` sobre las queries ya cargadas (lecturas, repostajes y mantenimientos). Ahorraría una petición, pero duplica el trabajo del endpoint de #24, que existe precisamente para esto. Además, deja la web atada a cargar el histórico completo.
- **Ruta o pestaña propia (`/vehicles/$id/stats`).** La página del vehículo es un único scroll sin pestañas, y el acceptance pide una sección del vehículo. Si la página crece demasiado, se puede reconsiderar.
- **`PieChart` para las categorías.** Con hasta 8 categorías y en móvil, las etiquetas se solapan. Las barras horizontales se leen mejor y se ordenan igual que `byCategory`.

## Decisiones a validar

1. **Posición:** la sección va después de Mantenimientos y antes de «Gestionar», como resumen de los datos de arriba. La otra opción es justo debajo del dossier.
2. **km/año duplicado:** el dossier ya muestra «Media anual» (calculada en el cliente con la misma función). Se mantiene en los dos sitios para no tocar el dossier en esta feature.
3. **Solo L/100 km**, sin MPG: la API no lo da y convertir queda fuera de alcance.
4. Los textos de «qué falta» (R3–R5 y R10–R13) son los de este spec. El humano puede ajustar la redacción en es/en.

## Riesgos

- **Tamaño del bundle:** Recharts pesa unos 100 kB gzip. La ruta ya se divide en chunks (`autoCodeSplitting`), así que solo afecta a la página del vehículo. Si molesta, se puede cargar `stats-charts.tsx` con `React.lazy`, pero eso queda fuera de esta feature.
- **Recharts en jsdom:** sin `ResizeObserver` no renderiza. El stub y `initialDimension` resuelven los tests. Si aun así no pinta el SVG, basta con afirmar el `figure` y la ausencia del estado vacío.
- **Revisión visual obligatoria** (`docs/verification.md` nivel 4): capturas en claro, oscuro y móvil.

## Fuera de alcance

Filtros por fechas, conversión de unidades o moneda, MPG, consumo separado en PHEV, gasto por categoría y mes, exportar gráficos y la carga diferida de Recharts.
