# Review — #84 csv-import-parsers

**Veredicto:** APPROVED

Sexta revisión, sobre el último cambio de Gate 2 (R41 y T29). R41 se cumple en las tres posiciones, sus tests detectan el incumplimiento y `pnpm harness --full` termina con salida 0. El antiguo aviso del volumen 0 queda resuelto.

Rutas relativas a `packages/shared/src/csv-import/` salvo que se indique otra.

## Comprobación de R41 y T29

244 casos automáticos ejecutados con un script en el scratchpad que importa el código del repo, todos con el resultado esperado. Cada caso de error afirma fila, código, campo y los valores de la fila siguiente.

| Caso | Resultado |
|---|---|
| Volumen 0 (`0`, `0.0`, `0.00`, `0.000`, ` 0 `, `$0`, `0 €`) con total mayor que 0 (`60`, `0.01`, `$60`, `60 €`) en el primer, segundo o tercer combustible | `out_of_range` en `quantity`; la fila siguiente se importa |
| Lo mismo sin precio, con precio 0, sin nombre o tras un hueco de relleno | `out_of_range` en `quantity` |
| Coma decimal con `;` (`0,00` y `60,5`) y dos combustibles eléctricos | `out_of_range` en `quantity` |
| `Gasoline,1.5,60,0,Yes,LPG,0.8,16,20,Yes` | `out_of_range` en `quantity`; ya no da `parsed` con esa fila |
| Huecos `"",0,0,0,No` en primera, segunda o última posición | Se ignoran, con los totales correctos |
| Hueco con precio y con volumen y total a 0 o vacío | Se mantiene: `quantity: 40`, `totalPrice: 60` |
| Total 0 o vacío con precio válido | `quantity: 60`, `totalPrice: 76`, `pricePerUnit: 1.267` |
| R18: `2,,10` + `1,5,5` + `,3,3` | `quantity: 18`, `totalPrice: 28`, `pricePerUnit: 1.556`, `merged_fuels` |
| R19, también con volumen 0 | `mixed_fuel_units` en `quantity` |
| R39 en las tres posiciones | `missing_field` en `totalPrice` |
| R40 en las tres posiciones, también con total negativo y volumen 0 | `out_of_range` en el campo del negativo |
| Un solo combustible, con precio y total, solo precio o solo total | `parsed`, sin `merged_fuels` |

**Tests frente a mutaciones.** En una copia del módulo en el scratchpad, 7 de 8 mutaciones hacen fallar `drivvo.test.ts`: quitar la comprobación, cambiar el código, cambiar el campo, rechazar todo volumen 0, limitarla al primer combustible, exigir precio y saltar el combustible en lugar de dar error. Sobrevive la que solo rechaza totales de 1 o más (aviso 5); el código real sí rechaza `0.01`.

## Comprobación de R40 y T28 (quinta revisión)

94 casos automáticos ejecutados con un script en el scratchpad que importa el código del repo, todos con el resultado esperado. Cada caso de error afirma fila, código, campo y que la fila siguiente se importa.

| Caso | Resultado |
|---|---|
| Volumen, precio o total negativo en cada posición, con 2 y 3 combustibles (`-5`, `-0.01`, `-5.50`, `$-5`, `-5 €`) | `out_of_range` en el campo de ese valor; la fila siguiente se importa |
| `Gasoline,1.5,-5,40,Yes,LPG,0.8,16,20,Yes` | `out_of_range` en `totalPrice`; ya no da `parsed` con total 11 |
| Negativo con coma decimal, con precio 0 o vacío, en dos combustibles eléctricos y en un hueco sin nombre | `out_of_range` en su campo |
| Total 0 o vacío con precio válido | `quantity: 60`, `totalPrice: 76`, `pricePerUnit: 1.267` |
| R39: total y precio vacíos o 0, en cualquier posición | `missing_field` en `totalPrice` |
| R18: `2,,10` + `1,5,5` + `,3,3` | `quantity: 18`, `totalPrice: 28`, `pricePerUnit: 1.556`, `merged_fuels` |
| R19: electricidad con otro combustible, también con un negativo | `mixed_fuel_units` en `quantity` |
| Un solo combustible válido, solo con precio o con huecos a 0 | `parsed`, sin `merged_fuels` |
| Un solo combustible con un negativo | `out_of_range` en su campo, por el esquema |

