# Implementación — fuel-logs-web (#23)

Rama `feat/fuel-logs-web`. Solo se ha tocado `apps/web`: la API, la BD y `packages/shared` siguen igual.

## Cambios por archivo

| Archivo | Cambio |
|---|---|
| `apps/web/src/features/fuel/fuel.ts` (nuevo) | Lógica pura: `FUEL_VALUE_FIELDS`, `FUEL_FRACTION_DIGITS` (3/2/3), `parseFuelNumber` (un único `.`/`,` es siempre decimal; `format`/`fraction` como errores), `sortFuelLogs` (fecha, km y `createdAt`, todos descendentes, sin mutar la entrada), `computeThirdValue` (precios con `resolveFuelPrices` y cantidad redondeada a 3) y `formatInputNumber` (sin separador de miles, como mucho 3 decimales). |
| `apps/web/src/features/fuel/fuel.test.ts` (nuevo) | Tests unitarios de lo anterior. |
| `apps/web/src/features/fuel/form.ts` (nuevo) | `fuelNumber(digits)`, `fuelFormSchema` (con los límites de `createFuelLogSchema`, `superRefine` de «dos de tres» y `transform` que completa el valor que falta), `defaultsFrom({ log, lastOdometer })` (precarga los valores con `formatInputNumber` en el idioma activo) y `formErrorFor`. |
| `apps/web/src/features/fuel/form.test.ts` (nuevo) | Tests de esquema, valores por defecto y mapeo de errores. |
| `apps/web/src/features/fuel/queries.ts` (nuevo) | `fuelLogsQuery`, `useCreateFuelLog`, `useUpdateFuelLog` y `useDeleteFuelLog`. Las mutaciones invalidan `queryKeys.vehicles.all`. |
| `apps/web/src/features/fuel/use-fuel-format.ts` (nuevo) | `useFuelFormat(fuelType)`: unidad con `fuelQuantityUnit` y `settingsQuery`, etiqueta, `quantity()` («40,125 L») y `pricePerUnit()` («1,459 €/L», de 2 a 3 decimales). |
| `apps/web/src/features/fuel/fuel-log-form.tsx` (nuevo) | `FuelLogFormDialog` para alta y edición. Lleva el cálculo en vivo con el estado `computed` y la marca «Calculado» (`aria-describedby`), los km propuestos con la lectura de referencia, la pista de recálculo en edición, `inputMode`/`enterKeyHint`, `POST`/`PATCH`, toast y cierre al guardar, y `formErrorFor` → `setError`. |
| `apps/web/src/features/fuel/fuel-log-form.test.tsx` (nuevo) | Tests de componente del formulario. |
| `apps/web/src/features/fuel/fuel-logs-section.tsx` (nuevo) | `FuelLogsSection` (lista ordenada, vacío, alta solo si el vehículo está activo, edición) y `DeleteFuelLogDialog` (`AlertDialog`, toast de éxito o de error). No depende de TanStack Router. |
| `apps/web/src/features/fuel/fuel-logs-section.test.tsx` (nuevo) | Tests de componente de la sección. |
| `apps/web/src/lib/query-keys.ts` | `vehicles.fuelLogs(id)`. |
| `apps/web/src/routes/_app/vehicles/$vehicleId/index.tsx` | El loader precarga `fuelLogsQuery`, y `<FuelLogsSection>` va entre la rejilla de 2 columnas y `SchedulesSection`. |
| `apps/web/src/i18n/locales/{es,en}.json` | Namespace `fuel.*` (con `maxDecimals_one/_other`). |
| `apps/web/src/i18n/locales.test.ts` | `defines a label for every fuel quantity unit`. |

## Trazabilidad

Abreviaturas: FU = `features/fuel/fuel.test.ts`, FO = `features/fuel/form.test.ts`, FF = `features/fuel/fuel-log-form.test.tsx`, FS = `features/fuel/fuel-logs-section.test.tsx`, LO = `i18n/locales.test.ts`.

