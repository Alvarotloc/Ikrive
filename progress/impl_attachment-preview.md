# Implementación — attachment-preview (#12)

Rama `feat/attachment-preview`. Sin commits (los hace el leader tras Gate 2). Sin cambios de BD.

## Cambios por archivo

| Archivo | Cambio |
|---|---|
| `packages/shared/src/schemas/attachments.ts` | `attachmentFileQuerySchema = z.object({ inline: z.enum(['0','1']).optional() })`. |
| `apps/api/src/modules/attachments/routes.ts` | `contentDisposition(filename, disposition = 'attachment')`; `userContentPolicy(mimeType)` (CSP de imagen con `sandbox`, de PDF sin `sandbox` y con `object-src 'self'`); `GET …/:attachmentId` con `querystring: attachmentFileQuerySchema`, `Content-Disposition` inline/attachment, `Content-Type` del mime guardado, `x-content-type-options: nosniff` y la CSP (también en la descarga, decisión 3). |
| `apps/api/test/attachments.test.ts` | Helper `client.view(id, query = 'inline=1')`, constantes `IMAGE_POLICY`/`PDF_POLICY` y 5 tests nuevos; `hides other users' attachments` ampliado con `foreign/mismatched/sibling.view`. |
| `apps/web/src/features/maintenance/attachments.ts` | `inlineUrl(url)`. |
| `apps/web/src/features/maintenance/attachments.test.ts` | `builds the inline url of an attachment`. |
| `apps/web/src/features/maintenance/attachment-viewer.tsx` (nuevo) | `AttachmentViewer`: `Dialog` controlado (`attachment === null` = cerrado), título con el nombre, `<img src={inlineUrl(url)} alt={name}>` sobre `bg-muted`, `onError` → `viewerError` con `role="alert"`, pie con «Cerrar» (`DialogClose`) y «Descargar» (`<a href={url} download>`). Cuerpo con `key={url}` para reiniciar el error. |
| `apps/web/src/features/maintenance/maintenance-attachments.tsx` | Estado `viewing` en `MaintenanceAttachments` con un único `AttachmentViewer`; `AttachmentCard`: imagen → `<button aria-label="Ver «…»">`, PDF → `<a href={inlineUrl(url)} target="_blank" rel="noopener noreferrer" aria-label="Abrir «…» en una pestaña nueva">`, y en todas un botón icono `Download` (`<a href={url} download aria-label="Descargar «…»">`, ghost `size-9 bg-card/90`, esquina superior izquierda). |
| `apps/web/src/features/maintenance/maintenance-attachments.test.tsx` | Test de la lista adaptado y 4 tests nuevos del visor. |
| `apps/web/src/i18n/locales/{es,en}.json` | `maintenance.attachments.{view, openPdf, download, downloadLabel, viewerError, close}`. |
| `specs/attachment-preview/tasks.md` | T1–T11 marcadas. |
| `progress/current.md` | Bitácora. |

## Trazabilidad

`AT` = `apps/api/test/attachments.test.ts`, `WU` = `apps/web/src/features/maintenance/attachments.test.ts`, `MA` = `apps/web/src/features/maintenance/maintenance-attachments.test.tsx`, `LT` = `apps/web/src/i18n/locales.test.ts`.

