# Design — attachment-preview

API (`apps/api/src/modules/attachments/routes.ts`), un esquema en `packages/shared` y la web (`apps/web/src/features/maintenance/`). **Sin cambios de BD**: el mime ya se detecta por contenido al subir (`detectAttachmentType` + `assertDecodableImage`, feature 5) y se guarda en `attachments.mime_type`. Reutiliza `contentDisposition`, `service.open` (cadena de propiedad vehículo → mantenimiento → adjunto) y el `Dialog` de Radix ya usado por `MaintenanceAttachmentsDialog`.

## Archivos

| Capa | Archivo | Cambio |
|---|---|---|
| shared | `packages/shared/src/schemas/attachments.ts` | `attachmentFileQuerySchema = z.object({ inline: z.enum(['0', '1']).optional() })`. |
| api | `apps/api/src/modules/attachments/routes.ts` | `contentDisposition(filename, disposition = 'attachment')`; `userContentPolicy(mimeType)`; `GET ${BASE}/:attachmentId` con `querystring: attachmentFileQuerySchema` y cabeceras en línea. |
| api/test | `apps/api/test/attachments.test.ts` | `client.view(id, query = 'inline=1')` y tests nuevos (ver «Tests»). |
| web/feature | `apps/web/src/features/maintenance/attachments.ts` | `inlineUrl(url)`. |
| web/feature | `apps/web/src/features/maintenance/attachments.test.ts` | Unitario de `inlineUrl`. |
| web/feature | `apps/web/src/features/maintenance/attachment-viewer.tsx` (nuevo) | `AttachmentViewer`: `Dialog` con la imagen, nombre, descargar y estado de error. |
| web/feature | `apps/web/src/features/maintenance/maintenance-attachments.tsx` | `AttachmentCard`: imagen → botón que abre el visor; PDF → `<a target="_blank">` a la URL en línea; enlace «Descargar» en todas. |
| web/feature | `apps/web/src/features/maintenance/maintenance-attachments.test.tsx` | Adaptar el test de la lista y añadir los del visor. |
| i18n | `apps/web/src/i18n/locales/{es,en}.json` | `maintenance.attachments.{view, openPdf, download, downloadLabel, viewerError, close}`. |

## Contrato HTTP

`GET /api/vehicles/:id/maintenance/:recordId/attachments/:attachmentId[?inline=0|1]` (autenticado; el resto de endpoints no cambia).

| Caso | Respuesta |
|---|---|
| sin `inline` / `inline=0` | 200, como hoy: `Content-Type` = mime guardado, `Content-Length`, `Content-Disposition: attachment; filename="…"; filename*=UTF-8''…`, `Cache-Control: private, max-age=31536000, immutable` |
| `inline=1` | 200, mismas cabeceras salvo `Content-Disposition: inline; filename="…"; filename*=…`, y además `X-Content-Type-Options: nosniff` y la CSP de `userContentPolicy` |
| `inline` con otro valor (`true`, `yes`, vacío…) | 400 problem+json (validación zod de `querystring`) |
| adjunto de otro usuario / otro vehículo / otro mantenimiento / inexistente | 404 problem+json (`service.open`, sin cambios) |
| sin sesión | 401 problem+json (`app.authenticate`) |

La CSP y `nosniff` se aplican **también a la descarga** (mismo helper, sin coste y defensa en profundidad si un navegador ignorase `attachment`), pero solo se exigen y prueban en línea. `nosniff` ya lo pone helmet en todas las respuestas; el route lo fija explícitamente para no depender de la configuración global.

### Seguridad del contenido en línea (mismo origen)

Riesgo: que un fichero subido se interprete como documento activo (HTML/SVG/JS) en el origen de la SPA y lea la sesión o llame a la API. Capas:

1. **Mime validado por contenido**: solo se guardan PDF, JPEG, PNG y WebP detectados por magic bytes (y las imágenes, decodificables con `sharp`). `Content-Type` sale de la BD, nunca del cliente; SVG y HTML no pueden llegar a existir como adjunto.
2. **`nosniff`**: el navegador no reinterpreta el cuerpo con otro tipo.
3. **CSP por tipo** (`userContentPolicy`), que sustituye a la CSP global de helmet en esta respuesta:
   - Imágenes: `default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; sandbox`. `sandbox` sin tokens da un origen opaco y sin scripts; `style-src 'unsafe-inline'` solo para el documento sintético con que el navegador centra la imagen.
   - PDF: lo mismo **sin `sandbox`** y con `object-src 'self'`. Chromium no carga su visor de PDF en documentos con `sandbox` (muestra «Chrome ha bloqueado esta página») y el visor se monta como plugin, que `default-src 'none'` bloquearía vía `object-src`. Los scripts de página siguen prohibidos (`script-src` cae en `'none'`); el JavaScript propio del PDF lo ejecutan PDFium/pdf.js en su propio sandbox, sin acceso al DOM ni a las cookies del origen.
   - `frame-ancestors 'none'`: la web no incrusta el original (el visor usa `<img>`, al que la CSP de la respuesta no afecta), así que nadie puede enmarcarlo.
