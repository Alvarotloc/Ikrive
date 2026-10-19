# Review — #7 maintenance-attachments-web

**Veredicto:** APPROVED

Diff revisado: `git diff main...HEAD` (solo spec + `feature_list.json`), `git diff` (14 ficheros modificados) y los 9 ficheros nuevos sin trackear. `pnpm harness --full` ejecutado por el reviewer: verde (shared 11, api 42, web 104 tests; lint y typecheck OK).

## Trazabilidad requirements ↔ tests

Abreviaturas: **CC** `apps/api/test/client-config.test.ts` · **AT** `apps/web/src/features/maintenance/attachments.test.ts` · **MA** `…/maintenance-attachments.test.tsx` · **MF** `…/maintenance-form.test.tsx` · **MT** `…/maintenance-timeline.test.tsx` · **LO** `apps/web/src/i18n/locales.test.ts`.

- R1: [x] MT:220 › `opens the attachments dialog of a record` (pulsa el clip de «Pastillas», heading «Facturas», texto del registro, 1 `GET …/brakes/attachments` y 0 de `oil`) + MA:83 (lista devuelta por el `GET`).
- R2: [x] MA:103 › `shows the empty message…` (texto vacío y sin `listitem`).
- R3: [x] AT:9 (`ATTACHMENT_ACCEPT` exacto) + MA:122 (`type=file`, `multiple`, `accept` literal).
- R4: [x] AT:36 (orden estricto start/end, sin solapamiento) + MA:139 (2 `POST` con `FormData.file` en orden `a.pdf`, `b.pdf`).
- R5: [x] MA:139 (toast «2 facturas subidas», `GET` repetido y lista nueva visible).
- R6: [x] MA:164 (botón «Subiendo…» `disabled` con el `POST` retenido; vuelve a habilitarse tras liberar).
- R7: [x] MA:83 (`img` con `alt`=nombre y `src`=`thumbnailUrl`).
- R8: [x] MA:83 (tarjeta PDF sin `img`, con `svg`; un solo `img` en total).
- R9: [x] MA:83 (nombres visibles).
- R10: [x] MA:83 (`href`=`url` en miniatura, nombre de imagen y nombre de PDF).
- R11: [x] MA:248 (cancelar → 0 `DELETE`; confirmar → 1 `DELETE …/a2`; `alertdialog` con título).
- R12: [x] MA:248 (toast «Factura eliminada», 2 `GET`, la factura desaparece).
- R13: [x] AT:13 + MA:195 (toast con «a.pdf» y tipos) + MF:178.
- R14: [x] AT:18 + MA:212 (con «1 MB») + MA:222 (`/config` 500 → mensaje sin límite, sin ayuda).
- R15: [x] AT:23 + MA:238 (subida 500 → «Algo ha ido mal», sin toast de éxito) + MA:276 (borrado 500).
- R16: [x] AT:36 (`failures` y `uploaded`=2) + MA:195 + MF:178 (el segundo se sube tras el 415).
- R17: [x] LO › `es and en define the same keys` (existente); claves `maintenance.attachments.*` presentes en ambos idiomas.
- R18: [x] Capturas en claro/oscuro/375 px (16) y medición `scrollWidth - clientWidth` = 0 en página y diálogo (`shots-report.json`). Revisadas `mobile-375-dark-dialog.png` y `mobile-375-timeline.png`.
- R19: [x] MA:110 (`role="alert"` con `common.error`, sin lista).
- R20: [x] MA:110 («Cargando…» con el `GET` retenido).
- R21: [x] CC:5 (`MAX_UPLOAD_MB: '7'` → 200 `{ maxUploadMb: 7 }`).
- R22: [x] CC:13 (401 + `application/problem+json`).
- R23: [x] MA:132 (ayuda «… máx. 1 MB» y `aria-describedby` en el botón) + MF:100.
- R24: [x] AT:29 (borde `limit` / `limit+1`) + MA:181 (toast con nombre y «1 MB», solo `small.pdf` enviado) + MF:201.
- R25: [x] MF:100 (`multiple`, `accept`, nombres listados).
- R26: [x] MF:120 (quitar `a.pdf` → solo `b.pdf` enviado).
- R27: [x] MF:136 (alta antes que las subidas, 2 `POST …/r9/attachments` en orden, toasts) + MF:178.
- R28: [x] MF:178 (diálogo cerrado, 0 `DELETE`, «Mantenimiento añadido»).
- R29: [x] MF:178 (toast `retryHint`).
- R30: [x] MF:219 (botón «Subiendo facturas…» `disabled`, Escape ignorado) — el alta en curso usa el mismo `isSubmitting`.
- R31: [x] MF:241 (sin input, botón ni sección en edición).