| R | Tests |
|---|---|
| R1 | FS › lists the vehicle's fuel logs newest first · montaje en la ruta: typecheck + capturas `*-page.png` |
| R2 | FU › sorts logs by date, odometer and creation date descending · FS › lists the vehicle's fuel logs newest first |
| R3 | FS › shows date, km, quantity, prices and full tank of each log · FS › shows quantities in kWh for electric vehicles |
| R4 | FS › shows the empty message when there are no logs |
| R5 | FS › shows the add button only for active vehicles |
| R6 | FO › defaults a new log to today, full tank and the last odometer · FF › opens with today, full tank and the last odometer proposed · FS › opens the add form when the button is pressed |
| R7 | FO › defaults a new log to today, full tank and the last odometer · FF › opens with today, full tank and the last odometer proposed · FF › leaves the odometer empty when the vehicle has no readings |
| R8 | FU › computes the price per unit / total price / quantity rounded to … · FO › completes the missing value on parse · FF › computes the third value from any two |
| R9 | FF › recomputes the computed value when a source changes · FF › keeps a value the user types over the computed one |
| R10 | FO › requires two of the three values · FF › asks for two of the three values without calling the API |
| R11 | FO › rejects non-positive values and a non-integer odometer · FF › shows field errors without calling the API when values are invalid |
| R12 | FU › treats a single dot or comma as the decimal separator · FU › round-trips formatted input numbers through parseFuelNumber · FO › parses a single separator as decimal in every value · FF › creates a log, closes the dialog and shows a toast («1.459» → `quantity: 1.459`) |
| R13 | FF › labels quantity in kWh for electric vehicles and in the volume unit otherwise |
| R14 | FF › creates a log, closes the dialog and shows a toast |
| R15 | FF › uses mobile keyboards · capturas a 375 px |
| R16 | FO › prefills the form from a log · FF › prefills the form and sends every field with PATCH when editing · FS › opens the form prefilled when editing a log |
| R17 | FF › prefills the form and sends every field with PATCH when editing |
| R18 | FS › deletes a log only after confirming |
| R19 | FF › invalidates the vehicle queries after saving · FS › deletes a log only after confirming (`vehicles.detail` invalidado y 2 `GET` de la lista) |
| R20 | FO › maps a 409 problem to the odometer field · FF › shows the odometer conflict on the km field and keeps the dialog open on 409 · captura `*-form-km-error.png` (409 real) |
| R21 | FO › maps a 400 problem without errors to the date field · FF › shows the future-date error on the date field on a 400 without errors |
| R22 | FO › maps any other error to the generic message · FF › shows the generic error when saving fails for another reason · FS › shows the generic error when deleting fails |
| R23 | LO › es and en define the same keys · LO › defines a label for every fuel quantity unit |
| R24 | Capturas (abajo). Desbordamiento horizontal medido con playwright: 0 px en la página, en la sección y en los dos diálogos, en las 4 variantes. |
| R25 | FU › rejects more than one separator or other characters · FO › flags several separators as an invalid number · FF › rejects several separators and too many decimals without calling the API |
| R26 | FU › rejects more fraction digits than allowed · FO › flags too many decimals with the field maximum · FF › rejects several separators and too many decimals without calling the API |
| R27 | FF › shows the recompute hint only when editing · FF › recomputes a value the user clears when editing |
| R28 | FF › does not refill the computed value when the user clears it · FF › keeps a value the user types over the computed one · FF › computes again after the user changes a source |

## Capturas (T15)

Stack aislado para no tocar la BD de desarrollo del humano:

- API en `:3100`, con `DATA_DIR` en el scratchpad.
- Vite en `:5175` con `strictPort`, `cacheDir` en el scratchpad y proxy a `:3100`. Usa un config temporal `apps/web/vite.shots.tmp.config.ts`, que ya está borrado.
- playwright-core contra `/usr/bin/google-chrome`, instalado en el scratchpad.

Datos sembrados: cuenta `shots@ikrive.test` (solo en la BD del scratchpad), un Seat León de gasolina con 4 repostajes y una lectura manual posterior. El error de km es un 409 real: se edita el repostaje del 15 ago 2026 con 125.000 km cuando hay una lectura posterior de 121.000. Los dos servidores están parados.

Directorio: `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/1254209e-a374-4ab7-9341-dd3c2150a64b/scratchpad/shots/`

