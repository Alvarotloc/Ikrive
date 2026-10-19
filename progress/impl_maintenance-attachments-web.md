# Implementación — maintenance-attachments-web

> Feature #7 · rama `feat/maintenance-attachments-web` · 18/18 tasks hechas · `pnpm harness --full` en verde. Sin commits.

## Cambios por archivo

### shared / api
- `packages/shared/src/schemas/common.ts`: `clientConfigSchema` (`{ maxUploadMb: int > 0 }`) y `ClientConfig`.
- `apps/api/src/modules/client-config/routes.ts` (nuevo): `clientConfigRoutes`, `GET /config` con `preHandler: app.authenticate` y respuesta `clientConfigSchema`; opción `maxUploadMb`.
- `apps/api/src/app.ts`: registra `clientConfigRoutes` con `config.MAX_UPLOAD_MB` junto a `healthRoutes`.
- `apps/api/test/client-config.test.ts` (nuevo): 2 tests de integración.

### web
- `src/lib/query-keys.ts`: `config` y `vehicles.attachments(id, recordId)` (cuelga de `maintenance(id)`).
- `src/lib/client-config.ts` (nuevo): `clientConfigQuery` (`staleTime: Infinity`).
- `src/features/maintenance/attachments.ts` (nuevo): `ATTACHMENT_ACCEPT`, `exceedsUploadLimit`, `uploadErrorKey`, `uploadSequentially`.
- `src/features/maintenance/attachments.test.ts` (nuevo): 6 tests unitarios.
- `src/features/maintenance/queries.ts`: `attachmentsQuery`, `useUploadAttachment(vehicleId)` (variables `{ recordId, file }`, `FormData` `file`), `useDeleteAttachment(vehicleId, recordId)`. Solo invalidan la clave de adjuntos del registro.
- `src/features/maintenance/use-attachment-upload.ts` (nuevo): `useAttachmentUpload` → `maxUploadMb`, `acceptFiles` (toast de tamaño por fichero descartado), `uploadFiles` (en serie, toast por fallo, un `toast.success` con el total, nunca lanza).
- `src/features/maintenance/attachment-picker.tsx` (nuevo): `AttachmentPicker` con input `file` `multiple` `accept` `sr-only` y `aria-label` «Elegir facturas», botón y ayuda «PDF, JPG, PNG o WebP · máx. N MB» (solo con límite conocido, enlazada con `aria-describedby`).
- `src/features/maintenance/maintenance-attachments.tsx` (nuevo): `MaintenanceAttachmentsDialog` (estados cargando/error/vacío, rejilla de tarjetas con `<a href={url}>` que envuelve miniatura o icono `FileText` y nombre, picker deshabilitado durante la tanda, `DeleteAttachmentDialog` con `AlertDialog`). No depende de TanStack Router.
- `src/features/maintenance/maintenance-attachments.test.tsx` (nuevo): 14 tests de componente.
- `src/features/maintenance/maintenance-form.tsx`: en alta, bloque «Facturas» (picker + lista de elegidos con quitar). `onSubmit` crea, después sube con `uploadFiles(created.id, …)`, avisa con `retryHint` si alguna falla y cierra siempre tras crear. Si el alta falla no se sube nada. El botón de guardar dice «Subiendo facturas…» y sigue deshabilitado (`isSubmitting`). Mientras se guarda, `MaintenanceFormDialog` ignora el cierre (Escape, clic fuera, Cancelar): el formulario avisa con `onBusyChange`.
- `src/features/maintenance/maintenance-form.test.tsx`: `setup` añade `GET /config`, helper `uploadedNames` para cuerpos `FormData` y 8 tests nuevos.
- `src/features/maintenance/maintenance-timeline.tsx`: botón `Paperclip` («Facturas de «título»») en `MaintenanceRow` y estado `attachmentsFor` + `attachmentsOpen` en `MaintenanceSection` que monta el diálogo. En móvil los iconos van en la línea del badge (ver desviaciones).
- `src/features/maintenance/maintenance-timeline.test.tsx`: test `opens the attachments dialog of a record`.
- `src/test/render.tsx`: los handlers en forma de función de `mockApi` pueden devolver `Promise<MockResponse>` (`await route(request)`). Retrocompatible.
- `src/i18n/locales/{es,en}.json`: `maintenance.attachments.*` (incluye `uploaded_one/_other` y `errors.{type,size,sizeUnknownLimit}`).

### docs
- `docs/PLAN.md` (fase 3): una línea sobre `GET /api/config` y `maxUploadMb`.

