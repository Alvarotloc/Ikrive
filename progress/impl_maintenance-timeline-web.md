# Implementación: maintenance-timeline-web (#6)

Rama `feat/maintenance-timeline-web`. Sin commits: los hace el leader después de Gate 2. Las 14 tasks están marcadas en `specs/maintenance-timeline-web/tasks.md`. Solo se ha tocado `apps/web` (la API, la BD y `packages/shared` no cambian).

## Cambios por archivo

| Archivo | Cambio |
|---|---|
| `apps/web/src/features/maintenance/timeline.ts` (nuevo) | `sortRecords`, `availableCategories`, `resolveFilter`, `filterRecords`, `groupByYear` y `recordDetails` (lógica pura). |
| `apps/web/src/features/maintenance/timeline.test.ts` (nuevo) | 6 tests unitarios. |
| `apps/web/src/features/maintenance/form.ts` (nuevo) | `maintenanceFormSchema` (campos de `createMaintenanceRecordSchema.shape`; km y coste pasan por `parseInteger`/`parseDecimal`), `defaultsFrom` y `formErrorFor`. |
| `apps/web/src/features/maintenance/form.test.ts` (nuevo) | 7 tests unitarios. |
| `apps/web/src/features/maintenance/queries.ts` (nuevo) | `maintenanceQuery`, `useCreateMaintenance`, `useUpdateMaintenance` y `useDeleteMaintenance`. Las tres mutaciones invalidan `queryKeys.vehicles.all`. |
| `apps/web/src/features/maintenance/maintenance-form.tsx` (nuevo) | `MaintenanceFormDialog`: un `Dialog` controlado con react-hook-form y `zodResolver`; hace `POST` o `PATCH` según el modo y lleva el error de la API a km, fecha o raíz. |
| `apps/web/src/features/maintenance/maintenance-form.test.tsx` (nuevo) | 8 tests de componente. |
| `apps/web/src/features/maintenance/maintenance-timeline.tsx` (nuevo) | `MaintenanceSection` (Card con cabecera y botón de alta solo para vehículos activos, chips con `aria-pressed`, grupos por año, filas con `Badge variant="stamp"`) y `DeleteMaintenanceDialog` (`AlertDialog`; si falla, `toast.error`). |
| `apps/web/src/features/maintenance/maintenance-timeline.test.tsx` (nuevo) | 9 tests de componente. |
| `apps/web/src/lib/query-keys.ts` | `vehicles.maintenance(id)`. |
| `apps/web/src/routes/_app/vehicles/$vehicleId/index.tsx` | El loader precarga `maintenanceQuery`. `<MaintenanceSection vehicle={vehicle} />` va a ancho completo entre la rejilla de 2 columnas y «Gestión». |
| `apps/web/src/i18n/locales/{es,en}.json` | Namespace `maintenance.*`, con las claves que lista `design.md`. |
| `apps/web/src/i18n/locales.test.ts` (nuevo) | 2 tests: paridad de claves es/en y etiqueta para cada categoría. |

## Trazabilidad R → test

Abreviaturas: `TL` = `features/maintenance/timeline.test.ts`, `FO` = `features/maintenance/form.test.ts`, `MF` = `features/maintenance/maintenance-form.test.tsx`, `MT` = `features/maintenance/maintenance-timeline.test.tsx`, `LO` = `i18n/locales.test.ts`.

| Req | Tests |
|---|---|
| R1 | MT › loads the vehicle's records and lists them newest first grouped by year · montaje en la ruta: typecheck + capturas |
| R2 | TL › sorts records by date and creation date descending · MT › loads the vehicle's records and lists them newest first grouped by year |
| R3 | TL › groups records by year in descending order · MT › loads the vehicle's records… |
| R4 | TL › lists only present categories in MAINTENANCE_CATEGORIES order · MT › offers only the present categories and filters the timeline |
| R5 | TL › filters records by category · MT › offers only the present categories and filters the timeline |
| R6 | TL › falls back to all when the selected category has no records · MT › falls back to all when the filtered category loses its last record |
| R7 | MT › shows each category with the stamp badge and the record details · LO › defines a label for every maintenance category |
| R8 | TL › formats details skipping missing odometer, workshop and cost · MT › shows each category with the stamp badge and the record details |
| R9 | MT › shows the empty message without filter when there are no records |
| R10 | MF › creates a record, closes the dialog and shows a toast |
| R11 | FO › turns blank odometer and cost into null · FO › parses Spanish and English cost notation · MF › creates a record… (cuerpo con `cost: 1234.56` y `odometer: null`) |
| R12 | FO › rejects an empty title and a non-numeric odometer · MF › shows field errors without calling the API when the form is invalid |
| R13 | FO › prefills the form from a record · MF › prefills the form with the record when editing · MT › opens the form prefilled when editing a record |
| R14 | MF › sends every field with PATCH and a blank odometer as null when editing |
| R15 | MT › deletes a record only after confirming |
| R16 | FO › maps a 409 problem to the odometer field · MF › shows the odometer conflict on the km field and keeps the dialog open on 409 · captura `*-form-km-error.png` |
| R17 | FO › maps a 400 problem without errors to the date field · MF › shows the future-date error on the date field on a 400 without errors |
| R18 | FO › maps any other error to the generic message · MF › shows the generic error when saving fails for another reason · MT › shows the generic error when deleting fails |
| R19 | MF › invalidates the vehicle queries after saving · MT › deletes a record only after confirming (la lista se vuelve a pedir: 2 `GET`) |
| R20 | LO › es and en define the same keys |
| R21 | Capturas en claro, oscuro y a 375 px (abajo). Desbordamiento horizontal medido con playwright: 0 px en la página y en el diálogo, en las 4 variantes. |
| R22 | MT › shows the add button only for active vehicles |

