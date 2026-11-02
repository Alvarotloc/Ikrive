# Review — #31 sale-report-web

**Veredicto:** APPROVED

## Trazabilidad requirements ↔ tests

SRD = `apps/web/src/features/reports/sale-report-dialog.test.tsx`; SR = `apps/web/src/features/reports/sale-report.test.ts`.

- R1: [x] SRD:84 › `opens an accessible dialog with the report options`: el botón «Informe de venta» existe y abre el diálogo. El montaje en la ficha (`routes/_app/vehicles/$vehicleId/index.tsx:67`) no depende de `vehicle.status`; lo confirman el typecheck y las capturas `*-page.png` (ver Avisos).
- R2: [x] SRD:84: `findByRole('dialog', { name: 'Informe de venta' })`.
- R3: [x] SRD:94-101: Tab desde «Descargar» lleva el foco a la primera casilla, que está dentro del diálogo, y Mayús+Tab lo devuelve a «Descargar».
- R4: [x] SRD:103-105: Escape cierra el diálogo y no hay ninguna petición a `report.pdf`.
- R5: [x] SRD:89-92: las cuatro casillas están desmarcadas. SRD:108 › `starts unchecked every time it opens`: al reabrir vuelven a estar desmarcadas.
- R6, R8: [x] SRD:89-92: con matrícula y VIN aparecen «Ocultar matrícula» y «Ocultar VIN», desmarcadas.
- R7, R9: [x] SRD:120 › `hides the plate and VIN options when the vehicle has neither`: con `queryByRole` comprueba que no aparecen y que sí aparecen las otras dos.
- R10: [x] SRD:131 › `warns that free text is not redacted`: la región `aria-live` existe vacía antes de cualquier aviso y no lleva `empty:hidden`; el aviso aparece dentro de esa misma región con cada opción de ocultar, desaparece al desmarcarla y no sale con solo «Incluir facturas». SR:48 › `detects any hide option`.
- R11: [x] SRD:149 › `warns that invoices are appended as they are`: el aviso no sale con solo ocultar, sí sale con ocultar + facturas y desaparece al quitar la opción de ocultar.
- R12: [x] SRD:165: la URL exacta es `/api/vehicles/v1/report.pdf?hidePrices=true&hideVin=true&includeInvoices=true`, con `GET` y `credentials: 'include'`. SR:13 cubre 0, 1 y 4 opciones en orden.
- R13: [x] SRD:165: `download` es el `filename*` decodificado (`ikrive-señor-clio-…`) y el blob es el cuerpo `%PDF-1.7`. SR:23 cubre `filename*`, `filename` entre comillas y token, y `filename*` mal codificado, que cae a `filename`.
- R14: [x] SRD:187 › `falls back to the shared file name without Content-Disposition`: el nombre es `saleReportFileName('Señor Clio', todayIso())`. SR:40 cubre `null`, `attachment` a secas y `filename=""`.
- R15: [x] SRD:171 y SRD:204: el diálogo se cierra tras la descarga (`onSuccess` sigue en `mutate()`).
- R16: [x] SRD:204 › `disables the download button while the report is generating`: con la petición retenida, el botón muestra «Generando…», está deshabilitado y no queda ningún botón «Descargar».
- R17: [x] SRD:222 › `shows an error toast and keeps the dialog open when the API fails`: con un 500 sale el toast con el texto literal, el diálogo sigue abierto, las casillas siguen marcadas, el botón vuelve a estar habilitado y no se descarga nada. Y SRD:243 › `shows the error toast even if the dialog was closed while generating`: se cierra con Cancelar mientras la petición está retenida, se responde 500 y el toast aparece igualmente.
- R18: [x] `apps/web/src/i18n/locales.test.ts` › `es and en define the same keys`. He revisado a mano las 13 claves de `saleReport.*` en ambos idiomas.

## Tasks
- T1–T15: [x]