## Trazabilidad

Abreviaturas: **CC** `apps/api/test/client-config.test.ts` · **AT** `apps/web/src/features/maintenance/attachments.test.ts` · **MA** `…/maintenance-attachments.test.tsx` · **MF** `…/maintenance-form.test.tsx` · **MT** `…/maintenance-timeline.test.tsx` · **LO** `apps/web/src/i18n/locales.test.ts`.

| R | Pruebas |
|---|---|
| R1 | MT › opens the attachments dialog of a record · MA › lists images with their thumbnail and PDFs with an icon, all linking to the original |
| R2 | MA › shows the empty message when the record has no attachments |
| R3 | AT › accepts exactly the attachment mime types · MA › offers a multiple file picker limited to the attachment types |
| R4 | AT › uploads files one by one and keeps going after a failure · MA › uploads several files one request each and refreshes the list |
| R5 | MA › uploads several files one request each and refreshes the list («2 facturas subidas», `GET` repetido, lista nueva) |
| R6 | MA › disables the upload button while an upload is in progress |
| R7 | MA › lists images with their thumbnail… (`src` = `thumbnailUrl`, `alt` = nombre) · capturas `*-dialog.png` |
| R8 | MA › lists images with their thumbnail… (sin `<img>` en la tarjeta PDF, icono `svg`) · capturas `*-dialog.png` |
| R9 | MA › lists images with their thumbnail… (nombres visibles) |
| R10 | MA › lists images with their thumbnail… (`href` = `url` en imagen y PDF) |
| R11 | MA › deletes an attachment only after confirming |
| R12 | MA › deletes an attachment only after confirming («Factura eliminada», 2 `GET`, la factura desaparece) |
| R13 | AT › maps a 415 problem to the unsupported type message · MA › shows the unsupported type error with the file name and keeps uploading the rest · MF › keeps the record and points to the attachments dialog when an invoice fails |
| R14 | AT › maps a 413 problem to the size message with or without a known limit · MA › shows the size error with the file name and the limit when the API answers 413 · MA › shows the size error without the limit when the config is unavailable |
| R15 | AT › maps any other error to the generic message · MA › shows the generic error when an upload fails for another reason · MA › shows the generic error when deleting fails |
| R16 | AT › uploads files one by one and keeps going after a failure · MA › shows the unsupported type error… keeps uploading the rest · MF › keeps the record and points to the attachments dialog… |
| R17 | LO › es and en define the same keys |
| R18 | Capturas en claro, oscuro y 375 px (abajo). Desbordamiento horizontal medido: 0 px en la página y en el diálogo en las 16 capturas |
| R19 | MA › shows the loading message and then the error when the list fails |
| R20 | MA › shows the loading message and then the error when the list fails |
| R21 | CC › returns the upload limit configured in MAX_UPLOAD_MB |
| R22 | CC › requires a session |
| R23 | MA › shows the accepted types and the upload limit next to the picker · MF › lets the user choose several invoices when creating · capturas `*-dialog.png`, `*-create-form.png` |
| R24 | AT › flags only files larger than the limit · MA › rejects files over the limit without uploading them · MF › rejects invoices over the limit when choosing them · capturas `*-dialog-size-error.png` |
| R25 | MF › lets the user choose several invoices when creating · capturas `*-create-form.png` |
| R26 | MF › removes a chosen invoice before saving |
| R27 | MF › uploads the chosen invoices after creating the record (alta antes que las subidas, 2 `POST …/r9/attachments` en orden, toasts) · MF › keeps the record and points to the attachments dialog… |
| R28 | MF › keeps the record and points to the attachments dialog when an invoice fails (diálogo cerrado, ningún `DELETE`) |
| R29 | MF › keeps the record and points to the attachments dialog when an invoice fails (toast `retryHint`) |
| R30 | MF › disables save while the invoices upload (y Escape no cierra mientras sube) · MF › does not upload invoices when the creation fails |
| R31 | MF › does not offer invoices when editing |

## Capturas (T10)

Stack propio, sin tocar el `pnpm dev` del humano (`:3000`/`:5173` no se usaron): SPA compilada con `vite build --outDir` en el scratchpad y servida por la API (`WEB_DIST_DIR`) en `127.0.0.1:3417`. Antes de arrancar se comprobó que el puerto estaba libre, y la API falla con `EADDRINUSE` si no lo está, igual que `strictPort`. `DATA_DIR` y BD también en el scratchpad, y `MAX_UPLOAD_MB=2`. Se siembra vía API un vehículo con 3 mantenimientos; el primero, con título largo, tiene 4 facturas reales: JPEG, PDF de nombre largo, PNG y WebP, con miniaturas generadas por la API. Después, playwright-core contra `/usr/bin/google-chrome`. La API ya está parada y no se creó nada en `apps/web/dist`.