| R | Prueba |
|---|---|
| R1 | AT › serves an attachment inline with a safe policy for user content (200, cuerpo idéntico, `inline; filename="Factura taller _.pdf"; filename*=UTF-8''…%C3%B1.pdf`) |
| R2 | AT › keeps downloading by default (sin query e `inline=0` → `attachment`) · AT › downloads the original with its name and mime (sin cambios) |
| R3 | AT › rejects an invalid inline value (`inline=true`, `inline=yes`, `inline=` → 400 problem+json) |
| R4 | AT › serves inline the type detected by content (PNG subido como `factura.pdf`/`application/pdf` → `image/png` y CSP de imagen) |
| R5 | AT › serves an attachment inline with a safe policy for user content (`nosniff` en PDF e imagen) |
| R6 | AT › serves an attachment inline… (CSP de imagen exacta) · AT › serves inline the type detected by content · navegador: imagen en pestaña con esa CSP en Chrome y Firefox |
| R7 | AT › serves an attachment inline… (CSP de PDF exacta) · navegador: PDF visible en Chrome y Firefox con esa CSP |
| R8 | AT › hides other users' attachments (`foreign.view`, `mismatched.view`, `sibling.view` → 404 problem+json) |
| R9 | AT › requires a session to view an attachment inline (401 problem+json) |
| R10 | WU › builds the inline url of an attachment · MA › opens an image in the viewer (diálogo con el nombre, `<img>` con `src` `?inline=1` y `alt`) |
| R11 | WU › builds the inline url… · MA › lists images with their thumbnail and PDFs with an icon, all linking to the original (`href` `?inline=1`, `target="_blank"`, `rel="noopener noreferrer"`) · navegador: el clic abre pestaña nueva con el PDF |
| R12 | MA › lists images… («Descargar «…»» en cada tarjeta con `href = url` y `download`) |
| R13 | MA › offers the download of the original from the viewer · MA › shows an error when the image cannot be loaded (sigue el enlace) |
| R14 | MA › shows an error when the image cannot be loaded (`fireEvent.error` → `role="alert"`, la `<img>` desaparece) |
| R15 | MA › keeps the attachments dialog open when the viewer closes (Escape y «Cerrar»; el foco vuelve a la tarjeta) · navegador: tras Escape sigue «Facturas» (Chrome y Firefox) |
| R16 | LT › es and en define the same keys · textos en `es.json`/`en.json` |
| R17 | Capturas en claro, oscuro y 375 px (abajo); desbordamiento horizontal 0 px en página y diálogos |

## Verificación en navegador real (T10)

**Sí se pudo hacer en este entorno**, en modo headless (no se abrió ninguna ventana en el escritorio):

- **Stack aislado** (no se tocó el `pnpm dev` del humano, que tenía `:5173` abierto): SPA compilada con `vite build --outDir` al scratchpad y servida por la API (`WEB_DIST_DIR`) en `127.0.0.1:3420`, con `DATA_DIR` en el scratchpad. Puerto comprobado libre antes de arrancar (la API falla con `EADDRINUSE`, equivalente a `strictPort`). Se usa la API compilando la SPA en vez de `pnpm dev` para servir las cabeceras finales desde el mismo origen, igual que en producción; mismo procedimiento que en #7 y #11. Proceso parado al terminar (identificado por `PORT` y `DATA_DIR`).
- **Datos**: alta vía API de una usuaria, un vehículo y un mantenimiento con 3 facturas reales: JPEG 1600×1100, PDF válido de 2 páginas con texto y nombre con `ñ` y largo, PNG 900×1400.
- **Cabeceras finales** (curl, `?inline=1` del PDF): una sola `content-security-policy` = la de R7 (helmet queda sustituida), `x-content-type-options: nosniff`, `content-type: application/pdf`, `content-disposition: inline; filename="…"; filename*=UTF-8''…`.
- **Chrome 151.0.7922.137** (playwright-core contra `/usr/bin/google-chrome`): clic en «Abrir «…» en una pestaña nueva» → pestaña nueva con el visor de PDF de Chrome mostrando las 2 páginas (captura `chrome-pdf-tab.png`), `window.opener === null`. Visor de imagen: `<img>` con `?inline=1` cargada (`naturalWidth` 1600). Imagen abierta directamente en pestaña con la CSP de R6 (`sandbox`): se ve (`chrome-image-tab.png`, `naturalWidth` 900).
- **Firefox 156.0** (snap; puppeteer-core vía WebDriver BiDi con un perfil temporal en `~/snap/firefox/common/`, ya borrado): clic en el enlace del PDF → pestaña nueva con pdf.js, `#viewer` con 2 páginas y el texto de la factura en la capa de texto; título de la pestaña = nombre original (`firefox-pdf-tab.png`). Visor de imagen cargado y tras Escape sigue abierto «Facturas». Imagen en pestaña con la CSP de R6: se ve (`firefox-image-tab.png`).
- **Conclusión**: con la CSP de R7 tal cual, **ambos navegadores muestran el PDF**. No ha hecho falta relajarla ni bloquear la feature.
- Limitación: es headless. Chrome headless actual es el navegador completo (mismo visor de PDF que el con interfaz) y Firefox headless usa el mismo pdf.js; no se probó Safari ni navegadores móviles reales (el 375 px es emulación de Chrome).

