# Review — #30 sale-report-invoices

**Veredicto:** APPROVED

_Tercera revisión: cambios pedidos en Gate 2 (orden de anexado por `report.annexes.items`, tests de PDF sin páginas / imagen que no decodifica, test de ilegible que no consume tope; T15)._

## Trazabilidad requirements ↔ tests
- R1: [x] `packages/shared/src/schemas/reports.test.ts` › `defaults every option to false` (default `false`), `accepts true/false/1/0` (`true`/`1`/`false`/`0`)
- R2: [x] `reports.test.ts` (shared) › `rejects other values` (`yes`, `''`, booleano); `apps/api/test/reports.test.ts` › `rejects invalid includeInvoices` (400 + `application/problem+json` con `yes`, `''`, `2`)
- R3: [x] `packages/shared/src/domain/sale-report.test.ts` › `numbers annexes in table order` (orden de creación ≠ orden de tabla; `A1, A2` / `A3` / `—`)
- R4: [x] mismo test (columna `annexes` la última, etiqueta «Anexos», `—`) + API › `references each annex`
- R5: [x] mismo test (`label` con ref, fecha, título y nombre) + API › `references each annex` (texto exacto en el PDF)
- R6: [x] shared › `never annexes excluded maintenance` (ausente de `JSON.stringify`, `annexes === null` si solo hay excluidos)
- R7: [x] shared › `keeps the #29 report without includeInvoices` (`toEqual` con el modelo sin `attachments`)
- R8: [x] shared › `translates the annex texts`, `marks annexes skipped by the size limit` (es/en)
- R9: [x] API › `appends invoices in table order` (páginas = base + 3 + 2, tamaños `[500,500]` … `[300,400],[300,400]`, informe intacto al principio)
- R10: [x] API › `fits annex images without distortion` (vertical, apaisada, sin ampliar, centrada) + `appends invoices in table order` (PNG → A4 apaisada, WebP → A4 vertical)
- R11: [x] API › `appends invoices in table order` (mantenimiento antiguo creado después va primero; dentro, orden de subida pdf/png/webp). Tras Gate 2 `service.ts` guarda los `LoadedAnnex` en un `Map` por id y anexa recorriendo `report.annexes.items` (saltando los que llevan `notice`), según el paso 7 del design. Sin test que distinga orden de carga de orden de tabla: justificación aceptada — el servicio recorre `listByVehicle(...).reverse()` (`date asc, createdAt asc`) y `buildSaleReport` aplica un `sort` estable por fecha sobre ese mismo orden, así que con el repositorio real ambos coinciden siempre; distinguirlos exigiría un repo falso.
- R12: [x] API › `never annexes excluded maintenance` (mismo nº de páginas, nombre ausente). Además borra del disco el fichero del adjunto excluido y comprueba que no hay ningún `warn` → no se lee.
- R13: [x] API › `skips unreadable invoices` (cifrado, corrupto, fichero borrado → 200, base + 1, última página la buena) y `skips pdfs without pages and images that do not decode` (`apps/api/test/reports.test.ts:514`: PDF válido de 0 páginas con `addDefaultPage: false` y PNG sobrescrito en disco con firma + basura → base + 1, aviso de ilegible 2 veces, `warn` con ambos ids). **Verificado por mutación** en una copia en el scratchpad: quitando el `getPageCount() === 0` de `annexes.ts` el test falla.
- R14: [x] API › `skips unreadable invoices` (warns `level: 40` con `vehicleId` y los 3 `attachmentId`) y `skips annexes over the size limit and keeps going` (warn con el id de A2)
- R15: [x] shared › `marks annexes that could not be read`; API › `skips unreadable invoices` (aviso 3 veces)
- R16: [x] API › `does not change the report without includeInvoices` (sin parámetro, `false`, `0`: mismas páginas que vehículo sin adjuntos, sin lista ni nombre)
- R17: [x] API › `reads REPORT_MAX_ANNEX_MB` (100 por defecto, `5`, rechaza `0`, `-1`, `1.5`)
- R18: [x] API › `does not count unreadable annexes against the size limit` (`apps/api/test/reports.test.ts:606`: tope 1 MB, corrupto de 0,6 MB seguido de dos PDFs de ~0,4 MB → se anexan ambos, sin aviso de tope, `warn` solo del corrupto; decisión 8 del design; mutación verificada por el implementer moviendo el descuento antes de `loadAnnex`) y `counts the size limit over all the annexes of the report` (`apps/api/test/reports.test.ts:542`): tope 1 MB, tres PDFs de ~0,4 MB que caben solos → se anexan los dos primeros (`[300,400]`, `[400,300]`), el tercero se omite (aviso de tope 1 vez, `warn` solo con su id), y uno pequeño posterior sí se anexa (`[200,200]`). **Verificado por mutación** en una copia del repo en el scratchpad: comentando `remaining -= row.size` (`service.ts:84`) el test falla (1 failed | 18 passed, aparece `[500,500]`). También `skips annexes over the size limit and keeps going`.
- R19: [x] API › `skips annexes over the size limit and keeps going` (el «grande» es ilegible si se leyera y su aviso es el de tope → no se lee; A3 posterior sí se anexa; 200)
- R20: [x] shared › `marks annexes skipped by the size limit` (aviso distinto del de ilegible, es/en); API › mismo test de tope (aviso de tope 1 vez, ninguno de ilegible)

