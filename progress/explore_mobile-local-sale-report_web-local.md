# Exploración: informe de venta en la web y modo local

> Informe de un agente `Explore` para la feature #68 `mobile-local-sale-report`.

**Resumen:** hoy el modo local oculta todo el diálogo del informe, no solo «Compartir enlace». Al mostrarlo hay que ocultar `ReportSharesSection` por separado. La web no tiene ninguna dependencia de PDF.

## 1. Llamadas a saleReport y modo local actual

- **Interfaz:** `apps/web/src/lib/data-source/types.ts:112-118`.
  - `saleReport.download(vehicleId, options): Promise<DownloadedFile>`
  - `reportShares.{list,create,revoke}`
  - `DownloadedFile = {blob, fileName|null}` (:41-45)
- **Fuente activa:** `apps/web/src/lib/data-source/index.ts` (`dataSource()`/`setDataSource()`).
- **Implementación HTTP:** `http.ts:103-108` llama a `api.download(saleReportPath(...))` (`features/reports/sale-report.ts:12`).
- **Quién la llama:** `features/reports/queries.ts:19-31` (`useDownloadSaleReport`) ejecuta `dataSource().saleReport.download` y después `downloadBlob(fileName ?? saleReportFileName(vehicleTitle, todayIso()))`.
- **Implementación local:** `apps/web/src/lib/data-source/local/index.ts:64-65`.
  - `saleReport: { download: reject }` y todos los métodos de `reportShares` hacen `reject`, que lanza `unsupported()`: un `ApiError` 501 (`local/problems.ts:25`).
  - El comentario de :43-50 dice que el informe es «una versión posterior». Hay que actualizarlo.
- **Cómo se oculta hoy:** `routes/_app/vehicles/$vehicleId/index.tsx:74` tiene `{!isLocalMode() && <SaleReportDialog vehicle={vehicle} />}`, así que se oculta todo el diálogo.
- **Sección de compartir:** `ReportSharesSection` se pinta siempre dentro del diálogo (`sale-report-dialog.tsx:98`).
  - Lo único que tiene de modo local es el aviso `config?.localBaseUrl && <Warning>` (`report-shares-section.tsx:77`), y `LOCAL_CLIENT_CONFIG.localBaseUrl = true` (`local/index.ts:25`).
  - Para la #68 hay que quitar la condición de la ruta y ocultar `ReportSharesSection` dentro del diálogo con `!isLocalMode()`.
- **`isLocalMode()`:** `apps/web/src/lib/app-mode.ts:10`.

## 2. Patrón de la fuente de datos local

- **Factoría:** `createLocalDataSource(db, deps)` en `local/index.ts:51-73`.
  - Cada dominio es un `localX(db, deps)` envuelto en `serialized(queue, …)` para que las sentencias de la base de datos no se mezclen.
  - `files` y `dataPortability` reciben la `queue` y solo la ocupan mientras leen filas (`local/files-get.ts:257-288`). La lectura de archivos y el trabajo de CPU van fuera de la cola: es el patrón a copiar.
- **Errores:** `problem`, `notFound` y `parseInput` (`local/problems.ts`) producen los mismos problemas RFC 7807 que la API.
- **Base de datos:** SQLite con `@capacitor-community/sqlite` y drizzle `sqlite-proxy`, sobre el esquema compartido `@ikrive/db`, así que las filas son iguales que en la API.
  - Apertura: `local/database.ts:317-334`.
  - Adaptador: `lib/native-sqlite.ts`.
  - Migraciones: `local/migrations.ts`.
- **Archivos:** `@capacitor/filesystem` en `Directory.Data` (`lib/native-storage.ts:24-50`, `createDeviceFileStore`).
  - Interfaz `LocalFileStore.save/read(key, mimeType)→Blob/remove`.
  - `read` lanza `MissingFileError` (`local/files.ts:119-137`); la API trata cualquier fallo de lectura como `unreadable`.
  - `LocalDeps = {files, images}` (`files.ts:150`); los helpers de imagen con canvas están en `local/canvas-images.ts`.
- **Conexión:** `features/mobile/local-mode.ts:62-78` carga en diferido native-sqlite, native-storage, canvas-images y `data-source/local`, así que todo el código local es un chunk aparte.
- **Ejemplos recientes:**
  - Recordatorios: `local/notifications.ts` (funciones puras de shared) y `features/notifications/local-reminders-refresh.tsx`.
  - Exportación: `local/data-export.ts` usa `createDataExportZip` de `@ikrive/shared/data-export-zip` (un entry point aparte de shared, con fflate) y lee los archivos con `deps.files`.
  - Adjuntos: `local/attachments.ts` (`requireAttachment`, `isImage`).
- **Tests sin dispositivo:** `local/local-files.test.ts`, `local-export.test.ts`, `local-notifications.test.ts` y `local-data-source.test.ts`, con better-sqlite3 y un almacén de archivos en memoria.

## 3. Guardar y compartir archivos en el dispositivo

- **`apps/web/src/lib/download.ts:8-23` (`downloadBlob`):**
  - En la app nativa hace import dinámico de `./native-files` y llama a `saveFile`.
  - En la web usa un enlace `<a download>`.
  - `openBlob` (:30-45) abre el archivo con la app del sistema.
- **`lib/native-files.ts`:** escribe en `Directory.Cache` y luego llama a `Share.share` o a `FileOpener.open`.
- **Qué falta:** el informe ya pasa por `downloadBlob`, así que basta con que `download` local devuelva `{blob, fileName}`.

## 4. Librerías PDF y bundling

- **Web:** `apps/web` no tiene ninguna librería de PDF.
- **API:** `@react-pdf/renderer ^4.9.0`, `pdf-lib ^1.17.1`, `pdfkit 0.20.1` (fijado), `sharp` y `@fontsource/outfit` y `@fontsource/plus-jakarta-sans` (`.woff`).
  - Flujo completo en `apps/api/src/modules/reports/service.ts:28-124`.
  - Presupuesto de anexos: `REPORT_MAX_ANNEX_MB` (`app.ts:144`).
- **Shared:** `packages/shared/src/domain/sale-report.ts` (`buildSaleReport`, `saleReportFileName`, `SALE_REPORT_TEXTS`, tipos).
- **Convenciones de bundling:**
  - `apps/web/vite.config.ts` usa `autoCodeSplitting` e `import()` dinámico para lo nativo.
  - `features/pwa/config.ts:24-53` mantiene `NATIVE_ONLY_MODULES`: esos chunks van a `assets/native/` y el service worker no los precachea.
  - `features/pwa/native-only.test.ts` hace cumplir esa lista: falla si un `lib/native-*.ts` o una dependencia de Capacitor no está en ella, o si la web lo importa de forma estática.
  - Un renderer de PDF en la web debería cargarse en diferido solo en modo local, y probablemente ir a la lista de solo nativo.

## 5. Specs de referencia

- `specs/mobile-local-export/`: builder movido a shared, test cruzado con la API, decisiones de Gate 1 y riesgos.
- `specs/mobile-local-files/`: `LocalDeps` inyectables y tests sin dispositivo.
- `specs/mobile-local-reminders/`.
- `specs/sale-report-pdf/`, `specs/sale-report-invoices/`, `specs/sale-report-web/` y `specs/report-shares-web/`: contrato del informe y reglas de los anexos.
- `specs/mobile-native-files/`: flujo de guardar y compartir.