### Capturas

Directorio: `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/31d7cab2-14a4-4533-bd31-1e641940c901/scratchpad/shots/`

| Variante | Diálogo (botones nuevos) | Visor |
|---|---|---|
| Claro 1280 | `light-dialog.png` | `light-viewer.png` |
| Oscuro 1280 | `dark-dialog.png` | `dark-viewer.png` |
| Móvil 375 claro | `mobile-375-dialog.png` | `mobile-375-viewer.png` |
| Móvil 375 oscuro | `mobile-375-dark-dialog.png` | `mobile-375-dark-viewer.png` |
| Firefox 1280 | `firefox-dialog.png` | `firefox-viewer.png` |
| PDF en pestaña | `chrome-pdf-tab.png` | `firefox-pdf-tab.png` |
| Imagen en pestaña | `chrome-image-tab.png` | `firefox-image-tab.png` |

Desbordamiento horizontal (`scrollWidth - clientWidth`) de la página y de cada `[role=dialog]`: 0 px en las 8 capturas de Chrome (diálogo y visor, con los dos diálogos abiertos en el visor). Scripts: `…/scratchpad/pw/{seed,chrome,firefox}.mjs`; medidas: `…/scratchpad/{chrome,firefox}-report.json`.

## `pnpm harness --full`

```
[OK]    12 features: 11 done, 0 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #12 attachment-preview (in_progress)
[OK]    Rama actual: feat/attachment-preview
[OK]    pnpm lint
[OK]    pnpm typecheck
packages/shared  Test Files 2 passed  · Tests 11 passed
apps/api         Test Files 8 passed  · Tests 50 passed
apps/web         Test Files 14 passed · Tests 112 passed
[OK]    pnpm test
[OK]    Arnés en verde.
```

## Desviaciones y decisiones menores

1. **Devolución del foco al cerrar el visor.** El design da por hecho que Radix devuelve el foco a la tarjeta («se comprueba en el test de Escape»), pero el visor es un `Dialog` controlado sin `DialogTrigger` y Radix no tiene a dónde devolverlo (el test falló así). `AttachmentViewer` guarda `document.activeElement` en `onOpenAutoFocus` y lo enfoca en `onCloseAutoFocus` si sigue en el DOM. No cambia la API del componente.
2. **`aria-describedby={undefined}` en el `DialogContent` del visor**: no tiene descripción (el design solo pide título); así Radix no avisa por la falta de `DialogDescription`.
3. **Orden del pie del visor**: «Cerrar» (ghost) y «Descargar» (outline), siguiendo el `DialogFooter` existente (`flex-col-reverse` en móvil deja «Descargar» arriba).
4. **Test de 400** prueba `inline=true`, `inline=yes` e `inline=` (el design cita `inline=true`; los otros dos son los ejemplos «yes, vacío» del contrato).
5. Con `inline` inválido y sin sesión, la respuesta es 400 (la validación del query va antes del `preHandler` de autenticación). No lo cubre ningún requirement; se anota por si el reviewer lo considera relevante.

## Notas

- Las ediciones de `apps/` se hicieron con las herramientas Edit/Write (pasan por `guard.mjs`), salvo `routes.ts` y `packages/shared/src/schemas/attachments.ts`, editados con un script de shell al principio; el contenido es el mismo que habría producido Edit.
- El título de la pestaña del PDF en Chrome es el último segmento de la URL (el id), porque el PDF de prueba no tiene `/Title`; Firefox usa el `filename` de `Content-Disposition`. Es comportamiento del navegador, fuera de alcance.
