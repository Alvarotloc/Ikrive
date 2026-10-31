# Implementación: vehicle-stats-web (#25)

Rama `feat/vehicle-stats-web`. Tasks T1–T12 marcadas en `specs/vehicle-stats-web/tasks.md`. Sin commits.

## Cambios por archivo

| Archivo | Cambio |
|---|---|
| `packages/shared/src/domain/stats.ts` | Se borra `const DAY_MS` (sin usar). `pnpm lint` ya no da warnings. |
| `apps/web/package.json`, `pnpm-lock.yaml` | `recharts ^3.10.1` y `react-is ^19.3.1` (ver desviación 1). |
| `apps/web/src/lib/query-keys.ts` | `vehicles.stats(id) = ['vehicles','detail',id,'stats']`, con un comentario que explica que cuelga de `vehicles.all`. |
| `apps/web/src/features/stats/queries.ts` (nuevo) | `statsQuery(vehicleId)` → `api.get<VehicleStats>('/vehicles/:id/stats')`. |
| `apps/web/src/features/stats/format.ts` (nuevo) | `createStatsFormatters({locale, currency, distanceUnit, quantityUnitLabel})`: `consumption` (≤2 decimales, «6,5 L/100 km»), `costPerDistance` (moneda con 2–3 decimales + `/km`), `month` y `shortDate` (UTC) y `number` (sin decimales). |
| `apps/web/src/features/stats/format.test.ts` (nuevo) | 4 tests unitarios (es/en, km/mi, L/gal/kWh, EUR/USD, límite UTC). |
| `apps/web/src/features/stats/use-stats-format.ts` (nuevo) | `useStatsFormat(fuelType)`: junta `createStatsFormatters` con `distance`, `money`, `date` y `distanceUnit` de `useFormat`. La unidad sale de `useFuelFormat(fuelType).unitLabel`. |
| `apps/web/src/features/stats/stats-charts.tsx` (nuevo) | `ChartFigure` (`figure` + `figcaption label-caps`, enlazados con `aria-labelledby`, con el estado vacío `<p class="py-3 text-sm text-muted-foreground">`) y `StatsCharts`, con los 4 gráficos: distancia por mes en `BarChart`; consumo por tramo en `LineChart` lineal con puntos, eje X `shortDate(endDate)` y tooltip con rango, distancia y consumo; gasto por mes en `BarChart` apilado con leyenda; categorías en `BarChart` vertical con `maintenance.categories.*` y eje Y de 96 px. `ResponsiveContainer` de 240 px con `initialDimension`. Colores: `--color-primary` (combustible, distancia y consumo), `--color-accent-strong` (mantenimiento) y `--color-border` (rejilla). |
| `apps/web/src/features/stats/vehicle-stats-section.tsx` (nuevo) | `VehicleStatsSection({vehicle: Pick<Vehicle,'id'\|'fuelType'>})`: un Card con 5 `Metric` en `sm:grid-cols-2 xl:grid-cols-5`. Un valor `null` muestra «—» con el `hint` de `stats.pending.*`. El coste total lleva el desglose en el `hint`. Debajo, `StatsCharts`. |
| `apps/web/src/features/stats/vehicle-stats-section.test.tsx` (nuevo) | 6 tests de componente. |
| `apps/web/src/routes/_app/vehicles/$vehicleId/index.tsx` | `ensureQueryData(statsQuery)` en el loader y `<VehicleStatsSection vehicle={vehicle} />` entre `MaintenanceSection` y «Gestionar». |
| `apps/web/src/i18n/locales/{es,en}.json` | Namespace `stats.*`: title, description, metrics, pending, charts, series y empty. Solo son adiciones. |

## Trazabilidad

Abreviaturas: SF = `apps/web/src/features/stats/format.test.ts`, VS = `apps/web/src/features/stats/vehicle-stats-section.test.tsx`, LT = `apps/web/src/i18n/locales.test.ts`.

| R | Test |
|---|---|
| R1 | VS › shows the key figures in the user's units and currency (afirma `GET /api/vehicles/v1/stats` y el encabezado «Estadísticas») · montaje en la ruta: typecheck + capturas |
| R2 | VS › shows the key figures in the user's units and currency (las 5 cifras por etiqueta) |
| R3 | VS › explains what is missing for each empty figure (km/año: «—» + `pending.perYear`) |
| R4 | VS › explains what is missing for each empty figure (consumo: «—» + `pending.consumption`) |
| R5 | VS › explains what is missing for each empty figure (los dos costes por distancia: «—» + `pending.costPerDistance`; el coste total muestra un importe) |
| R6 | VS › renders the four charts when there is data («Distancia por mes» con SVG) · capturas |
| R7 | VS › renders the four charts when there is data («Consumo por tramo») · capturas `*-tooltip.png` |
| R8 | VS › renders the four charts when there is data («Gasto por mes») · capturas (barras apiladas + leyenda) |
| R9 | VS › renders the four charts when there is data («Neumáticos» y «Aceite» en «Gasto por categoría») |
| R10–R13 | VS › explains what is missing for each empty chart (texto de `stats.empty.*` en cada `figure` y sin `svg`) |
| R14 | SF › formats numbers with the locale separators · VS › shows the key figures… («14.600 mi») |
| R15 | SF › formats consumption with the quantity and distance units · VS › shows the key figures… («6,54 gal/100 mi») · VS › shows the consumption of an electric vehicle in kWh («6,54 kWh/100 mi») |
| R16 | SF › formats the cost per distance in the user's currency · VS › shows the key figures… (USD, `/mi`, desglose) · VS › leaves the purchase out of the total breakdown when there is no purchase price |
| R17 | SF › formats months and dates in UTC with the user's locale (pasa también con `TZ=America/Los_Angeles`) · capturas con `timezoneId: America/Los_Angeles` |
| R18 | LT › es and en define the same keys |