## Tasks
- T1–T15: [x] (todas marcadas en `specs/sale-report-invoices/tasks.md`; T15 = cambios de Gate 2)

## Checkpoints
- C1: [x] `pnpm harness` verde; una sola feature activa (#30 `in_progress`); rama `feat/sale-report-invoices`.
- C2: [x] spec completo, tasks `[x]` y todos los R1–R20 con test real.
- C3: [x] el diff solo toca los archivos de la tabla del design (+ `pnpm-lock.yaml`, `progress/`).
- C4: [x] lógica en `modules/reports/{routes,service}.ts` + `pdf/annexes.ts`, cableado en `app.ts`; query validado con `saleReportQuerySchema` de `@ikrive/shared`; propiedad vía `findOwned` antes de cargar adjuntos (404); sin cambios de BD; lógica del modelo pura en `packages/shared` con tests. El `throw new Error` de `loadAnnex` es interno y se captura siempre en el servicio (no llega al cliente).
- C5: [x] sin `any`/`@ts-ignore`; fechas `YYYY-MM-DD` formateadas con los formateadores de #29; sin `console.log`; los ficheros se leen por `storageKey` vía `FileStorage`.
- C6: [x] `pnpm harness --full` en verde (shared 98, api 215, web 263); tests con SQLite en memoria y fixtures generados; sin UI web (render del PDF revisado con capturas en el scratchpad).
- C7: [x] `progress/impl_sale-report-invoices.md` con archivos, mapa R→test y salida; `progress/current.md` al día; `docs/PLAN.md` sin cambios necesarios (no cierra fase).

## Hallazgos
Ninguno. Los tres puntos de Gate 2 están resueltos:
1. Orden de anexado: `apps/api/src/modules/reports/service.ts` construye la lista para `appendAnnexes` desde `report.annexes.items` vía `Map` por id; `SaleReportAnnex` ya expone `id`. Los omitidos (`notice !== null`) nunca se cargan y tampoco se buscan.
2. R13: test nuevo de PDF sin páginas e imagen que no decodifica (mutación verificada).
3. Decisión 8: test nuevo de ilegible que no consume presupuesto.
No se ha roto nada: el resto de tests sigue igual y `pnpm harness --full` en verde (api 213 → 215).

## Avisos para el humano (no bloquean)
- R16 (sin `includeInvoices`) sigue apoyándose en el código para la parte «no leer» (no hay comprobación vía `warn` como en R12).
- R9: el PDF de 2 páginas usa dos páginas del mismo tamaño, así que el orden interno de sus páginas no se distingue (sí el orden entre anexos).
- `toAnnexImage` sin test unitario propio (justificado en el impl; cubierto indirectamente).
- El cambio de orden de anexado (R11) no tiene test discriminante por las razones dadas en el impl; queda como blindaje frente a cambios futuros del orden del repositorio.

## Cambios requeridos
Ninguno.
