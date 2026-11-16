# Implementación — mobile-local-export (#66)

Rama `feat/mobile-local-export`, sin commits (los hace el leader). T1–T13 marcadas en `specs/mobile-local-export/tasks.md`; T14 es este informe.

## Cambios por archivo

### A. Constructor compartido
- `packages/shared/src/domain/data-export-builder.ts` (nuevo): `buildDataExport`, tipos estructurales `DataExportInputRows` (`DataExportVehicleRow`, `…ReadingRow`, `…ScheduleRow`, `…RecordRow`, `…FuelLogRow`, `…AttachmentRow`, `…ChannelRow`, derivados de los tipos del documento con `Date` y las claves que el documento quita), `DataExportFile` y `BuildDataExportInput`. `groupBy`, `channelOf`, `attachmentOf` y `vehicleOf` movidos sin cambios desde la API; mantiene el `dataExportSchema.parse` final. No importa `@ikrive/db`.
- `packages/shared/src/domain/data-export-builder.test.ts` (nuevo): 6 tests con filas escritas a mano.
- `packages/shared/src/index.ts`: reexporta el constructor.
- `apps/api/src/modules/data-export/service.ts`: `build()` = `repo.load` + `settings.get` + `presentFiles` (se queda, con su `log.warn`) + `buildDataExport({ …, appVersion: APP_VERSION, exportedAt: new Date() })`. `export()` y `yazl` sin cambios. `DataExportRows` (Drizzle) se pasa directamente, sin castings: el typecheck confirma que es asignable.

### B. Escritor de zip y test cruzado
- `packages/shared/src/data-export-zip.ts` (nuevo): `createDataExportZip()` sobre `fflate` (`ZipPassThrough` para ficheros, `ZipDeflate` nivel 6 para `data.json` al cerrar). `finish` devuelve `Uint8Array<ArrayBuffer>[]` (vistas sobre los buffers de fflate, sin copia) para que valgan como `BlobPart` sin castings.
- `packages/shared/src/data-export-zip.test.ts` (nuevo): 2 tests; lee con `fflate` `Unzip` para comprobar el método de compresión.
- `packages/shared/package.json`: dependencia `fflate ^0.8.3`; `exports["./data-export-zip"]`. No se reexporta desde `index.ts`.
- `apps/api/test/data-import.test.ts`: helper `clientBuiltZip(db, dataDir, userId)` (cargador de la API + `buildDataExport` + `createDataExportZip`, ficheros desde `uploads/`, `data.json` al final) y `describe('client-built zip')` con 2 tests.
- `pnpm-lock.yaml`: `fflate` como dependencia directa de shared y devDependency de web (ya estaba en el lockfile como transitiva).

### C. DataSource
- `apps/web/src/lib/data-source/types.ts`: `dataPortability.export(): Promise<DownloadedFile>`.
- `apps/web/src/lib/data-source/http.ts`: `export: () => api.download('/me/export')`.
- `apps/web/src/lib/data-source/local/data-export.ts` (nuevo): `LOCAL_APP_VERSION` (`import.meta.env.VITE_IKRIVE_VERSION` o `'0.0.0-dev'`), `loadLocalExportRows(db)` (una consulta por tabla, acotada a `LOCAL_USER_ID` y en el mismo orden que `data-export/repository.ts`, `notificationChannels: []`) y `localDataPortability(db, deps, queue)`: filas y ajustes dentro de `queue.run`; ficheros de uno en uno fuera de la cola, añadidos al zip según se leen; `MissingFileError` → se omite; otro error → `problem(500, 'Internal Server Error', 'Could not read a file of the export')`; `data.json` al final; `{ blob: application/zip, fileName: ikrive-export-<todayIn(tz)>.zip }`.
- `apps/web/src/lib/data-source/local/index.ts`: `dataPortability: { import: reject, ...localDataPortability(db, deps, queue) }`; JSDoc actualizado (el import sigue en 501).
- `apps/web/package.json`: `fflate` como devDependency (los tests lo usan para leer el zip).
- `apps/web/src/lib/data-source/http.test.tsx`: test de `export()`.
- `apps/web/src/lib/data-source/local/local-export.test.ts` (nuevo): 5 tests.

