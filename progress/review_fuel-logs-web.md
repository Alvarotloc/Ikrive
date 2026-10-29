# Review — #23 fuel-logs-web

**Veredicto:** APPROVED (1.ª vuelta; ver la 2.ª vuelta al final)

Revisado: `git diff main...HEAD` (solo spec + `feature_list.json`), `git diff` y los nuevos archivos sin trackear de `apps/web/src/features/fuel/` (10 archivos, leídos enteros). `pnpm harness --full` lo he ejecutado yo: verde (shared 60, api 190, web 232 tests; lint y typecheck OK).

## Trazabilidad requirements ↔ tests

Abreviaturas: FU = `apps/web/src/features/fuel/fuel.test.ts`, FO = `form.test.ts`, FF = `fuel-log-form.test.tsx`, FS = `fuel-logs-section.test.tsx`, LO = `apps/web/src/i18n/locales.test.ts`.

- R1: [x] FS:83 › `lists the vehicle's fuel logs newest first` (encabezado «Repostajes» y filas del `GET` mockeado). El montaje en la ruta se valida con typecheck y capturas `*-page.png` (excepción prevista en design/T14).
- R2: [x] FU:47 › `sorts logs by date, odometer and creation date descending` (los tres criterios de desempate y no muta la entrada) + FS:83 (orden de las filas con entrada desordenada).
- R3: [x] FS:94 › `shows date, km, quantity, prices and full tank…` (texto exacto de `money`, «35,5 L», fecha · «125.300 km» · «1,552 €/L», «Parcial»/«Lleno») + FS:106 (kWh).
- R4: [x] FS:117 › mensaje vacío y sin `list`.
- R5: [x] FS:124 › botón presente en `active`, ausente en `sold` y `archived`.
- R6: [x] FO:108 y FF:93 › fecha de hoy, «Depósito lleno» marcado, «Me salté…» desmarcado.
- R7: [x] FF:93 › valor `132480` y descripción accesible «Última lectura: 132.480 km el …»; FF:107 sin lecturas.
- R8: [x] FU:60-73 (redondeos 3/2/3) + FF:114 › los tres casos, valor escrito y descripción «Calculado».
- R9: [x] FF:133 › al cambiar un origen se recalcula (`0,146`) y al vaciar un origen se vacía el calculado.
- R10: [x] FO:163 + FF:162 › errores en los vacíos, `aria-invalid` y ningún `POST`.
- R11: [x] FO:170 + FF:178 › cantidad 0, km «abc», `aria-invalid` y ningún `POST`.
- R12: [x] FU:23, FO:180 y FF:241 › el cuerpo del `POST` lleva `quantity: 1.459`, `totalPrice: 58.36` y `pricePerUnit: 40`.
- R13: [x] FF:216 › «Cantidad (kWh)», «Precio por gal (USD)», «Kilometraje (mi)».
- R14: [x] FF:241 › cuerpo completo del `POST`, toast y diálogo cerrado.
- R15: [x] FF:232 › `inputmode` numeric/decimal.
- R16: [x] FO:221, FF:265 y FS:151 › los valores precargados.
- R17: [x] FF:265 › cuerpo completo del `PATCH` a `/fuel-logs/f1`, toast y cierre.
- R18: [x] FS:167 › al cancelar no hay `DELETE`; al confirmar hay exactamente un `DELETE` a la ruta correcta.
- R19: [x] FF:365 (detail, odometer y fuelLogs invalidados) + FS:167 (detail invalidado y lista recargada).
- R20: [x] FO:233 + FF:325 › mensaje de conflicto, `aria-invalid` en km y el diálogo sigue abierto.
- R21: [x] FO:240 + FF:338 › error de fecha futura en el campo de fecha.
- R22: [x] FO:244, FF:352 (`role=alert` raíz con `common.error`) y FS:198 (toast al borrar).
- R23: [x] LO › paridad es/en + `defines a label for every fuel quantity unit`.
- R24: [x] 16 capturas en `scratchpad/shots/` (claro, oscuro y 375 px). He revisado `mobile-375-dark-form-computed.png` y `mobile-375-fuel-section.png`: sin desbordamiento y el diálogo hace scroll.
- R25: [x] FU:34, FO:188 y FF:196 › error de número no válido y el texto se conserva tal cual.
- R26: [x] FU:40, FO:196 y FF:196 › «Como mucho N decimales» con N por campo.
- R27: [x] FF:300 (pista solo en edición y enlazada a los tres campos) + FF:312 (en edición no hay recálculo automático; al vaciar un campo se recalcula).

## Tasks
- T1..T16: [x]