**Tests frente a mutaciones.** En una copia del módulo en el scratchpad, cada una de estas 7 mutaciones hace fallar al menos un caso de `drivvo.test.ts`: quitar la comprobación, quitarla solo en volumen, solo en precio o solo en total, fijar el campo del error, cambiar el código y rechazar también el 0.

## Comprobación de los cambios anteriores de Gate 2 (cuarta revisión)

85 casos ejecutados con un script en el scratchpad que importa el código del repo, todos con el resultado esperado.

### R11: miles en importes y cantidades (`values.ts:59`)

| Caso | Resultado |
|---|---|
| `$1,200`, `1,200 €`, `£1.200`, `1,200`, `1.200` como único importe | `needs_options` con `decimalSeparator` y sin filas |
| `1,200,000`, `1.200.000`, `$12,345,678` | `needs_options`, también con otra celda que pruebe el separador |
| `10.881` con `58.89` | `parsed`, `quantity: 10.881`, `totalPrice: 58.89` |
| Lo mismo con coma (`10,881` con `58,89`) | `parsed`, separador `,` |
| Todo a tres decimales (`6.199`, `61.833`, `10.881`) | `needs_options` |
| `1,200` con `58.89` (separador contrario) | `needs_options` |
| Odómetro `12.345` con otras celdas decimales | `needs_options` |
| Fixture de Drivvo | `parsed`, separador `.`, 3 filas, sin errores |
| Resto de fixtures | `parsed` |
| `options.decimalSeparator` | No pregunta: `$1,200` da 1200 con `.` y 1.2 con `,`; `1,200,000` da 1200000 con `.` |

**Las columnas no importadas no prueban el separador.** Siguen en `needs_options` los ficheros cuya única «prueba» está en:

- la eficiencia de Drivvo (`25.15 km/L` y `25.15`);
- `l/100km` y las coordenadas de Fuelio;
- `initialodometer` de LubeLogger;
- un coste de Fuelio que va a `skipped` (`Seguro`, `300.50`).

El mismo coste en una categoría `Frenos` sí cuenta, porque esa fila ya se importa.

### R38: plurales (`categories.ts:16`)

- **Coinciden:** `Frenos`, `Tires`, `Filtros`, `Neumáticos`, `Reparaciones`, `Batteries`, y también `FRENOS`, `Baterías`, `Averías`, `Ruedas`, `Pastillas`, `Tyres`, `Inspections`, `ITVs`, `Aceites`, `Revisiones`, `Talleres`, `Services` y `Mantenimientos`.
- **No coinciden:** `Seguro`, `Seguros`, `Multa(s)`, `Peaje(s)`, `Parking`, `Lavado(s)`, `Motor`, `Motores`, `Moto(s)`, `Impuesto(s)`, `Tired`, `Oiler`, `Brakeman` y `Filtrado`.

### R39: combustible sin importe (`drivvo.ts:100`)

- Total y precio vacíos o 0 (también `0.00`), en el primer, segundo o tercer combustible: `missing_field` en `totalPrice` en esa fila, y la fila siguiente se importa.
- Total 0 o vacío con precio válido: `totalPrice: 76`, sin errores.

### Tests frente a mutaciones

En una copia del módulo en el scratchpad, cada una de estas 9 mutaciones hace fallar al menos un test:

- quitar la regla del grupo único;
- quitar la de varios grupos;
- quitar el odómetro estricto;
- aceptar tres decimales como prueba;
- quitar `+s`;
- quitar `+es`;
- quitar `y` → `ies`;
- quitar R39;
- limitar R39 a celdas vacías.

### Sin regresiones de revisiones anteriores

