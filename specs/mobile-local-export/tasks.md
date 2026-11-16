# Tasks — mobile-local-export

## A. Constructor compartido

- [ ] T1 — Crear `packages/shared/src/domain/data-export-builder.ts` con `DataExportInputRows`, `DataExportFile` y `buildDataExport` (mapeo movido de `apps/api/src/modules/data-export/service.ts`, `parse` final incluido); exportarlo desde `src/index.ts`. Cubre: R1, R2, R3, R4.
- [ ] T2 — Tests en `packages/shared/src/domain/data-export-builder.test.ts`: `builds a document that satisfies dataExportSchema`, `nests rows under their vehicle and record in input order`, `drops owner ids and storage keys`, `skips attachments and photos whose file is missing`, `never includes a channel token`, `lists the files to copy with their export paths`. Cubre: R2, R3, R4.
- [ ] T3 — `apps/api/src/modules/data-export/service.ts`: `build()` llama a `buildDataExport` con `presentFiles`, `APP_VERSION` y `new Date()`; `export()` sin cambios. `apps/api/test/data-export.test.ts` y `data-import.test.ts` pasan sin cambiar aserciones. Cubre: R1, R5.

## B. Escritor de zip y test cruzado

- [ ] T4 — `packages/shared/package.json`: dependencia `fflate` y subpath `./data-export-zip`; crear `packages/shared/src/data-export-zip.ts` con `createDataExportZip` (ficheros con `ZipPassThrough`, `data.json` con `ZipDeflate` al cerrar). Cubre: R6.
- [ ] T5 — Tests en `packages/shared/src/data-export-zip.test.ts`: `stores files uncompressed under their path`, `writes data.json at the root as formatted JSON`. Cubre: R6.
- [ ] T6 — Test cruzado en `apps/api/test/data-import.test.ts` › `describe('client-built zip')`: `imports a zip built with the shared builder and zip writer` (lee el zip con `readZip`, `dataExportSchema.safeParse` de `data.json` sin errores, 201 en la cuenta B y su re-export igual al de A tras `normalize`, mismos bytes por fichero) y `builds the same document as GET /api/me/export` (igual salvo `exportedAt` y `appVersion`). Cubre: R1, R7.

## C. DataSource

- [ ] T7 — `dataPortability.export()` en `apps/web/src/lib/data-source/types.ts` y `http.ts`; test `exports through GET /api/me/export with its file name` en `apps/web/src/lib/data-source/http.test.tsx`. Cubre: R8.
- [ ] T8 — `apps/web/src/lib/data-source/local/data-export.ts` (`loadLocalExportRows`, `localDataPortability`, `LOCAL_APP_VERSION`) y conexión en `local/index.ts` (import sigue en 501); `fflate` como devDependency de `apps/web`. Cubre: R9, R10, R11, R12.
- [ ] T9 — Tests en `apps/web/src/lib/data-source/local/local-export.test.ts` (memoria: `createMemorySqlite`, `createMemoryFileStore`, `fakeImages`; zip leído con `fflate`): `exports a zip whose data.json satisfies dataExportSchema` (ajustes, vehículo con lecturas, plan, mantenimiento con adjuntos y repostaje; sin canales), `names the zip after today in the settings time zone`, `copies every stored file with its bytes`, `skips files missing from the device`, `rejects with a 500 when a file cannot be read`. Cubre: R9, R10, R11, R12.

## D. Web

- [ ] T10 — `useExportData` en `features/data-portability/queries.ts`; `data-section.tsx` con export por la DataSource (servidor y local), estado «Preparando…», textos y error del modo local y sin import en local; `routes/_app/settings.tsx` muestra la tarjeta siempre. Cubre: R13, R14, R15, R16.
- [ ] T11 — Textos `dataPortability.localDescription`, `localExportHint`, `exporting` y `errors.export` en `apps/web/src/i18n/locales/es.json` y `en.json`; `apps/web/src/i18n/locales.test.ts` en verde. Cubre: R17.
- [ ] T12 — Tests en `apps/web/src/features/mobile/local-mode.test.tsx`: renombrar `settings hide channels, calendar feed, device notifications and data` a `settings hide channels, calendar feed and device notifications` (sin «Tus datos»); nuevos `settings show the data card with export only`, `exports the local data through the share sheet` (`saveFile` de `@/lib/native-files` recibe `ikrive-export-<hoy>.zip` y un zip con `data.json`) y `shows a toast when the local export fails` (`store.failOn.add('read')` con un adjunto). Cubre: R13, R14, R15.
- [ ] T13 — Test `shows the export in progress` en `apps/web/src/features/data-portability/data-section.test.tsx` (modo servidor, respuesta retenida: botón deshabilitado con «Preparando…»); `links to the export download`, `server mode: downloads the export with the token` y `server mode: shows an error toast when the export fails` pasan sin cambiar aserciones. Cubre: R14, R16.

## E. Cierre

- [ ] T14 — Ejecutar `pnpm harness --full` y documentar trazabilidad en `progress/impl_mobile-local-export.md`. Cubre: R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R13, R14, R15, R16, R17.