## Checkpoints
- C1: [x] harness OK · una sola feature activa (#23) · rama `feat/fuel-logs-web`.
- C2: [x] requirements/design/tasks presentes, EARS con la tabla de acceptance completa · tasks `[x]` · cada R con un test leído.
- C3: [x] el diff se limita a los archivos de la tabla de `design.md` (más `progress/`). `numbers.ts`, `lib/format.ts`, la API y shared no se tocan.
- C4: [x] código en `features/fuel/`, `queryOptions`, textos en es/en, componentes de marca (`Card`, `Badge stamp`, `Button accent`, `AlertDialog`, `FormField`). La parte de API/BD no aplica.
- C5: [x] sin `any`, `@ts-ignore`, `console.log` ni TODOs. Fechas en `YYYY-MM-DD` y los km sin convertir. Ficheros subidos: no aplica.
- C6: [x] `pnpm harness --full` verde. Los tests afirman valores concretos y solo simulan `fetch`. Capturas referenciadas en el impl.
- C7: [x] `impl_fuel-logs-web.md` completo · `current.md` al día · PLAN sin cambios necesarios (la fase 5 sigue abierta por #24).

## Hallazgos
Ninguno bloqueante.

## Avisos para el humano (no bloquean)
1. `form.ts:67-77` (`defaultsFrom` en edición): `formatInputNumber` redondea a 3 decimales. Un repostaje creado directamente contra la API con más decimales (la API acepta cualquier precisión y guarda ambos precios tal cual) tendría dos efectos. Una cantidad tipo 40.1255 se precargaría como «40,126» y se guardaría redondeada al editar. Un total tipo 58.365 aparecería como «58,365» y bloquearía el guardado con «Como mucho 2 decimales» hasta que el usuario lo corrija. Desde la UI no puede ocurrir.
2. Comportamiento ya señalado por el implementer: en alta, si se borra con retroceso un valor calculado, el campo se vuelve a rellenar al instante (paso 3 del algoritmo). Para sustituirlo hay que seleccionarlo y escribir encima. Conviene probarlo en el móvil.
3. Un valor 0 en cantidad o precio muestra el mensaje genérico de zod «El valor no es válido.». Cumple R11, pero el texto podría ser más claro en el futuro (`i18n/zod.ts`).
4. Los mensajes de error de `FormField` (`role="alert"`) no están enlazados a sus inputs por `aria-describedby`. Es el patrón actual de toda la app y no lo introduce esta feature.

## Cambios requeridos
Ninguno.

---

# 2.ª vuelta — cambio pedido en Gate 2 (T17 / R28)

**Veredicto:** APPROVED

He revisado `fuel-log-form.tsx` (`onValueChange`, líneas 78-126), los tests nuevos de `fuel-log-form.test.tsx`, la R28 de `requirements.md`, el paso 1 de `design.md`, la T17 de `tasks.md` y la sección T17 de `impl_fuel-logs-web.md`. He ejecutado `pnpm harness --full` yo mismo: verde (api 190 y web 234 tests; lint y typecheck OK).

## Trazabilidad
- R28: [x] FF:162 › `does not refill the computed value when the user clears it`. Borra «1,459» con 5 retrocesos y comprueba que el campo queda `''` y que «Calculado» ha desaparecido. Sin la `useRef`, el último retroceso deja un solo campo vacío y el paso 3 lo volvería a rellenar, así que el test sí detecta la regresión.
- R28: [x] FF:149 › `keeps a value the user types over the computed one`. Escribe encima («1,4599»), comprueba que «Calculado» desaparece y que, tras cambiar la cantidad, el valor sigue siendo «1,4599».
- R28 + R8: [x] FF:174 › `computes again after the user changes a source`. Tras vaciar el campo calculado, cambiar la cantidad lo recalcula («0,146») y vuelve la descripción «Calculado».
- R8: [x] FF:114 sigue en verde. Con `userOwned === null` el flujo de alta no cambia.
- R9: [x] FF:133 sigue en verde. Mientras el campo calculado no se toque, el paso 2 recalcula igual que antes; el `return` temprano solo se ejecuta cuando el campo editado es el calculado o el que el usuario ha hecho suyo.
- R27: [x] FF:325 y FF:337 siguen en verde. En edición, `computed` y `userOwned` empiezan en `null`, así que vaciar un campo lo recalcula a partir de los otros dos (es lo que comprueba FF:337).

## Tasks
- T1..T17: [x]

## Checkpoints
- C1–C7: [x], sin cambios respecto a la 1.ª vuelta. El diff de T17 solo toca `fuel-log-form.tsx`, sus tests, la spec (R28, el paso 1 del design y T17) y `progress/`.

## Hallazgos
Ninguno bloqueante. He repasado estos casos límite y todos se comportan bien:
- Vaciar el campo con `clear` (un solo evento) no lo vuelve a rellenar.
- Si se borra a medias y luego se escribe, el valor se mantiene.
- Si el usuario hace suyo el campo X y después cambia el origen Y, X se recalcula solo si está vacío. Si tiene un valor escrito por el usuario, no se sobrescribe, porque `computed` es `null` y no queda ningún hueco.

## Avisos para el humano (no bloquean)
1. Hay una desviación de mecanismo que el impl ya documenta: además del paso 1 del design se usa una `useRef userOwned`. Hace falta porque el paso 1 al pie de la letra no cumple R28 al borrar con retroceso. `design.md` no menciona la ref. Si queréis que el design refleje el mecanismo exacto, conviene añadir una línea, pero el comportamiento es el que piden R28 y el propio párrafo del design.
2. El aviso 2 de la 1.ª vuelta (el valor calculado se volvía a rellenar al borrarlo con retroceso) queda resuelto con este cambio.

## Cambios requeridos
Ninguno.