- **Limpieza lineal:** rachas de 100.000 y 1.600.000 espacios dan `invalid_number` en menos de 2 s y la fila siguiente se importa.
- **`constructor` y `__proto__`:** como sección de Drivvo se clasifican por forma; como `ImportCSVDateFormat` dan `needs_options`.
- **`key`:** un coste 0 y uno ausente comparten `key`, y `12.5` se escribe `12.50`.

## Trazabilidad requirements ↔ tests

- R1: [x] `detect.test.ts:11` › `detects Fuelio marker variants`; `fuelio.test.ts:8`
- R2: [x] `detect.test.ts:17` › `detects Drivvo with translated sections`; `drivvo.test.ts:12`, `:172`
- R3: [x] `detect.test.ts:24` › `detects each LubeLogger record type`
- R4: [x] `detect.test.ts:38`; `parse.test.ts:32`
- R5: [x] `tokenizer.test.ts:7`; `parse.test.ts:40`, `:46`
- R6: [x] `tokenizer.test.ts:18`
- R7: [x] `tokenizer.test.ts:25`; `parse.test.ts:144`
- R8: [x] `values.test.ts:15`, `:22`, `:27`, `:32`, `:37`; `parse.test.ts:251`
- R9: [x] `values.test.ts:44`; `parse.test.ts:53`, `:65`
- R10: [x] `values.test.ts:53`; `parse.test.ts:150`, `:156`, `:164`, `:216`, `:242`
- R11: [x] `values.test.ts:61`; `parse.test.ts:182`, `:201` (`$1,200`, con y sin opción), `:210` (varios grupos), `:230` (sin prueba), `:237` (odómetro)
- R12: [x] `values.test.ts:68`, `:74`; `parse.test.ts:82`
- R13: [x] `parse.test.ts:88`
- R14: [x] `parse.test.ts:101`
- R15: [x] `fuelio.test.ts:8`
- R16: [x] `categories.test.ts:5`, `:16`; `fuelio.test.ts:8`
- R17: [x] `drivvo.test.ts:12`, `:64` (cabeceras `C0…C20`)
- R18: [x] `drivvo.test.ts:64`, `:79`, `:92`, `:106`, `:124`, `:139`
- R19: [x] `drivvo.test.ts:159`
- R20: [x] `drivvo.test.ts:12`, `:185`
- R21: [x] `lubelogger.test.ts:16`
- R22: [x] `lubelogger.test.ts:16`
- R23: [x] `lubelogger.test.ts:16`
- R24: [x] `fuelio.test.ts:8`; `drivvo.test.ts:12`, `:207`; `lubelogger.test.ts:16`
- R25: [x] `fuelio.test.ts:8`
- R26: [x] `parse.test.ts:110`
- R27: [x] `fuelio.test.ts:8`
- R28: [x] `parse.test.ts:126`; `fuelio.test.ts:8`
- R29: [x] `fuelio.test.ts:8`; `generic.test.ts:9`
- R30: [x] `keys.test.ts:24`, `:37` (pasa la fila por los tres adaptadores), `:71`
- R31: [x] `fuelio.test.ts:8`
- R32: [x] `generic.test.ts:9`
- R33: [x] `generic.test.ts:43`
- R34: [x] `parse.test.ts:131`
- R35: [x] `no-node-apis.test.ts:7`
- R36: [x] `fuelio.test.ts:8`, `drivvo.test.ts:12`, `lubelogger.test.ts:16`
- R37: [x] `parse.test.ts:257`, `:267`, `:274`, `:284`
- R38: [x] `categories.test.ts:16` › `matches plural category names` (afirma la categoría de cada plural y `null` en `Seguro` y `Seguros`)
- R39: [x] `drivvo.test.ts:92` › `rejects a merged fuel without total or price (%s)` (afirma fila, código, campo y que la fila siguiente se importa)
- R40: [x] `drivvo.test.ts:106` › `rejects a negative value in a merged fuel (%s)` (6 casos: afirma fila, `out_of_range`, campo exacto y los valores de la fila siguiente)
- R41: [x] `drivvo.test.ts:124` › `rejects a merged fuel with an amount but no volume (%s)` (3 casos: afirma fila, `out_of_range`, `quantity` y los valores de la fila siguiente); `:139` › `keeps ignoring padded empty fuel slots (%s)` (3 casos: afirma cantidad y total)

