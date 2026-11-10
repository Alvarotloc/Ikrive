# Tasks — mobile-native-files

## Dependencias

- [x] T1 — Añadir con versión exacta `@capacitor/core` `8.6.0`, `@capacitor/filesystem` `8.1.5`, `@capacitor/share` `8.0.3` y `@capacitor-community/file-opener` `8.0.1` a `dependencies` de `apps/web/package.json`, y los tres plugins a `apps/mobile/package.json`; `pnpm install`; `pnpm --filter @ikrive/mobile exec cap sync android` y versionar los `.gradle` regenerados. Cubre: R14.
- [x] T2 — Test `declares the web's Capacitor plugins with the same versions` en `apps/mobile/test/config.test.mjs` (cada `@capacitor/*`/`@capacitor-community/*` de `apps/web` salvo `core` está en `apps/mobile` con la misma versión, y los tres plugins están). Cubre: R14.

## Costura

- [x] T3 — `apps/web/src/lib/native-files.ts`: `safeFileName`, `blobToBase64`, `isShareCanceled`, `saveFile`, `openFile` según `design.md`. Cubre: R3, R4, R5, R6, R8.
- [x] T4 — `apps/web/src/lib/download.ts`: `downloadBlob` y `openBlob(blob, fileName)` async con la bifurcación por `isNativeApp()` e `import('./native-files')`. Cubre: R1, R2, R3, R6.
- [x] T5 — `apps/web/src/lib/api-files.ts`: `await downloadBlob` en `saveApiFile`; `openApiFile(url, fallbackName)` pasa `fileName ?? fallbackName`. Ajustar llamada en `maintenance-attachments.tsx`. Cubre: R7, R10.
- [x] T6 — `features/calendar/actions.ts` devuelve la promesa; `features/schedules/add-to-calendar.tsx` captura y muestra `toast.error(t('common.fileError'))`; `features/reports/queries.ts` hace `await downloadBlob`. Cubre: R12, R13.
- [x] T7 — `files.shareTitle` en `apps/web/src/i18n/locales/es.json` («Guardar o compartir») y `en.json` («Save or share»); `locales.test.ts` en verde. Cubre: R15.

## Tests de la costura

- [x] T8 — `apps/web/src/lib/download.test.ts` (con `vi.mock('./native-files')`): `web: downloads through a temporary <a download> without loading the native module`, `web: opens in a new tab without loading the native module`, `native: saves through native-files with the file name`, `native: opens through native-files with the file name`, `native: rejects when the native module fails`. Cubre: R1, R2, R3, R6, R8.
- [x] T9 — `apps/web/src/lib/native-files.test.ts` (con `vi.mock` de `@capacitor/filesystem`, `@capacitor/share` y `@capacitor-community/file-opener`): `writes the file to the cache with its sanitized name` (incluye `safeFileName('a/b:c.pdf')` → `a_b_c.pdf` y `''` → `file`, y el base64 del contenido), `opens the share sheet with the written file`, `resolves when the share sheet is cancelled`, `opens the file with its MIME type`, `falls back to application/octet-stream`, `rejects when writing, sharing or opening fails`. Cubre: R3, R4, R5, R6, R8.
- [x] T10 — Test `server mode: opens a PDF with its Content-Disposition name or the fallback` en el nuevo `apps/web/src/lib/api-files.test.tsx` (mock de `./download`, `mockApi` con y sin `content-disposition`). Cubre: R7.

## Tests de los flujos en la app (`vi.stubEnv('MODE', 'native')`, `setServerMode`, `vi.mock('@/lib/native-files')`)

- [x] T11 — En `apps/web/src/features/maintenance/maintenance-attachments.test.tsx`: `native: saves an invoice with its original name` (tarjeta y botón del visor), `native: opens a PDF with the system viewer` (`openFile` con nombre y blob `application/pdf`), `native: shows an error toast when opening fails`. Cubre: R9, R10, R13.
- [x] T12 — En `apps/web/src/features/data-portability/data-section.test.tsx`: `native: saves the export zip with its name` y `native: shows an error toast when saving the export fails`. Cubre: R11, R13.
- [x] T13 — En `apps/web/src/features/schedules/add-to-calendar.test.tsx`: `native: saves the .ics with its name` y `shows an error toast when the .ics cannot be saved`. Cubre: R12, R13.

## Docs y cierre

- [x] T14 — `docs/mobile.md`: quitar la limitación de ficheros y la frase sobre no publicar APK; sección «Ficheros» según `design.md`. Actualizar `apps/mobile/test/docs.test.mjs`: sustituir la aserción `/mobile-native-files/` por `documents native files and no longer lists them as a limitation` (no aparece `mobile-native-files` ni «aún no funcionan descargar»; sí «compartir» y «visor»). Cubre: R16.
- [x] T15 — Verificación previa a Gate 2: generar la APK debug (`build:web`, `cap sync`, `assembleDebug`) solo si hay SDK de Android disponible; si no, indicar en `progress/impl_mobile-native-files.md` cómo obtener el artefacto `ikrive-debug-apk` de CI. Comprobar `pnpm --filter @ikrive/web build` sin regresiones en la web. Dejar en `progress/impl_mobile-native-files.md` una checklist de pruebas manuales para el humano (descargar factura, abrir PDF, export zip con fotos anotando tamaño, `.ics`, cancelar la hoja de compartir), que ejecutará antes de Gate 2. Cubre: R1, R2, R9, R10, R11, R12.
- [x] T16 — Ejecutar `pnpm harness --full` y documentar trazabilidad en `progress/impl_mobile-native-files.md`.
