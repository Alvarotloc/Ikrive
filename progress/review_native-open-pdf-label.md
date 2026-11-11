# Review — #59 native-open-pdf-label (`sdd: false`)

**Veredicto:** APPROVED

## Trazabilidad acceptance ↔ tests
- App: aria-label con visor del sistema: [x] `apps/web/src/features/maintenance/maintenance-attachments.test.tsx:524` › `native: opens a PDF with the system viewer`. Con `vi.stubEnv('MODE', 'native')` busca el botón por «Abrir «factura.pdf» con el visor del sistema» y comprueba que no hay ningún botón con «pestaña nueva». Si se revierte el cambio, el `findByRole` falla. También `:544` › `native: shows an error toast when opening fails`.
- Web: sigue «en una pestaña nueva»: [x] `:113` (modo cookie, `link` con «Abrir «factura.pdf» en una pestaña nueva», línea 129) y `:435` (modo servidor, `button` con la misma etiqueta, línea 441). Si la web perdiera esa etiqueta, estos tests fallarían.
- Textos en es/en: [x] `openPdfNative` está en `es.json` («Abrir «{{name}}» con el visor del sistema») y en `en.json` ("Open “{{name}}” with the system viewer"). Siguen el estilo de comillas y el tono de `openPdf`.
- Un test de componente cubre web y app: [x] los dos bloques anteriores están en el mismo fichero de test del componente.
- `pnpm harness --full`: [x] en verde. Resultados: web 450/450, api 368/368, lint y typecheck OK.

## Tasks
- No aplica (`sdd: false`, sin `tasks.md`). El plan de `progress/current.md` está completo.

## Checkpoints
- C1: [x] harness en verde; solo #59 está `in_progress`; la rama es `feat/native-open-pdf-label`.
- C2: [x] no aplica (`sdd: false`). Se valida contra `acceptance` y todos los criterios tienen test.
- C3: [x] el diff solo toca `maintenance-attachments.tsx`, su test, los dos locales, `feature_list.json` (estado) y `progress/`. No hay refactors.
- C4: [x] el cambio está en `features/maintenance/`, reutiliza `isNativeApp()` de `@/lib/platform` y los textos están en ambos locales.
- C5: [x] no hay `any`, `@ts-ignore`, `console.log` ni código comentado. El comentario añadido explica el porqué.
- C6: [x] harness en verde y los tests afirman etiquetas concretas. No hay capturas porque solo cambia el aria-label, sin cambios visibles; está justificado.
- C7: [x] `impl_native-open-pdf-label.md` tiene los archivos tocados, el mapa acceptance → test y la salida del harness. `current.md` está al día. `PLAN.md` no hace falta tocarlo.

## Hallazgos
- Ninguno bloqueante.

## Avisos para el humano (no bloquean)
- La comprobación negativa (`queryByRole(..., /pestaña nueva/)`) solo busca `button`. En nativo el control es un botón, así que basta. Aun así, sería más robusta si también buscara `link`.

## Cambios requeridos
- Ninguno.