## Tasks

- T1..T29: [x]

## Checkpoints

- C1: [x] Arnés con salida 0, una sola feature activa, rama `feat/csv-import-parsers`.
- C2: [x] `requirements.md`, `design.md` y `tasks.md` completos, en EARS, con todas las tasks marcadas y cada `R<n>` con test concreto.
- C3: [x] Solo `packages/shared/package.json`, `src/csv-import/` y el rastro en `specs/` y `progress/`. Los criterios de tamaño añadidos a #85 y #86 en `feature_list.json` son la decisión de Gate 2 recogida en `design.md`. `pnpm-lock.yaml` intacto.
- C4: [x] Lógica pura en `packages/shared` con tests unitarios. API, BD y web no aplican.
- C5: [x] Sin `any`, `@ts-ignore`, `console.log` ni TODOs. Fechas `YYYY-MM-DD`; km sin convertir. No hay ficheros subidos.
- C6: [x] `pnpm harness --full` con salida 0 (`packages/shared` 274, `packages/db` 3, `apps/api` 373, `apps/web` 715 y `e2e` 6 tests). Sin capturas porque no hay UI.
- C7: [x] `impl_csv-import-parsers.md` y `current.md` al día. `docs/PLAN.md` no necesita cambios en esta feature.

## Hallazgos

Ninguno bloqueante.

## Avisos para el humano (no bloquean)

1. **Con varios fallos en una fila, el error de R40 o R41 puede quedar tapado.** La fila nunca se importa y la siguiente se procesa, pero se informa solo del primer fallo, como documenta `impl_csv-import-parsers.md`. Por ejemplo, `Gasoline,1.5,-5,,Yes,LPG,0.8,16,20,Yes` da `missing_field` en `quantity` (`drivvo.ts:104`), y un booleano o número inválido anterior también se informa antes. El spec no define la prioridad entre fallos, así que no bloquea. Si se quiere que el negativo gane siempre, hay que decidirlo y añadirlo a R40.
2. **Negativos con formas que el parser no lee.** `-$5` y `-1.200.000` dan `invalid_number` en su campo, no `out_of_range`. La fila se rechaza igualmente, y R12 solo admite el símbolo de moneda en los extremos.
3. **Consecuencias aceptadas de R11 y R38, como ya indica `impl_csv-import-parsers.md`:** un fichero con todos los decimales a tres cifras pide el separador, incluido `0.899`; y `Motes` se categoriza como `inspection` porque `+es` se aplica a `mot`.
4. **Test intermitente ajeno a esta feature.** El implementer vio fallar una vez `apps/web/src/features/mobile/camera-restore-handler.test.tsx`. En esta revisión el arnés se ejecutó una vez y pasó, así que no confirma ni descarta el problema.
5. **Nuevo: los tests de R41 no fijan dos bordes.** No hay caso con total menor que 1 ni con el tercer combustible. T29 no los exige y el código los trata bien (comprobado con `0.01` y en las tres posiciones).
6. **Sigue pendiente probar un export real de cada app antes de v0.4.0.** Todo lo verificado aquí se apoya en el informe de formatos y en fixtures escritos a mano.
7. **Nuevo: esta revisión escribió caché de Vitest dentro de `packages/shared/node_modules/`.** La copia para las mutaciones enlazaba ese `node_modules`, y sus ejecuciones escribieron en `.vitest-cache/` y `.vite-temp/` a las 13:50. Son rutas ignoradas por git: `git status` y el contenido de `src/csv-import/` no cambian. No las he borrado porque no puedo distinguir qué había antes. Se corrigió el enlace para el resto de ejecuciones.

Los avisos que el humano ya decidió dejar en revisiones anteriores siguen igual. El límite de tamaño pasa a #85 y #86.

## Cambios requeridos

Ninguno.