### D. Web
- `apps/web/src/features/data-portability/queries.ts`: `useExportData()` (`useMutation` → `dataSource().dataPortability.export()`). `EXPORT_URL` se queda para el enlace del navegador.
- `apps/web/src/features/data-portability/data-section.tsx`: en modo servidor y local, botón → `useExportData().mutateAsync()` + `downloadBlob(fileName ?? 'ikrive-export.zip', blob)`, deshabilitado con `Loader2` y «Preparando…» mientras tanto; error → `common.fileError` (servidor) o `dataPortability.errors.export` (local). Navegador: el mismo `<a href="/api/me/export" download>`. En local: `localDescription`, `localExportHint`, y sin input ni botón de import. Ya no usa `saveApiFile` (sigue usándose en otros sitios).
- `apps/web/src/routes/_app/settings.tsx`: `<DataPortabilitySection />` siempre (fuera el `!local` y su comentario).
- `apps/web/src/i18n/locales/{es,en}.json`: `dataPortability.localDescription`, `localExportHint`, `exporting`, `errors.export` (textos del design en español; traducción equivalente en inglés).
- `apps/web/src/features/mobile/local-mode.test.tsx`: mock de `@/lib/native-files`; test renombrado y 3 nuevos.
- `apps/web/src/features/data-portability/data-section.test.tsx`: test `shows the export in progress`; los demás sin cambiar aserciones.

## Trazabilidad

| R | Test(s) |
|---|---|
| R1 | `apps/api/test/data-import.test.ts` › client-built zip › `builds the same document as GET /api/me/export`; `apps/api/test/data-export.test.ts` (todo, sin cambios, ahora sobre `buildDataExport`); `apps/web/src/lib/data-source/local/local-export.test.ts` › `exports a zip whose data.json satisfies dataExportSchema` |
| R2 | `packages/shared/src/domain/data-export-builder.test.ts` › `builds a document that satisfies dataExportSchema`, `nests rows under their vehicle and record in input order`, `drops owner ids and storage keys` |
| R3 | `data-export-builder.test.ts` › `skips attachments and photos whose file is missing`, `lists the files to copy with their export paths` |
| R4 | `data-export-builder.test.ts` › `never includes a channel token` |
| R5 | `apps/api/test/data-export.test.ts` (todos los tests, aserciones sin tocar) y `data-import.test.ts` › `round-trips an export into another account` |
| R6 | `packages/shared/src/data-export-zip.test.ts` › `stores files uncompressed under their path`, `writes data.json at the root as formatted JSON` |
| R7 | `apps/api/test/data-import.test.ts` › client-built zip › `imports a zip built with the shared builder and zip writer` (lee con `readZip`/yauzl, `dataExportSchema.safeParse` sin errores, 201 en B, re-export de B igual al de A tras `normalize`, mismos bytes por fichero) |
| R8 | `apps/web/src/lib/data-source/http.test.tsx` › `exports through GET /api/me/export with its file name` |
| R9 | `local-export.test.ts` › `exports a zip whose data.json satisfies dataExportSchema`, `names the zip after today in the settings time zone` |
| R10 | `local-export.test.ts` › `copies every stored file with its bytes` |
| R11 | `local-export.test.ts` › `skips files missing from the device` |
| R12 | `local-export.test.ts` › `rejects with a 500 when a file cannot be read` |
| R13 | `apps/web/src/features/mobile/local-mode.test.tsx` › `settings show the data card with export only`, `settings hide channels, calendar feed and device notifications` |
| R14 | `local-mode.test.tsx` › `exports the local data through the share sheet`; `data-section.test.tsx` › `shows the export in progress` |
| R15 | `local-mode.test.tsx` › `shows a toast when the local export fails` |
| R16 | `data-section.test.tsx` › `links to the export download`, `server mode: downloads the export with the token`, `server mode: shows an error toast when the export fails`, `native: saves the export zip with its name`, `native: shows an error toast when saving the export fails` (sin cambiar aserciones) |
| R17 | `apps/web/src/i18n/locales.test.ts` (en verde) |