## Tasks
- T1–T18: [x] (18/18).

## Checkpoints
- C1: [x] `pnpm harness` exit 0 · una sola feature activa (#7 `in_progress`) · rama `feat/maintenance-attachments-web`.
- C2: [x] tres ficheros del spec · EARS con un DEBE/NO DEBE por R y tabla acceptance → R completa · tasks todas `[x]` · cada R con test real abierto y leído.
- C3: [x] El diff se ciñe a la tabla «Archivos» de `design.md`. El cambio de maquetación de `MaintenanceRow` en móvil es la contingencia prevista en «Riesgos» y está documentado en `impl` (desviación 1).
- C4: [x] Endpoint sin dominio de datos: solo `routes.ts`, como fija el diseño (patrón `health`/`me`), cableado en `app.ts`, respuesta validada con `clientConfigSchema` de shared · sin recurso de usuario (configuración global; 404 por propiedad no aplica, los endpoints de adjuntos ya lo cubren en la feature 5) · 401 vía `app.authenticate` (RFC 7807) · sin cambios de BD · web en `features/maintenance/`, `queryOptions` para `attachmentsQuery` y `clientConfigQuery`, textos en `es.json`/`en.json`, `Dialog`/`AlertDialog`/`Button` reutilizados · lógica pura en `attachments.ts` con tests unitarios.
- C5: [x] sin `any` ni `@ts-ignore` · sin fechas ni km nuevos · sin `console.log`, código comentado ni TODOs · ficheros subidos y servidos por la API de la feature 5 (sin cambios aquí).
- C6: [x] `pnpm harness --full` verde · tests afirman resultados concretos (cuerpos multipart, número/orden de peticiones, textos, `disabled`); solo se simula `fetch` · capturas claro/oscuro/móvil referenciadas.
- C7: [x] `progress/impl_maintenance-attachments-web.md` completo · `progress/current.md` refleja la sesión · `docs/PLAN.md` con la línea de `GET /api/config`.

## Hallazgos

Ninguno bloqueante.

## Avisos para el humano (no bloquean)
1. `apps/web/src/features/maintenance/use-attachment-upload.ts:31` — Los `toast.error` por fichero fallido se emiten al **terminar** la tanda, no en el momento en que falla cada fichero. Cumple R13–R16 (no fijan el momento), pero en una tanda larga el usuario no ve el error hasta el final.
2. `apps/web/src/features/maintenance/maintenance-attachments.tsx:44` — El diálogo de facturas (a diferencia del formulario de alta) se puede cerrar con una subida en curso. Las peticiones terminan y los toasts siguen saliendo (sonner es global), así que no se pierde nada visible; solo no se ve el estado «Subiendo…».
3. `maintenance-attachments.tsx:124` — Miniatura vs. icono se decide por `thumbnailUrl` (no por `mimeType`). Coincide con la API (`service.ts:49`: `thumbnailUrl` solo para imágenes), así que R7/R8 se cumplen.
4. `AttachmentPicker` añade la prop `context: 'dialog' | 'create'`, no prevista en la firma del diseño; está justificada en `impl` (desviación 2) y responde a la sección UI.
5. Las capturas viven en el scratchpad de la sesión (`/tmp/claude-1000/…/scratchpad/shots/`): son efímeras; si se quieren conservar, revisarlas antes de Gate 2.

## Cambios requeridos

Ninguno.
