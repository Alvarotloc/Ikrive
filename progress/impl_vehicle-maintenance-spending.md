# Implementación — vehicle-maintenance-spending

Rama `feat/vehicle-maintenance-spending`. Sin commits (los hace el leader tras Gate 2). Tasks T1–T13 marcadas en `specs/vehicle-maintenance-spending/tasks.md`. Sin cambios de BD ni migración.

## Cambios por archivo

| Archivo | Cambio |
|---|---|
| `packages/shared/src/schemas/maintenance.ts` | `maintenanceSpendingSchema` (`{ total: z.number().min(0) }`) y tipo `MaintenanceSpending`. |
| `apps/api/src/modules/maintenance/repository.ts` | `sumCost(vehicleId)` con `total(cost)` de SQLite (ignora `NULL`, 0.0 sin filas). |
| `apps/api/src/modules/maintenance/service.ts` | `spending(userId, vehicleId)`: `requireVehicle` + `Math.round(sum * 100) / 100`. |
| `apps/api/src/modules/maintenance/routes.ts` | `GET /vehicles/:id/maintenance/spending` (`idParamSchema`, respuesta `maintenanceSpendingSchema`), registrada antes de `/:recordId`. |
| `apps/api/test/maintenance.test.ts` | Atajo `spending()` en `client` y `describe('maintenance spending')` con 3 tests. |
| `apps/web/src/lib/query-keys.ts` | `vehicles.maintenanceSpending(id)` → `['vehicles', 'detail', id, 'maintenance', 'spending']`. |
| `apps/web/src/features/maintenance/queries.ts` | `maintenanceSpendingQuery(vehicleId)`. Mutaciones sin tocar (ya invalidan `vehicles.all`). |
| `apps/web/src/features/maintenance/maintenance-spending.tsx` (nuevo) | `MaintenanceSpendingMetric({ vehicleId })`: `useSuspenseQuery` + `Metric` + `format.money`. |
| `apps/web/src/features/maintenance/maintenance-spending.test.tsx` (nuevo) | 3 tests de componente. |
| `apps/web/src/features/maintenance/maintenance-form.test.tsx` | `invalidates the vehicle queries after saving` siembra y comprueba también `maintenanceSpending('v1')`. |
| `apps/web/src/routes/_app/vehicles/$vehicleId/index.tsx` | Loader precarga `maintenanceSpendingQuery`; cuarta métrica; rejilla `sm:grid-cols-2 xl:grid-cols-4`. |
| `apps/web/src/i18n/locales/{es,en}.json` | `vehicles.metrics.maintenanceSpending`: «Gasto en mantenimiento» / «Maintenance spending». |

## Trazabilidad

MS = `apps/api/test/maintenance.test.ts › maintenance spending`; MSM = `apps/web/src/features/maintenance/maintenance-spending.test.tsx › MaintenanceSpendingMetric`; MF = `apps/web/src/features/maintenance/maintenance-form.test.tsx › MaintenanceFormDialog`.

| R | Prueba |
|---|---|
| R1 | MS › sums the costs of the vehicle's records (10.1 + 20.2 + `null`, otro vehículo con 500 no cuenta → `{ total: 30.3 }`; tras PATCH → 35.75; tras DELETE → 15.55) |
| R2 | MS › returns zero without records with cost (sin registros y con uno sin coste → `{ total: 0 }`) |
| R3 | MS › sums the costs of the vehicle's records (`30.3`, no `30.299999999999997`) |
| R4 | MS › hides other users' spending (vehículo ajeno e id inexistente → 404 `application/problem+json`, `Vehicle not found`; sin sesión → 401) |
| R5 | MSM › shows the spending in the user's currency (USD, sin «€») · montaje en la ficha: typecheck + capturas |
| R6 | MSM › shows zero as an amount («0,00 €», sin «—») · capturas `*-zero.png` |
| R7 | MSM › refreshes the spending after deleting a record (métrica + `MaintenanceSection`, 489,90 € → 89,90 €) · MF › invalidates the vehicle queries after saving (`maintenanceSpending('v1')` invalidada) |
| R8 | `apps/web/src/i18n/locales.test.ts › es and en define the same keys` |

## Capturas (T12)

Stack aislado sin tocar el `pnpm dev` del humano (:3000/:5173): SPA compilada con `vite build --outDir` en el scratchpad y servida por la API (`WEB_DIST_DIR`) en `127.0.0.1:3418`, con `DATA_DIR` en el scratchpad. Se siembra vía API un Seat León con 4 mantenimientos (3 con coste, total 11.685,25 €) y un Renault Clio sin mantenimientos (0,00 €). playwright-core contra `/usr/bin/google-chrome`, navegador `es-ES`. La API ya está parada.

Directorio: `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/d45fb03d-193c-4572-bbab-dd3de4e1ee1b/scratchpad/shots/`

| Ancho | Claro (gasto > 0 · 0) | Oscuro (gasto > 0 · 0) | Página completa |
|---|---|---|---|
| 1440 | `desktop-light-spending.png` · `desktop-light-zero.png` | `desktop-dark-spending.png` · `desktop-dark-zero.png` | `desktop-{light,dark}-spending-page.png` |
| 1024 | `1024-light-spending.png` · `1024-light-zero.png` | `1024-dark-spending.png` · `1024-dark-zero.png` | `1024-{light,dark}-spending-page.png` |
| 375 | `mobile-375-light-spending.png` · `mobile-375-light-zero.png` | `mobile-375-dark-spending.png` · `mobile-375-dark-zero.png` | `mobile-375-{light,dark}-spending-page.png` |

Desbordamiento horizontal de la página: 0 px en las 12 variantes. Texto de la métrica leído del DOM: «11.685,25 €» y «0,00 €». Script: `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/d45fb03d-193c-4572-bbab-dd3de4e1ee1b/scratchpad/pw/shots.mjs`. Informe: `…/scratchpad/shots/report.json`.

Observación: a 1024 px (rejilla 2×2) y en escritorio (4 columnas) la etiqueta «GASTO EN MANTENIMIENTO» ocupa dos líneas; la cifra no se estrecha ni se corta. En móvil, una columna. Sin cambios de maquetación más allá del diseño.

Nota de método: la API limita a 300 peticiones/min por IP (`@fastify/rate-limit`) y cada carga de la ficha hace ~51 (assets incluidos); el script espera 13 s entre navegaciones. El primer intento sin pausa recibió 429 y página en blanco.

## Verificación

`pnpm harness --full` (exit 0):

```
[OK]    12 features: 10 done, 1 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #8 vehicle-maintenance-spending (in_progress)
[OK]    Rama actual: feat/vehicle-maintenance-spending
[OK]    pnpm lint
[OK]    pnpm typecheck
packages/shared  Test Files 2 passed  · Tests 11 passed
apps/api         Test Files 8 passed  · Tests 45 passed
apps/web         Test Files 14 passed · Tests 107 passed
[OK]    pnpm test
[OK]    Arnés en verde.
```

## Desviaciones del spec

Ninguna.
