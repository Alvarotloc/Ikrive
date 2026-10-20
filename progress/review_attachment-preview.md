# Review — #12 attachment-preview

**Veredicto:** APPROVED

Revisado contra `specs/attachment-preview/`, `CONTRIBUTING.md`, `docs/sdd.md`, `docs/verification.md`, `docs/PLAN.md` y `CHECKPOINTS.md`. Diff: `git diff main...HEAD` (solo spec + `feature_list.json`) y los cambios sin commitear (9 archivos modificados en `apps/`/`packages/` + `attachment-viewer.tsx` nuevo).

## Trazabilidad requirements ↔ tests

`AT` = `apps/api/test/attachments.test.ts`, `WU` = `apps/web/src/features/maintenance/attachments.test.ts`, `MA` = `apps/web/src/features/maintenance/maintenance-attachments.test.tsx`.

- R1: [x] AT › `serves an attachment inline with a safe policy for user content`: 200, `rawPayload.equals(invoice)`, `content-disposition` exacta `inline; filename="Factura taller _.pdf"; filename*=UTF-8''Factura%20taller%20%C3%B1.pdf` (y la de la PNG).
- R2: [x] AT › `keeps downloading by default`: sin query e `inline=0` → 200, cuerpo idéntico y `attachment; filename=…; filename*=…` exacto. El test previo de descarga sigue intacto.
- R3: [x] AT › `rejects an invalid inline value`: `inline=true`, `inline=yes`, `inline=` → 400 `application/problem+json` (vía `expectProblem`) y sin `content-disposition`.
- R4: [x] AT › `serves inline the type detected by content`: PNG subida como `factura.pdf`/`application/pdf` → `content-type: image/png` y CSP de imagen.
- R5: [x] AT › `serves an attachment inline…`: `x-content-type-options: nosniff` afirmado en PDF e imagen.
- R6: [x] AT › `serves an attachment inline…` y `serves inline the type detected by content`: CSP de imagen comparada con `toBe` contra la cadena exacta del requirement (con `sandbox`). Al ser igualdad exacta, una segunda CSP de helmet (array/concatenación) haría fallar el test. Además lo verificó en Chrome y Firefox (T10).
- R7: [x] AT › `serves an attachment inline…`: CSP de PDF exacta (`object-src 'self'`, sin `sandbox`). En navegador real el PDF se ve en Chrome y Firefox con esa CSP (capturas `chrome-pdf-tab.png`, `firefox-pdf-tab.png`).
- R8: [x] AT › `hides other users' attachments`: `foreign.view`, `mismatched.view` y `sibling.view` → 404 problem+json.
- R9: [x] AT › `requires a session to view an attachment inline`: sin cookie → 401 problem+json, sin `content-disposition`.
- R10: [x] MA › `opens an image in the viewer`: diálogo con nombre accesible `ticket.jpg` e `<img>` con `alt` y `src` `…/a1?inline=1`. WU › `builds the inline url of an attachment`.
- R11: [x] MA › `lists images with their thumbnail and PDFs with an icon…`: enlace del PDF con `href` `?inline=1`, `target="_blank"` y `rel="noopener noreferrer"`.
- R12: [x] MA › mismo test: «Descargar «…»» en cada tarjeta con `href = url` (sin query) y `download`.
- R13: [x] MA › `offers the download of the original from the viewer` (`href = url`, `download`), y sigue presente en el estado de error.
- R14: [x] MA › `shows an error when the image cannot be loaded`: `fireEvent.error` → `role="alert"` con el texto y la `<img>` desaparece.
- R15: [x] MA › `keeps the attachments dialog open when the viewer closes`: Escape y «Cerrar» cierran solo el visor; el diálogo «Facturas» sigue y el foco vuelve a la tarjeta.
- R16: [x] Claves `view, openPdf, download, downloadLabel, viewerError, close` en `es.json` y `en.json`; paridad cubierta por `i18n/locales.test.ts`.
- R17: [x] Capturas en claro, oscuro y 375 px (claro y oscuro) en el scratchpad (`shots/`), existen y las he revisado. Desbordamiento horizontal medido: 0 px.

## Tasks
- T1..T11: [x] (todas marcadas; T10 documentada con navegador real en `impl_attachment-preview.md`).