## Checkpoints
- C1: [x] `pnpm harness` en verde, una sola feature activa (#31) y la rama es `feat/sale-report-web`.
- C2: [x] Están los tres ficheros del spec en EARS y la tabla de acceptance completa. Todas las tasks están `[x]` y cada R tiene un test, abierto y leído.
- C3: [x] El diff solo toca los archivos que lista `design.md`. Hay dos extras justificados en el informe: `max-h-[90dvh] overflow-y-auto`, que sigue el patrón de otros diálogos, y `flex-wrap` en la barra, que ya preveía el design.
- C4: [x] No toca API, BD ni shared. Web: el código está en `features/reports/`, la mutación usa `useMutation` (decisión del design), los textos están en es/en y se reutilizan `Dialog`, `Button` y `toast`.
- C5: [x] Sin `any`, `@ts-ignore`, `console.log` ni TODO. La fecha de respaldo usa `todayIso()` (`YYYY-MM-DD` local).
- C6: [x] He ejecutado `pnpm harness --full` y termina en verde (shared 98, web 277, api 215; re-ejecutado tras Gate 2). Los tests solo simulan `fetch` y las APIs de URL/anchor. Hay capturas en claro, oscuro y móvil; he revisado `desktop-dark-warnings.png` y `mobile-375-light-page.png`.
- C7: [x] `impl_sale-report-web.md` está completo y `current.md` está al día. No hace falta tocar `PLAN.md`: la fase 6 no se cierra con esta feature.

## Re-revisión tras Gate 2 (2026-11-02)

El humano pidió aplicar los avisos 1 y 2. Los dos están bien resueltos.

- **Aviso 1** — `sale-report-dialog.tsx:89`: la región `aria-live="polite"` ya no lleva `empty:hidden`. Está siempre montada y visible, también cuando está vacía. El hueco se evita así: casillas y región van en el mismo hijo del grid y la región usa `not-empty:mt-5`, una variante válida en Tailwind 4.3. Con contenido, la separación es la misma que antes. Cuando no hay avisos, React no pinta ningún nodo dentro (`{false}`), así que `:empty` se cumple. Lo cubre SRD:131-146, que comprueba que la región existe vacía, que no lleva `empty:hidden` y que los avisos se pintan dentro de esa misma región. Nota: `toBeVisible` en jsdom no evalúa las clases de Tailwind, así que la garantía real la da la aserción sobre `className`.
- **Aviso 2** — `queries.ts:139`: `onError` pasa a las opciones del `useMutation`. En TanStack Query v5 esos callbacks los ejecuta el propio `Mutation`, así que siguen funcionando aunque el `MutationObserver` se haya desmontado. `mutate()` solo conserva `onSuccess`, de modo que no hay toast duplicado. SRD:243 cubre el caso: cierra con la petición en curso, responde 500 y comprueba el toast y que no hay descarga. Ese test fallaría con el código anterior, porque los callbacks de `mutate()` se descartan cuando no hay listeners.
- R15, R16 y R17 siguen cubiertos y en verde con los tests de arriba. El alcance no cambia: solo se tocan `sale-report-dialog.tsx`, `queries.ts` y el test.

## Hallazgos
Ninguno bloqueante.

## Avisos para el humano (no bloquean)
1. ~~Región `aria-live` con `empty:hidden`~~: resuelto en Gate 2.
2. ~~Sin toast si se cierra el diálogo con la petición en curso~~: resuelto en Gate 2.
3. `lib/api-client.ts` importa de `features/reports/sale-report.ts`, como piden el design y T1. No es la primera dependencia `lib → features` (ya existe en `lib/format.ts` con `features/settings/queries`) y no crea ningún ciclo.
4. R1 en la ficha real no tiene un test de ruta. Se apoya en el test del componente, el typecheck y las capturas, y el montaje no tiene condiciones.
5. No se repitieron las capturas tras el aviso 1. Con avisos, el espaciado visible no cambia, y sin avisos la región no ocupa espacio (no tiene margen ni contenido). Las capturas están en el scratchpad de la sesión (`/tmp/...`), que es efímero.

## Cambios requeridos
Ninguno.
