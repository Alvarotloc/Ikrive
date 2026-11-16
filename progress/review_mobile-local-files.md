# Review — #65 mobile-local-files

**Veredicto:** APPROVED

Revisado sobre `feat/mobile-local-files`: `git diff main...HEAD` (solo el spec y `feature_list.json`), `git diff` y los ficheros nuevos sin trackear, leídos enteros. `pnpm harness --full` lo he ejecutado yo: verde (web 542, API 368, shared 169, db 3, mobile 27; lint, typecheck y test en OK).

## Trazabilidad requirements ↔ tests

- R1: [x] `packages/shared/src/domain/files.test.ts` › `detects PDF, JPEG, PNG and WebP by their signature` / `returns null for other contents` (MIME y extensión exactos; null para GIF, AVIF, `%PDF` truncado, RIFF/WAVE y vacío). La API importa de `@ikrive/shared` (`attachments/service.ts`, `data-import/service.ts`, `file-type.test.ts`) y `local/attachments.ts` también. Se ha borrado `lib/file-type.ts`.
- R2: [x] `files.test.ts` › `keeps the base name of the declared file name` (rutas `/` y `\`, espacios, vacío → `file.<ext>`, 255 code points sin partir un par sustituto); `local-files.test.ts` › `uploads an attachment…` (`'docs/Factura taller.pdf  '` → `'Factura taller.pdf'`).
- R3: [x] En `apps/api/test/` solo cambia el import de `file-type.test.ts`; `attachments`, `vehicles` y `data-import` siguen sin tocar y pasan. `sanitizeFileName` es idéntico, byte a byte, al que había en `attachments/service.ts`.
- R4: [x] `local-files.test.ts` › `uploads an attachment with its detected type, hash and sanitized name`: comprueba `attachmentSchema.parse`, el sha256 contra `node:crypto`, la clave `attachments/<uuid>.pdf|jpg`, los bytes guardados, que `thumbnailUrl` solo exista en la imagen, el tipo detectado aunque el declarado sea otro y las filas en BD.
- R5: [x] `rejects unsupported or corrupt attachments with 415 and writes nothing`: Problem exacto para texto, GIF, PNG corrupto y vacío; ni sentencias de escritura ni ficheros.
- R6: [x] `rejects files over maxUploadMb with 413 and writes nothing`: 20 MB + 1 byte, tanto en el adjunto como en la foto. Comprueba el Problem exacto, que no se escribe nada, que no hay ficheros y que no se pide ningún recodificado.
- R7: [x] `lists attachments in upload order`: sube tres a la vez y comprueba el orden por nombre y la igualdad con los DTO devueltos. La lista de otro registro sale vacía.
- R8: [x] `deletes an attachment and its file`: queda solo el que no se borró y un segundo borrado da 404. También lo cubre `local-mode.test.tsx` › `maintenance shows attachments` (almacén vacío tras borrar).
- R9: [x] `rejects attachments of unknown vehicles, records or ids with 404`: vehículo, registro, registro de otro vehículo y adjunto de un registro hermano, cada uno con su `detail` de la API y sin escrituras.
- R10: [x] `stores the photo as WebP and replaces the previous one` (tamaño pedido 1600, clave `vehicles/<uuid>.webp` con firma WEBP, la anterior borrada, `photoUrl` local distinto en cada foto, `vehicleSchema.parse`, también en `get` y `list`). `canvas-images.test.ts` cubre la orientación (`imageOrientation: 'from-image'`), el ajuste a 1200×1600 sin ampliar y la calidad 0,8.
- R11: [x] `files.test.ts` › `detects the photo formats the API accepts`; `local-files.test.ts` › `rejects an unsupported photo with 400 and keeps the current one` (texto, PDF, JPEG corrupto y vacío; sin escrituras, mismos ficheros y misma `photoUrl`).
- R12: [x] `rejects when the device does not produce WebP`: foto y miniatura dan el 500 exacto, sin escrituras, con el almacén igual y `photoUrl` a null.
- R13: [x] `removes the photo and its file` (`photoUrl` null, almacén vacío, `files.get` da 404 `This vehicle has no photo`, quitarla dos veces es idempotente).
- R14: [x] `files.get returns the photo, the original and the thumbnail`: tipos, bytes y `fileName` (null en la foto y la miniatura, `originalName` en el original), con y sin `?inline=1`.
- R15: [x] Mismo test (se pide la miniatura a 320 y sale con firma WEBP) y `canvas-images.test.ts` (240×320, calidad 0,7, orientación).
- R16: [x] `files.get rejects unknown or foreign urls with 404`: `/api/…`, una URL absoluta, otra ruta `local://`, sufijo desconocido, cadena vacía, vehículo, registro y adjunto inexistentes, foto ausente y miniatura de un PDF.
- R17: [x] `deleting a maintenance record deletes its attachments and files`: filas y ficheros del registro borrados y los del registro hermano intactos. En `maintenance.ts:213` el borrado va en `db.transaction`.
- R18: [x] `deleting a vehicle deletes its attachments, files and photo`: filas, ficheros y foto borrados y lo del otro vehículo intacto. Si el almacén falla al borrar, la operación no se rechaza y el vehículo queda borrado.
- R19: [x] `removes the stored file when the database write fails`: si fallan el insert del adjunto o el update de la foto, el almacén queda como estaba, no hay fila y la foto anterior sigue siendo legible.
- R20: [x] `native-storage.test.ts` (ruta `uploads/<clave>`, `Directory.Data`, `recursive`, base64 exacto, lectura en base64 y como Blob, borrar un fichero que no existe resuelve y cualquier otro error se relanza). `native-only.test.ts` en verde con `storage`.
- R21: [x] `canvas-images.test.ts` › `decodes with the EXIF orientation and encodes WebP` / `rejects when the image does not decode` (además, `close()` del bitmap antes de codificar).
- R22: [x] `local-mode.test.tsx` › `vehicle page shows the photo picker and hides the sale report`: no aparece el botón del informe, aparece «Añadir foto», la subida deja una clave `vehicles/*.webp` y la ficha pinta `blob:`, nunca `local:`.
- R23: [x] `local-mode.test.tsx` › `maintenance shows attachments`: la sección «Facturas» está en el alta, el botón «Facturas de «Revisión»» funciona, la subida aparece en la lista y el borrado vacía el almacén.
- R24: [x] `api-files.test.tsx` › `local mode: loads files through the data source`: `blob:` de tipo `image/webp` para la miniatura; `openApiFile` y `saveApiFile` reciben el nombre original y los bytes; `fetch` no se llama nunca.
- R25: [x] `local-data-source.test.ts` › `rejects unsupported operations with 501`: sigue sin sentencias y ahora también comprueba que el almacén queda vacío.
- R26: [x] No hay textos nuevos (no cambian ni `es.json` ni `en.json`); `locales.test.ts` en verde.

## Tasks

- T1..T25: [x]

## Checkpoints

- C1: [x] Arnés con código 0; una sola feature activa (#65 `in_progress`); rama `feat/mobile-local-files`.
- C2: [x] Están los tres ficheros del spec; EARS con tabla de acceptance completa; todas las tasks `[x]`; he abierto y leído el test de cada R<n>.
- C3: [x] El diff se ciñe a `design.md` (A–D, docs y `progress/`). No hay cambios de otras features ni refactors fuera del diseño. Las desviaciones declaradas son locales y están justificadas (ver abajo).
- C4: [x] La API no tiene endpoints nuevos y solo cambia imports. La DataSource local mantiene la cadena de propiedad vehículo → registro → adjunto con 404 y los textos de la API, y devuelve los errores como Problem (`problem()`/`notFound()`). No hay cambios de BD. La lógica pura (`detect*`, `sanitizeFileName`) está en `packages/shared` con tests. Sin textos nuevos.
- C5: [x] Sin `any`, `@ts-ignore`, `console.log` ni TODOs nuevos. Las claves son aleatorias (`crypto.randomUUID()`), en el almacenamiento privado de la app, y solo se sirven por `files.get` siguiendo la cadena de propiedad. No hay fechas nuevas.
- C6: [x] `pnpm harness --full` en verde. Los tests usan SQLite en memoria real (better-sqlite3), sin mocks de BD; los dobles son solo del almacén y de canvas, como prevé el diseño. Las capturas no están, pero el spec aprobado (T24 y «Tests sin dispositivo») las traslada a la checklist manual del dispositivo, previa a Gate 2. La justificación está en `impl_mobile-local-files.md`: el modo local solo existe en el build nativo con el SQLite del dispositivo, y la UI no tiene componentes nuevos.
- C7: [x] `impl_mobile-local-files.md` recoge los archivos tocados, el mapa R→test, la salida del arnés y la checklist del dispositivo. `progress/current.md` refleja la sesión. `docs/PLAN.md` no cambia (la feature no cierra la fase 8).

## Hallazgos

Ninguno bloqueante. Valoración de las desviaciones declaradas:

1. **`onAttachments` vuelve a ser obligatorio** (`maintenance-timeline.tsx`): correcto. El diseño pide quitar la condición del modo local y, sin ningún llamador que pase `undefined`, dejarlo opcional sería código muerto. Vuelve al estado previo a #54.
2. **`LOCAL_MAX_UPLOAD_MB` en `local/files.ts`**: correcto. `assertUploadSize` y `LOCAL_CLIENT_CONFIG.maxUploadMb` comparten la constante y se evita el ciclo con `index.ts`. El valor sigue siendo 20.
3. **Cascada del vehículo con subconsulta en `vehicles.ts`**: correcto y atómico. El `delete … where entity_id in (select id from maintenance_records where vehicle_id = ?)` va dentro de la misma `db.transaction` que el borrado del vehículo, y el test con SQLite real comprueba que solo caen los adjuntos de ese vehículo. Evita el ciclo `attachments.ts` ↔ `vehicles.ts`.
4. **Se ignora un fallo al borrar la foto anterior**: es coherente con la decisión 3 del diseño (los ficheros se borran después de confirmar en BD y quedan huérfanos si falla). La API respondería 500 después de actualizar la fila; aquí la UI refleja el estado real. Aceptable.
5. **R19 relanza el error de drizzle en lugar de un Problem**: R19 exige «borrar ese fichero y rechazar sin cambiar los datos», y eso se cumple y se prueba. No pide un Problem concreto, y el resto de la DataSource local ya propaga así los errores del motor (la UI muestra `common.error`). No viola el spec.
6. **Capturas en la checklist del dispositivo**: el spec aprobado lo prevé así (T24). Ver aviso 1.

## Avisos para el humano (no bloquean)

1. **Antes de Gate 2** hay que ejecutar en una APK de depuración la checklist manual de `progress/impl_mobile-local-files.md` (12 puntos, capturas en claro, oscuro y móvil incluidas). Ningún test cubre la orientación EXIF real, la codificación WebP del WebView ni las rutas en `Directory.Data`. Si algo falla, la feature vuelve a `in_progress`.
2. `local/files-get.ts`: si existe la fila de un adjunto o de la foto pero su fichero ya no está (por ejemplo, tras borrar los datos de la app a medias), `files.read` rechaza con el error del plugin y no con un Problem 404. La UI lo trata como un error genérico (`viewerError` o `common.error`). El spec no cubre este caso; podría pulirse en #66 o #68.
3. `local/attachments.ts`: `remove` borra la fila con una única sentencia fuera de una transacción. Es atómico al ser una sola sentencia; lo menciono solo porque la API lo hace a través del repositorio.
4. Lo previsto en el diseño (riesgos): en el modo local quedan ficheros huérfanos si la app muere entre el guardado y el insert, o entre el commit y el borrado de los ficheros. No hay barrido (fuera de alcance).

## Cambios requeridos

Ninguno.