| Variante | Ficha completa | Sección | Alta con valor calculado | Edición con error de km |
|---|---|---|---|---|
| Claro 1280 | `light-page.png` | `light-fuel-section.png` | `light-form-computed.png` | `light-form-km-error.png` |
| Oscuro 1280 | `dark-page.png` | `dark-fuel-section.png` | `dark-form-computed.png` | `dark-form-km-error.png` |
| Móvil 375 claro | `mobile-375-page.png` | `mobile-375-fuel-section.png` | `mobile-375-form-computed.png` | `mobile-375-form-km-error.png` |
| Móvil 375 oscuro | `mobile-375-dark-page.png` | `mobile-375-dark-fuel-section.png` | `mobile-375-dark-form-computed.png` | `mobile-375-dark-form-km-error.png` |

Scripts: `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/1254209e-a374-4ab7-9341-dd3c2150a64b/scratchpad/pw/shots.mjs` y `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/1254209e-a374-4ab7-9341-dd3c2150a64b/scratchpad/pw/section.mjs`.

## Verificación

`pnpm harness --full`:

```
[OK]    26 features: 22 done, 3 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #23 fuel-logs-web (in_progress)
[OK]    Rama actual: feat/fuel-logs-web
[OK]    pnpm lint
[OK]    pnpm typecheck
packages/shared  Test Files 9 passed · Tests 60 passed
apps/api         Test Files 23 passed · Tests 190 passed
apps/web         Test Files 29 passed · Tests 234 passed
[OK]    pnpm test
[OK]    Arnés en verde.
```

## Desviaciones y notas

- **Sin desviaciones de diseño.** Hay un añadido menor: `FUEL_VALUE_FIELDS` se exporta desde `fuel.ts` para no repetir la lista de los tres campos en el esquema y en el formulario.
- **Tests de más**, todos dentro del alcance:
  - FF › `leaves the odometer empty when the vehicle has no readings`.
  - FF › `keeps a value the user types over the computed one` (paso 1 del algoritmo de `design.md`).
  - FS › `opens the add form when the button is pressed`.
- ~~**Comportamiento literal del algoritmo de cálculo.**~~ Resuelto en T17 (cambio pedido en Gate 2, R28); ver la sección siguiente.
- **Mensaje de error con valor 0.** Un valor 0 en cantidad o precio muestra el mensaje global de zod «El valor no es válido.» (`too_small` no inclusivo). Cumple R11, porque el error sale junto al campo, pero el texto es genérico. Mejorarlo exigiría tocar `i18n/zod.ts`, que está fuera de alcance.
- La referencia «Última lectura» solo se muestra en alta (R7). En edición no aparece.

## T17 — No rellenar el valor calculado que el usuario borra (R28)

- `apps/web/src/features/fuel/fuel-log-form.tsx`: en `onValueChange`, si el campo editado es el `computed`, se pone `computed = null` y se termina ahí (paso 1 de `design.md`). Además, una `useRef` `userOwned` recuerda ese campo: mientras el usuario siga editándolo, tampoco se ejecutan los pasos 2 y 3. Se limpia en cuanto cambia otro de los tres valores.
- `apps/web/src/features/fuel/fuel-log-form.test.tsx`: tests nuevos `does not refill the computed value when the user clears it` (borra con `{Backspace}` hasta vaciar; sigue vacío y sin «Calculado») y `computes again after the user changes a source` (tras borrarlo con retroceso, cambiar la cantidad lo recalcula y vuelve «Calculado»). `keeps a value the user types over the computed one` ya existía y sigue en verde. Los de R27 (`recomputes a value the user clears when editing`, `shows the recompute hint only when editing`) también.
- **Desviación menor (mecanismo, no comportamiento).** El paso 1 tal como está escrito («en ese mismo cambio no se ejecutan los pasos 2 y 3») no basta con retroceso. El primer retroceso deja `computed = null`, pero el último deja el campo vacío con los otros dos válidos, y el paso 3 lo rellena otra vez. Lo comprobé con el test nuevo, que falla solo con el paso 1. La `useRef` `userOwned` implementa lo que el mismo párrafo del design y R28 exigen («Se volverá a calcular cuando el usuario cambie uno de los otros dos»). R27 no cambia: en edición `userOwned` empieza en `null`, así que vaciar un campo lo recalcula.
- `pnpm harness --full`: en verde (lint, typecheck; shared 60, api 190, web 234 tests).