## `pnpm harness --full`

```
[OK]    75 features: 68 done, 6 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #66 mobile-local-export (in_progress)
[OK]    Rama actual: feat/mobile-local-export
[OK]    pnpm lint            (biome check: 495 files, no fixes)
[OK]    pnpm typecheck       (shared, db, api, web, e2e)
packages/shared  Tests 177 passed
packages/db      Tests   3 passed
apps/api         Tests 370 passed (38 files)
apps/web         Tests 554 passed (84 files)
apps/mobile      27 pass;  e2e (unit) 6 passed
[OK]    pnpm test
[OK]    Arnés en verde.
```

Comprobaciones adicionales:
- **Bundle**: `vite build` (web y `--mode native`, en el scratchpad) → `fflate` solo aparece en el chunk perezoso `assets/local-*.js` (el que carga `features/mobile/local-mode.ts` con `import()`), no en el bundle principal. La API no importa el subpath en `src/`.
- **Docker** (cambian dependencias): `docker build -f docker/Dockerfile -t ikrive:dev .` OK y `node docker/smoke.mjs` contra el contenedor (como en CI) → `smoke test passed`.

## Desviaciones y notas

- **Capturas (docs/verification.md nivel 5) no tomadas.** La tarjeta en modo local solo se renderiza con la app nativa (`@capacitor-community/sqlite` y `MODE=native`), que no corre en `pnpm dev` del navegador; en el navegador la tarjeta no cambia visualmente (mismo enlace). El diseño no añade componentes nuevos (mismos `Card`/`Button`, el `Loader2` y el patrón «…ando…» del botón de import). El comportamiento visible queda cubierto por `local-mode.test.tsx` y `data-section.test.tsx`. Si el humano quiere capturas, hay que sacarlas en un emulador Android con `build:native`.
- **`createDataExportZip().finish` devuelve `Uint8Array<ArrayBuffer>[]`** en vez de `Uint8Array[]` del design: con el `lib` de TS actual, `Uint8Array<ArrayBufferLike>` no es un `BlobPart` y el `new Blob(chunks)` del modo local no compilaba. Se resuelve sin castings ni copias (vista sobre el mismo `ArrayBuffer`; `slice()` solo si fuera un `SharedArrayBuffer`). Mismo contrato en la práctica.
- **`loadLocalExportRows` filtra por `LOCAL_USER_ID`** con los mismos joins que el repositorio de la API (el design dice «mismo orden»; el filtro sigue el estilo de los demás módulos locales, que también acotan por `ownerId`).
- **`localDataPortability` devuelve solo `{ export }`** y `local/index.ts` lo combina con `import: reject`; la firma pide `Pick<LocalDeps, 'files'>` porque no necesita `images`.
- El test cruzado de R7 lee los ficheros directamente con `readFileSync` de `dataDir/uploads/<key>` (como pide el design); el cargador local no pasa por un import real (decisión 2 del Gate 1).

## Gate 2 changes

- `apps/web/src/i18n/locales/en.json` › `dataPortability.localExportHint`: replaced the Spanish angle quotes `«Your data»` with escaped English double quotes (`\"Your data\"`). `es.json` unchanged.
- No test asserts this English text (tests use the Spanish locale / keys), so no test changes were needed.
- Other new English strings from this feature (`localDescription`, `exporting`, `errors.export`) have no angle quotes. The `«Don't remind me»` in `settings.odometerReminderWeekdayInfo` (line 85) predates this feature and is out of scope; left untouched.
- `pnpm lint`: Checked 495 files, no fixes applied. `pnpm --filter @ikrive/web test`: 84 files, 554 tests passed.