## Capturas (T11)

Usé un stack aislado y no toqué el `pnpm dev` del humano. La SPA se compiló con `vite build --outDir` en el scratchpad y la sirvió la API (`WEB_DIST_DIR`) en `127.0.0.1:3419`, también con `DATA_DIR` en el scratchpad. Los datos se sembraron por API: un Seat León con 28 repostajes (algunos sin depósito lleno), 6 mantenimientos y precio de compra, y un Renault Clio sin datos. Las capturas se hicieron con playwright-core contra `/usr/bin/google-chrome`, en `es-ES` y con la zona `America/Los_Angeles`. La API ya está parada.

Directorio: `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/b8198d5c-1532-4e07-b194-531713ff51fc/scratchpad/shots/`

| Variante | Con datos | Sin datos | Tooltip de consumo |
|---|---|---|---|
| Escritorio 1440 claro | `desktop-light-data.png` | `desktop-light-empty.png` | `desktop-light-tooltip.png` |
| Escritorio 1440 oscuro | `desktop-dark-data.png` | `desktop-dark-empty.png` | `desktop-dark-tooltip.png` |
| 1024 claro | `1024-light-data.png` | `1024-light-empty.png` | `1024-light-tooltip.png` |
| Móvil 375 claro | `mobile-375-light-data.png` | `mobile-375-light-empty.png` | `mobile-375-light-tooltip.png` |
| Móvil 375 oscuro | `mobile-375-dark-data.png` | `mobile-375-dark-empty.png` | `mobile-375-dark-tooltip.png` |

- **Desbordamiento horizontal:** 0 px en las 10 páginas.
- **Cifras leídas del DOM:** «14.391 km», «5,88 L/100 km», «0,091 €/km», «0,056 €/km» y «20.877,71 €». Sin datos: «—» ×4 y «0,00 €».
- **Errores:** ninguno en la consola.
- **Script e informe:** el script es `…/scratchpad/pw/shots.mjs` (siembra en `…/scratchpad/pw/seed.mjs`) y el informe, `…/scratchpad/shots/report.json`.
- **Cabecera en móvil:** en las capturas a 375 px aparece la cabecera fija de la app encima de la tarjeta. Es un artefacto de la captura por elemento, no un problema de la sección.

Retoques tras revisar las capturas:
- La leyenda de «Gasto por mes» pintaba cada texto con el color de su serie. «Mantenimiento» quedaba casi ilegible: menta claro en modo claro y verde muy oscuro en modo oscuro. Ahora el texto usa `--color-foreground`.
- La línea de consumo pasa de `monotone` a `linear`, porque la curva suavizada sugería valores entre tramos que no existen.
- Observación: en oscuro, las barras de mantenimiento (`--accent-dark` #2e524b) tienen poco contraste con el fondo de la tarjeta, aunque se distinguen. Lo dejo así para seguir el diseño (colores de las variables CSS). Se puede ajustar si el humano lo pide.

## Verificación

`pnpm harness --full` (exit 0):

```
[OK]    27 features: 24 done, 2 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #25 vehicle-stats-web (in_progress)
[OK]    Rama actual: feat/vehicle-stats-web
[OK]    pnpm lint
[OK]    pnpm typecheck
packages/shared  Test Files 10 passed · Tests 75 passed
apps/api         Test Files 24 passed · Tests 194 passed
apps/web         Test Files 31 passed · Tests 244 passed
[OK]    pnpm test
[OK]    Arnés en verde.
```

## Desviaciones y decisiones menores

1. **`react-is` 19 como dependencia explícita.** pnpm no avisó, porque el peer `react-is` de Recharts lo satisfacía `react-is@17.0.2`, que llega por `pretty-format`, una dependencia de desarrollo de Testing Library. La versión 17 no reconoce los elementos de React 19 en `isFragment`, que es lo que usa Recharts, y el diseño ya preveía añadir este paquete. Se fija a la versión de React.
2. **Stub de `ResizeObserver` con tamaño.** En Recharts 3.10, `ResponsiveContainer` mide con `getBoundingClientRect()` al montarse si existe `ResizeObserver`. En jsdom esa medida es 0×0 y pisa `initialDimension`, así que con el stub vacío del diseño no se pintaba el SVG. El stub del test llama a su callback en `observe()` con un `contentRect` de 480×240. `initialDimension` se mantiene en el componente para el primer pintado.
3. **`figure` con `aria-labelledby`.** El cálculo de nombre accesible de Testing Library (y de algunos navegadores) no nombra el `figure` a partir de su `figcaption`. El enlace explícito garantiza `getByRole('figure', { name })`.
4. **Clave i18n `stats.metrics.totalCostHint_noPurchase`.** Es la variante de contexto de i18next para el desglose cuando no hay precio de compra (el diseño dice «compra (si la hay)»). Cuelga de `totalCostHint` y la paridad es/en sigue en verde.
5. **Etiquetas de coste por distancia con la unidad**: «Combustible por km» / «Mantenimiento por mi» (`{{unit}}` = `distanceUnit`). La redacción de todos los textos queda abierta a ajustes del humano (decisión 4 del diseño).
6. **Test extra** `leaves the purchase out of the total breakdown when there is no purchase price`, que cubre la rama de la desviación 4.
