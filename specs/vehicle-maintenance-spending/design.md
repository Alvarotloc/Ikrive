# Design — vehicle-maintenance-spending

Un endpoint de lectura en el módulo `maintenance` y una métrica más en el expediente de la ficha. Sin cambios de BD.

## Archivos

| Capa | Archivo | Cambio |
|---|---|---|
| shared | `packages/shared/src/schemas/maintenance.ts` | `maintenanceSpendingSchema = z.object({ total: z.number().min(0) })` + tipo `MaintenanceSpending`. |
| api | `apps/api/src/modules/maintenance/repository.ts` | `sumCost(vehicleId): number`. |
| api | `apps/api/src/modules/maintenance/service.ts` | `spending(userId, vehicleId): MaintenanceSpending` (reutiliza `requireVehicle`). |
| api | `apps/api/src/modules/maintenance/routes.ts` | `GET /vehicles/:id/maintenance/spending`. |
| test | `apps/api/test/maintenance.test.ts` | `describe('maintenance spending')`. |
| web | `apps/web/src/lib/query-keys.ts` | `vehicles.maintenanceSpending(id)`. |
| web | `apps/web/src/features/maintenance/queries.ts` | `maintenanceSpendingQuery(vehicleId)`. |
| web | `apps/web/src/features/maintenance/maintenance-spending.tsx` (nuevo) | `MaintenanceSpendingMetric({ vehicleId })`: `useSuspenseQuery` + `Metric` de `vehicles/dossier.tsx` + `format.money`. |
| web | `apps/web/src/features/maintenance/maintenance-spending.test.tsx` (nuevo) | Tests de componente. |
| web | `apps/web/src/routes/_app/vehicles/$vehicleId/index.tsx` | Precargar `maintenanceSpendingQuery` en el loader y montar la métrica como cuarta del expediente. |
| i18n | `apps/web/src/i18n/locales/{es,en}.json` | `vehicles.metrics.maintenanceSpending`: «Gasto en mantenimiento» / «Maintenance spending». |

## Base de datos

Sin cambios ni migración. La suma se hace en SQLite:

```ts
sumCost(vehicleId: string): number {
  return db
    .select({ total: sql<number>`total(${maintenanceRecords.cost})` })
    .from(maintenanceRecords)
    .where(eq(maintenanceRecords.vehicleId, vehicleId))
    .get()?.total ?? 0;
}
```

`total()` de SQLite ignora los `NULL` y devuelve `0.0` si no hay filas (a diferencia de `sum()`, que devuelve `NULL`). Usa el índice existente `maintenance_records_vehicle_id_date_idx`.

## Contrato HTTP

| Método y ruta | Éxito | Errores |
|---|---|---|
| `GET /api/vehicles/:id/maintenance/spending` | 200 `{ total: number }` | 401 sin sesión · 404 `Vehicle not found` (vehículo inexistente o ajeno) |

- `preHandler: app.authenticate` (ya puesto a nivel de plugin); `params: idParamSchema`; `response: { 200: maintenanceSpendingSchema }`.
- La ruta estática `/maintenance/spending` convive con `/maintenance/:recordId`: find-my-way da prioridad a los segmentos estáticos, y los `recordId` son UUID. Se registra antes de la paramétrica por legibilidad.
- Servicio: `requireVehicle(userId, vehicleId)` → `{ total: Math.round(repo.sumCost(vehicleId) * 100) / 100 }`.

## Impacto en UI

- `MaintenanceSpendingMetric` vive en `features/maintenance` (el dato es de ese dominio) y reutiliza `Metric` de `features/vehicles/dossier.tsx`. No depende de TanStack Router, así que se prueba sin la ruta.
- Ficha: la rejilla de métricas pasa de `sm:grid-cols-3` a `sm:grid-cols-2 xl:grid-cols-4` para alojar la cuarta sin estrechar las cifras; en móvil sigue una columna. Valor: `format.money(total)` (`useFormat`, que ya usa `settings.currency` y el idioma). Cero se muestra como importe («0,00 €»), no «—»: es un dato conocido, no ausente.
- Carga: el loader hace `ensureQueryData(maintenanceSpendingQuery(id))` junto a las demás; un 404 sigue cayendo en `VehicleNotFound` y cualquier otro error en el error boundary de la ruta, como hoy.
- **Refresco tras crear/editar/borrar**: la clave `['vehicles', 'detail', id, 'maintenance', 'spending']` cuelga de `queryKeys.vehicles.all`, que ya invalidan `useCreateMaintenance`, `useUpdateMaintenance` y `useDeleteMaintenance` (`useMaintenanceMutation`). No hace falta tocar las mutaciones. Al estar bajo `maintenance(id)`, también se refresca si en el futuro solo se invalida esa rama.
- Modo oscuro y móvil: `Metric` ya los resuelve; se revisa con capturas.

## Alternativas descartadas

- **Calcular el total en la web sumando `maintenanceQuery`** (la lista ya está cargada): el acceptance pide que lo exponga la API, y el informe/estadísticas de las fases 5–6 necesitarán el dato en el servidor.
- **Campo `maintenanceSpending` en el DTO `Vehicle`**: obligaría a calcularlo en `GET /vehicles` para cada vehículo de la lista (o a tener dos DTO) y acopla el módulo `vehicles` con `maintenance`.
- **Guardar el coste en céntimos (entero)**: evitaría el error de coma flotante, pero exige migrar la columna `real` y cambiar el contrato de la feature 4 y el formulario web. Con importes de ≤2 decimales, redondear el total a 2 decimales basta.
- **`GET /api/vehicles/:id/spending` genérico** (que la fase 5 ampliaría con combustible): anticipa un diseño de la fase 5 que aún no tiene spec.

## Decisiones a validar (Gate 1)

1. Ruta `GET /api/vehicles/:id/maintenance/spending` con cuerpo `{ total }` (sin moneda: la web ya la tiene en `user_settings`).
2. Se suman **todos** los mantenimientos con coste, también los de `includeInReport: false` (ese flag solo afecta al informe de la fase 6).
3. `total` se redondea a 2 decimales. Monedas de 3 decimales (p. ej. BHD) perderían el tercero; el formulario web ya solo admite 2.
4. Cambiar `user_settings.currency` no convierte importes: el total se muestra con la moneda nueva, igual que `purchasePrice`.
5. Total 0 se muestra como «0,00 €», no «—».

## Riesgos

- Colisión `spending` ↔ `:recordId`: cubierta por un test que pide `/maintenance/spending` y recibe el total (no un 404 de registro).
- La rejilla de 4 métricas en anchos intermedios: se valida con capturas a 375 px, ~1024 px y escritorio.

## Fuera de alcance

Gasto de combustible y coste total de propiedad (fase 5), gasto por categoría o por año y coste por km (fase 5), uso de `includeInReport` (fase 6), conversión de monedas.