4. **Pestaña nueva sin opener**: `rel="noopener noreferrer"`; el PDF no recibe `window.opener` de la SPA.

La cookie de Better Auth (httpOnly, `SameSite=Lax`) viaja en la navegación de nivel superior al mismo origen, así que la pestaña nueva queda autenticada sin tokens en la URL. En desarrollo pasa por el proxy `/api` de Vite (mismo origen).

## Tipos y firmas

```ts
// packages/shared — schemas/attachments.ts
export const attachmentFileQuerySchema = z.object({ inline: z.enum(['0', '1']).optional() });

// api — modules/attachments/routes.ts
export function contentDisposition(filename: string, disposition: 'attachment' | 'inline' = 'attachment'): string;
export function userContentPolicy(mimeType: AttachmentMimeType): string; // CSP de imagen o de PDF (R6/R7)

// web — features/maintenance/attachments.ts
export const inlineUrl = (url: string) => `${url}?inline=1`; // `url` del DTO nunca lleva query

// web — features/maintenance/attachment-viewer.tsx
export function AttachmentViewer(props: {
  attachment: Pick<Attachment, 'url' | 'originalName'> | null; // null = cerrado
  onClose(): void;
}): JSX.Element;
```

La URL en línea se compone en la web en vez de añadir `inlineUrl` al DTO: es una regla fija sobre `url` y evita tocar `attachmentSchema` y sus tests.

## UI

- **Tarjeta** (`AttachmentCard`), misma rejilla y tamaño que hoy:
  - Imagen: `<button type="button" aria-label="Ver «{{name}}»">` con la miniatura y el nombre; abre el visor (`viewing` en el estado de `MaintenanceAttachments`, un único visor para toda la lista).
  - PDF: `<a href={inlineUrl(url)} target="_blank" rel="noopener noreferrer" aria-label="Abrir «{{name}}» en una pestaña nueva">` con el icono `FileText` y el nombre.
  - Todas: botón icono `Download` (ghost, `size-9`, `bg-card/90` como el de borrar) `<a href={url} download aria-label="Descargar «{{name}}»">`, en la esquina superior izquierda (el de borrar sigue en la derecha). Táctil ≥ 36 px como el de borrar.
- **Visor** (`AttachmentViewer`): `Dialog` anidado en el de facturas (Radix lo soporta: Escape y el clic fuera cierran solo el de arriba, R15). `DialogContent className="max-h-[95dvh] max-w-[min(64rem,95vw)]"`, `DialogTitle` con el nombre (`break-words`), `<img className="max-h-[75dvh] w-full object-contain">` sobre `bg-muted`, y pie con `Button asChild variant="outline"` → `<a href={url} download>` «Descargar» y `DialogClose` «Cerrar». Mientras carga, el `bg-muted` hace de marcador; `onError` → `viewerError` con `role="alert"` y se oculta la `<img>`. El estado de error se reinicia al cambiar de adjunto (`key={attachment.url}`).
- Tokens semánticos solo → modo oscuro sin trabajo extra; móvil: el visor ocupa el ancho y la imagen se limita por altura.

## i18n

`maintenance.attachments.{view: "Ver «{{name}}»", openPdf: "Abrir «{{name}}» en una pestaña nueva", download: "Descargar", downloadLabel: "Descargar «{{name}}»", viewerError: "No se ha podido cargar la imagen.", close: "Cerrar"}` y sus equivalentes en inglés. Paridad cubierta por `es and en define the same keys` (`i18n/locales.test.ts`).

## Tests

- **API** (`attachments.test.ts`), helper `view(id, query = 'inline=1')` en `client`:
  - `serves an attachment inline with a safe policy for user content`: PDF → 200, cuerpo idéntico, `content-type: application/pdf`, `content-disposition` inline con `filename*` (nombre con `ñ`), `x-content-type-options: nosniff`, CSP de PDF exacta. Imagen PNG → CSP de imagen exacta con `sandbox`.
  - `serves inline the type detected by content`: PNG subido como `factura.pdf`/`application/pdf` → `content-type: image/png` y CSP de imagen.
  - `keeps downloading by default`: sin query e `inline=0` → `attachment` (el test existente de descarga sigue igual).
  - `rejects an invalid inline value`: `inline=true` → 400 problem+json.
  - Autorización: ampliar `hides other users' attachments` con `foreign.view`, `mismatched.view` y `sibling.view` → 404 problem+json; `requires a session to view an attachment inline` → 401.
