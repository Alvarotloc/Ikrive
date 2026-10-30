# Tasks — vehicle-stats-web

- [ ] T1 — Limpieza: borrar `const DAY_MS = 86_400_000;` sin usar de `packages/shared/src/domain/stats.ts` y comprobar que `pnpm lint` ya no da el warning de biome. Cubre: — (pedido en la descripción de la feature).
- [ ] T2 — `pnpm --filter @ikrive/web add recharts`, `vehicles.stats(id)` en `apps/web/src/lib/query-keys.ts` y `statsQuery` en `apps/web/src/features/stats/queries.ts`. Cubre: R1.
- [ ] T3 — `apps/web/src/features/stats/format.ts` (`createStatsFormatters`) y `use-stats-format.ts` (`useStatsFormat(fuelType)`), con `fuelQuantityUnit` + `fuel.units.*` para la unidad de cantidad. Cubre: R14, R15, R16, R17.
- [ ] T4 — Tests en `apps/web/src/features/stats/format.test.ts`:
  - `formats numbers with the locale separators` (es / en).
  - `formats consumption with the quantity and distance units` («6,5 L/100 km», «4.2 gal/100 mi», «18 kWh/100 km», máx. 2 decimales).
  - `formats the cost per distance in the user's currency` (EUR y USD, entre 2 y 3 decimales, `/km` y `/mi`).
  - `formats months and dates in UTC with the user's locale` (`'2025-01'` y `'2025-03-01'` sin desplazarse).

  Cubre: R14, R15, R16, R17.
- [ ] T5 — Namespace `stats.*` en `apps/web/src/i18n/locales/es.json` y `en.json`, con los textos de cifras, gráficos, series, `pending.*` y `empty.*` del design. El test existente `es and en define the same keys` de `apps/web/src/i18n/locales.test.ts` tiene que seguir en verde. Cubre: R18, R3, R4, R5, R10, R11, R12, R13.
- [ ] T6 — `apps/web/src/features/stats/stats-charts.tsx`: `ChartFigure` (`figure` + `figcaption` y el estado vacío si la serie está vacía) y los cuatro gráficos. Ejes y tooltips se formatean con `useStatsFormat`, los colores salen de variables CSS y las categorías se traducen con `maintenance.categories.*`. Cubre: R6, R7, R8, R9, R10, R11, R12, R13, R17.
- [ ] T7 — `apps/web/src/features/stats/vehicle-stats-section.tsx` (`VehicleStatsSection`: Card, cinco `Metric` con «—» y el `hint` de lo que falta, desglose del coste total y los gráficos de T6). Integrarlo en `apps/web/src/routes/_app/vehicles/$vehicleId/index.tsx`: `ensureQueryData(statsQuery)` en el loader y la sección entre `MaintenanceSection` y «Gestionar». Cubre: R1, R2, R3, R4, R5.
- [ ] T8 — Test `shows the key figures in the user's units and currency` en `apps/web/src/features/stats/vehicle-stats-section.test.tsx`. Usa los ajustes `mi`/`gal`/`USD` y un vehículo de gasolina, y afirma las cinco cifras por su etiqueta, el desglose del coste total y que hace `GET /vehicles/v1/stats`. Incluye un caso eléctrico que muestra `kWh/100 mi`. Cubre: R1, R2, R14, R15, R16.
- [ ] T9 — Test `explains what is missing for each empty figure` en `vehicle-stats-section.test.tsx`. Con la respuesta de un vehículo sin datos (ratios `null`, gastos 0, series vacías), afirma «—» y el texto de `stats.pending.*` en km/año, consumo y los dos costes por distancia, y que el coste total muestra un importe. Cubre: R3, R4, R5.
- [ ] T10 — Tests en `vehicle-stats-section.test.tsx` (con `ResizeObserver` stubeado y `initialDimension`):
  - `renders the four charts when there is data`: cada `figure` por su nombre, sin estado vacío, y «Neumáticos» en el gráfico de categorías.
  - `explains what is missing for each empty chart`: cada `figure` muestra su texto de `stats.empty.*` y ningún SVG de Recharts.

  Cubre: R6, R7, R8, R9, R10, R11, R12, R13.
- [ ] T11 — Revisión visual con `pnpm dev` y playwright-core: capturas de la sección con datos y sin datos en claro, oscuro y móvil. Las rutas van en `progress/impl_vehicle-stats-web.md`. Cubre: R6, R7, R8, R9.
- [ ] T12 — Ejecutar `pnpm harness --full` y documentar trazabilidad en `progress/impl_vehicle-stats-web.md`. Cubre: R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R13, R14, R15, R16, R17, R18.