## Seguridad de las cabeceras en línea (comprobada específicamente)
- **CSP única**: `@fastify/helmet` 13 escribe sus cabeceras en `onRequest` con `reply.raw.setHeader`. El handler fija `content-security-policy` con `reply.header`, y Fastify la emite en `writeHead`. Así, Node da prioridad a la del route y no queda una segunda CSP. El test lo cubre con igualdad exacta y el implementer lo confirmó con curl contra el servidor real.
- **CSP de imagen**: `default-src 'none'` + `sandbox` sin tokens, es decir, origen opaco y sin scripts. **CSP de PDF**: sin `sandbox` (decisión 2 aprobada en Gate 1), pero `script-src` cae en `'none'`, con `frame-ancestors 'none'`, `base-uri 'none'` y `form-action 'none'`. Ambas son exactamente las de R6 y R7.
- **nosniff** explícito en el route, sin depender de helmet. **Content-Type** sale de `row.mimeType`, detectado por contenido en la subida, y nunca de la petición.
- La CSP y `nosniff` se aplican también a la descarga (decisión 3 del design).
- **Autorización**: el route sigue usando `service.open(currentUser(request).id, …)` con la cadena de propiedad vehículo → mantenimiento → adjunto. Las cabeceras de contenido solo se fijan después de `open`, así que un 404 o un 401 no llevan `content-disposition` ni el cuerpo.
- **Web**: el PDF se abre con `rel="noopener noreferrer"` y el visor usa `<img>`, al que no afecta el `frame-ancestors 'none'` de la respuesta.

## Checkpoints
- C1: [x] `pnpm harness` en verde, una sola feature activa (#12 `in_progress`), rama `feat/attachment-preview`.
- C2: [x] Spec completo, EARS con tabla de acceptance completa, tasks `[x]` y cada `R<n>` con un test leído.
- C3: [x] El diff solo toca los archivos de la tabla del design. No hay cambios de otras features.
- C4: [x] Query validada con `attachmentFileQuerySchema` de `@ikrive/shared`; propiedad → 404; errores RFC 7807; sin cambios de BD (como prevé el design); web en `features/maintenance/`; textos en es/en; reutiliza `Dialog`/`Button`.
- C5: [x] Sin `any`, `@ts-ignore`, `console.log` ni TODOs nuevos; ficheros servidos con control de acceso.
- C6: [x] `pnpm harness --full` en verde (lint, typecheck; tests: shared 11, api 50, web 112). Tests contra SQLite en memoria, sin mocks de BD. Capturas en claro, oscuro y móvil referenciadas.
- C7: [x] `impl_attachment-preview.md` completo; `progress/current.md` describe la sesión; `docs/PLAN.md` no cambia mientras no se cierre (la fase 3 se cierra con esta feature y eso lo actualiza el leader en Gate 2).

## Hallazgos
Ninguno bloqueante.

## Avisos para el humano (no bloquean)
1. **Desviación 1 (foco)**: el visor es un `Dialog` controlado sin `DialogTrigger`, así que guarda `document.activeElement` en `onOpenAutoFocus` y lo restaura en `onCloseAutoFocus` si sigue conectado. Es correcto y lo cubre el test de R15 (`toHaveFocus`). Me parece razonable.
2. **Desviación 2 (`aria-describedby={undefined}`)**: es el patrón documentado por Radix para diálogos sin descripción. El diálogo sigue nombrado por su `DialogTitle`. Aceptable.
3. **Desviación 5 (400 antes de 401)**: con `inline` inválido y sin sesión se responde 400, porque la validación de esquema de Fastify corre antes del `preHandler` de autenticación. No filtra nada: solo valida la forma del query, no consulta la BD ni revela si el adjunto existe. Es el mismo comportamiento que ya tienen los `params` del resto de rutas. No lo exige ningún requirement.
4. **PDF sin `sandbox`**: es la decisión 2 aprobada en Gate 1. La CSP sigue bloqueando los scripts de página, pero es la capa más débil del diseño. Si algún día hay un segundo origen para contenido de usuario, convendría moverlo ahí (ya figura como alternativa descartada).
5. Al cierre de la feature, actualizar `docs/PLAN.md`: la fase 3 pasa a ✅ y conviene añadir una línea en «Decisiones» sobre el servicio en línea con CSP por tipo.
6. El nombre del test `lists images … all linking to the original` ya no describe del todo el comportamiento: la imagen es ahora un botón. Es solo cosmético.

## Cambios requeridos
Ninguno.