Directorio: `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/8ef5a675-0150-4682-956e-eeb9f75b7de2/scratchpad/shots/`

| Variante | Timeline | Diálogo (miniaturas, PDF, ayuda) | Toast de tamaño (cliente) | Alta con 2 facturas |
|---|---|---|---|---|
| Claro 1280 | `light-timeline.png` | `light-dialog.png` | `light-dialog-size-error.png` | `light-create-form.png` |
| Oscuro 1280 | `dark-timeline.png` | `dark-dialog.png` | `dark-dialog-size-error.png` | `dark-create-form.png` |
| Móvil 375 claro | `mobile-375-timeline.png` | `mobile-375-dialog.png` | `mobile-375-dialog-size-error.png` | `mobile-375-create-form.png` |
| Móvil 375 oscuro | `mobile-375-dark-timeline.png` | `mobile-375-dark-dialog.png` | `mobile-375-dark-dialog-size-error.png` | `mobile-375-dark-create-form.png` |

Desbordamiento horizontal (`scrollWidth - clientWidth`) de la página y del `[role=dialog]`: 0 px en todas. Script: `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/8ef5a675-0150-4682-956e-eeb9f75b7de2/scratchpad/pw/shots.mjs`. Medidas: `…/scratchpad/shots-report.json`.

## Verificación

`pnpm harness --full`:

```
[OK]    12 features: 9 done, 2 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #7 maintenance-attachments-web (in_progress)
[OK]    Rama actual: feat/maintenance-attachments-web
[OK]    pnpm lint
[OK]    pnpm typecheck
packages/shared  Test Files 2 passed  · Tests 11 passed
apps/api         Test Files 8 passed  · Tests 42 passed
apps/web         Test Files 13 passed · Tests 104 passed
[OK]    pnpm test
[OK]    Arnés en verde.
```

## Desviaciones y decisiones menores

1. **Fila de la timeline en móvil** (riesgo previsto en el diseño). Con 3 iconos en la columna derecha, a 375 px los títulos largos se partían en 4 líneas. Se aplica la contingencia del diseño: en móvil los iconos pasan a la primera línea, junto al badge, y título y detalles ocupan todo el ancho debajo. Desde `sm` la fila de 3 columnas no cambia. Los tests de la timeline siguen en verde.
2. **`AttachmentPicker` recibe una prop `context: 'dialog' | 'create'`**, que no está en la firma del diseño. Es lo que permite el texto, el icono y la variante que pide la sección UI («Subir facturas» `accent` con `Upload` en el diálogo, «Añadir facturas» `outline` en el alta).
3. **Cierre ignorado mientras se guarda** (mitigación del diseño, «onOpenChange ignora el cierre mientras isSubmitting»). `isSubmitting` vive en el formulario interno, así que este avisa a `MaintenanceFormDialog` con `onBusyChange` y el diálogo descarta los `onOpenChange(false)` mientras está ocupado. Al desmontarse, el formulario lo restablece. Se aplica también en la edición: es inocuo y evita cerrar a medio guardar.
4. **Ficheros elegidos en el alta con clave estable** (`{ key, file }` con un contador en `useRef`) en lugar del índice. Un mismo fichero se puede elegir dos veces, y así no hace falta desactivar la regla `noArrayIndexKey` de Biome.
5. **El selector se deshabilita mientras `isSubmitting`** en el alta, y también los botones de quitar: no se pueden cambiar los ficheros a mitad de la subida.
6. **El hook de subida invalida la lista tras cada fichero subido**, no una vez por tanda (`onSuccess` de la mutación, como pide el diseño de `queries.ts`). R5 se cumple igual: la lista se refresca y el toast de éxito sale una sola vez al terminar.

## Notas

- `user.upload` aplica `accept`, así que los tests de 415/413 suben PDFs y la respuesta de error la pone `mockApi` (riesgo anotado en el diseño).
- Durante T10 se reconstruyó la SPA con la API ya arrancada. `@fastify/static` indexa los assets al arrancar y la ficha no cargaba, así que se reinició solo el proceso propio del `:3417`, identificado por su `PORT` y su `DATA_DIR`.