- **Unitario** (`attachments.test.ts` web): `inlineUrl`.
- **Componente** (`maintenance-attachments.test.tsx`): adaptar `lists images…` (la imagen ya no es enlace; el PDF enlaza a la URL en línea con `target`/`rel`; cada tarjeta tiene «Descargar «…»» con `href = url` y `download`); nuevos `opens an image in the viewer`, `offers the download of the original from the viewer`, `shows an error when the image cannot be loaded` (`fireEvent.error` sobre la `<img>`: jsdom no carga imágenes) y `keeps the attachments dialog open when the viewer closes` (Escape).
- **Navegador real** (no automatizable en jsdom/headless): abrir un PDF y una imagen en línea en Chrome y Firefox con las cabeceras finales y comprobar que se ven; capturas en claro, oscuro y 375 px.

## Alternativas descartadas

- **Servir los adjuntos desde otro origen** (subdominio de contenido, como `githubusercontent`): es la defensa más fuerte, pero Ikrive es una imagen Docker self-hosted con un único origen; exigir un segundo dominio y su cookie rompe la instalación de un solo contenedor.
- **Visor de PDF propio con pdf.js en la SPA**: control total y sin pestaña nueva, pero añade ~1 MB de dependencia y un worker, y el acceptance pide expresamente el visor del navegador.
- **`<iframe>`/`<embed>` del PDF dentro de un diálogo**: obligaría a relajar `frame-ancestors` y el visor embebido es pobre en móvil (iOS Safari solo muestra la primera página).
- **Blob URL (`fetch` + `URL.createObjectURL`) para abrir el PDF**: carga el fichero entero en memoria antes de abrir, pierde el nombre en la pestaña y en la descarga del visor, y el `blob:` hereda el origen de la SPA sin la CSP de la respuesta. La navegación directa con cookie es más simple y segura.
- **Token firmado de un solo uso en la URL**: innecesario con cookie `SameSite=Lax` en el mismo origen, y filtra un secreto en el historial.
- **`inline` como booleano de zod (`z.coerce.boolean()`)**: convierte `"false"` en `true`; un `enum('0','1')` es explícito y rechaza el resto (R3).

## Decisiones a validar (Gate 1)

1. **Query `?inline=1`** sobre la ruta existente (no una ruta `/view` nueva); `inline=0` equivale a omitirlo y cualquier otro valor es 400.
2. **CSP distinta para PDF**: sin `sandbox` y con `object-src 'self'`, porque con `sandbox` Chromium bloquea su visor de PDF. Si en la verificación en navegador (T10) algún navegador no muestra el PDF con esa CSP, el implementer **no la relaja por su cuenta**: marca la feature `blocked` y lo consulta.
3. La misma CSP y `nosniff` también en la **descarga** (`attachment`), aunque solo se exigen en línea.
4. **`frame-ancestors 'none'`**: el original no se puede incrustar ni desde la propia app (el visor usa `<img>`; las miniaturas no cambian).
5. **Imagen → visor en la app; PDF → pestaña nueva** siempre, también en móvil. El visor muestra el original (no la miniatura) y no tiene zoom ni navegación entre facturas.
6. **Descarga explícita** con un botón icono en cada tarjeta (esquina superior izquierda) y en el pie del visor.

## Riesgos

- **Sesión caducada** al abrir el PDF: la pestaña nueva muestra el 401 problem+json en crudo. Aceptable (la SPA ya habría redirigido al login en su siguiente petición); sin manejo extra.
- **Caché**: `?inline=1` es otra URL, con su propia entrada `immutable`; no se mezcla con la descarga.
- **helmet** fija sus cabeceras en `onRequest`; el route las sobrescribe en el handler. El test compara la CSP exacta, así que una regresión (p. ej. helmet pasando a `onSend`) se detecta.
- **Diálogos anidados** de Radix: el foco vuelve a la tarjeta al cerrar el visor; se comprueba en el test de Escape.
- Navegadores: el comportamiento del visor de PDF con CSP no se puede probar en jsdom; queda en la verificación manual (T10).

## Fuera de alcance

- Zoom, rotación, galería con flechas o descarga de todas las facturas.
- Previsualizar PDF dentro de la app o generar miniatura de la primera página del PDF.
- Cambiar la CSP global de la SPA o las miniaturas.
- Adjuntos de otras entidades (repostajes, fase 5).