## Capturas (T11)

Hechas con un stack propio: API en `:3100` con `DATA_DIR` en el scratchpad, Vite en `:5175` con `cacheDir` en el scratchpad y playwright-core contra `/usr/bin/google-chrome`. Hay 6 mantenimientos sembrados en 3 años y 2 lecturas manuales. El error de km sale de un 409 real: se edita «Pastillas delanteras» (2024-11-20) con 130.000 km cuando hay una lectura posterior de 128.000.

Directorio: `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/158e5d9d-8005-426d-8c78-deba225d763e/scratchpad/shots/`

| Variante | Ficha completa | Timeline | Filtro «Aceite» | Formulario con error de km |
|---|---|---|---|---|
| Claro 1280 | `light-page.png` | `light-timeline.png` | `light-filter-oil.png` | `light-form-km-error.png` |
| Oscuro 1280 | `dark-page.png` | `dark-timeline.png` | `dark-filter-oil.png` | `dark-form-km-error.png` |
| Móvil 375 claro | `mobile-375-page.png` | `mobile-375-timeline.png` | `mobile-375-filter-oil.png` | `mobile-375-form-km-error.png` |
| Móvil 375 oscuro | `mobile-375-dark-page.png` | `mobile-375-dark-timeline.png` | `mobile-375-dark-filter-oil.png` | `mobile-375-dark-form-km-error.png` |

Ajustes hechos al revisar las capturas:
- **Filas en móvil:** con `grid-cols-[auto_1fr_auto]` fijo, el badge se comía el ancho y los títulos se partían a mitad de palabra. Ahora en móvil el badge va encima del título (`grid-cols-[1fr_auto]`) y desde `sm` se recupera la fila de 3 columnas del diseño.
- **Formulario:** se añade `items-start` a las rejillas de 2 columnas, porque al aparecer el error de km el campo de fecha se estiraba y quedaba desalineado.

Script de las capturas: `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/158e5d9d-8005-426d-8c78-deba225d763e/scratchpad/pw/shots.mjs`.

## Verificación

`pnpm harness --full`:

```
[OK]    9 features: 6 done, 2 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #6 maintenance-timeline-web (in_progress)
[OK]    Rama actual: feat/maintenance-timeline-web
[OK]    pnpm lint
[OK]    pnpm typecheck
packages/shared  Tests  11 passed (11)
apps/api         Tests  40 passed (40)
apps/web         Test Files  8 passed (8)  Tests  50 passed (50)
[OK]    pnpm test
[OK]    Arnés en verde.
```

## Desviaciones y decisiones de implementación

1. **`useUpdateMaintenance(vehicleId)`** recibe `{ recordId, changes }` como variables de la mutación, en lugar de fijar `recordId` en el hook. El diálogo usa el mismo componente para alta y edición, y los hooks no se pueden llamar de forma condicional. Las firmas de las queries no están fijadas en `design.md`.
2. **`maintenanceFormSchema`** usa `shape.odometer.unwrap()` y `shape.cost.unwrap()` dentro de `.pipe()`. Con `shape.odometer` tal cual, `tsc` rechaza el pipe, porque la entrada `number | null | undefined` no admite la salida `number | null` del transform. Se quita solo el `optional()` y se mantienen los límites del esquema compartido.
3. **La `Card` de «Mantenimientos» se renderiza dentro de `MaintenanceSection`**, no en la ruta. Así el título y el botón de alta (con su condición de estado) quedan en el componente que se testea, y la ruta solo lo coloca a ancho completo.
4. **Toasts en los tests:** sonner guarda los toasts en un store de módulo y se los vuelve a pasar a cada `Toaster` nuevo. Los dos ficheros `*.test.tsx` llaman a `toast.dismiss()` en `afterEach`. No se ha tocado `src/test/setup.ts`.
5. **Filtro:** cuando `resolveFilter` cae a «Todas», el estado local también se pone a `'all'`. Si no, el filtro volvería a la categoría antigua al crear un registro nuevo de ella.
6. **Mensajes de validación del cliente:** son los de zod por defecto (en inglés), igual que en `vehicle-form.tsx`. El spec no pide traducirlos.

## Incidencia durante T11 (el humano debe saberla)

El primer intento de capturas arrancó Vite en `:5174` sin `strictPort`. Ese puerto ya lo tenía un `pnpm dev` de ikrive del humano, que hace de proxy a su API en `:3000`. Por eso el sembrado acabó en **su BD de desarrollo**: se creó la cuenta `demo@ikrive.test` / `password123`, un vehículo «Seat León» con 2 lecturas y 6 mantenimientos.

- Ya borrado: el vehículo, vía `DELETE /api/vehicles/:id` (se lleva sus lecturas y mantenimientos). Se comprobó que la lista quedó vacía.
- Pendiente: la cuenta `demo@ikrive.test` sigue en esa BD (no hay endpoint para borrar usuarios). Se puede eliminar a mano si molesta.
- Ese intento también provocó un «Re-optimizing dependencies» de Vite sobre el `node_modules/.vite` compartido. El Vite del humano en `:5174` puede servir 504 «Outdated Optimize Dep» hasta que recargue la página o reinicie `pnpm dev`.

No se tocaron más procesos del humano: los de `:3000`, `:5173` y `:5174` siguen arrancados. Los servidores propios (`:3100`, `:5175`) están parados.
