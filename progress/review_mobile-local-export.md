# Review — #66 mobile-local-export

**Veredicto:** APPROVED

Diff revisado: `git diff main...HEAD` (spec + `feature_list.json`), `git diff` (19 ficheros) y los 6 ficheros nuevos sin trackear (`packages/shared/src/domain/data-export-builder{,.test}.ts`, `packages/shared/src/data-export-zip{,.test}.ts`, `apps/web/src/lib/data-source/local/data-export.ts`, `apps/web/src/lib/data-source/local/local-export.test.ts`).

## Trazabilidad requirements ↔ tests

- R1: [x] `apps/api/test/data-import.test.ts` › client-built zip › `builds the same document as GET /api/me/export` (documento del constructor compartido igual al de la API salvo `exportedAt`/`appVersion`); `service.ts` de la API ahora llama a `buildDataExport` (verificado en el diff) y `local/data-export.ts` también; `local-export.test.ts` › `exports a zip whose data.json satisfies dataExportSchema`.
- R2: [x] `packages/shared/src/domain/data-export-builder.test.ts` › `builds a document that satisfies dataExportSchema` (safeParse + formatVersion/appVersion/exportedAt/settings), `nests rows under their vehicle and record in input order` (orden no alfabético r2,r1 / m2,m1 / a2,a1 preservado, anidado por vehículo y mantenimiento), `drops owner ids and storage keys` (ni `ownerId`, `storageKey`, `vehicleId`, `entityId` ni claves en el JSON).
- R3: [x] `data-export-builder.test.ts` › `skips attachments and photos whose file is missing` (photoPath null, solo a1 y `files` solo con a1), `lists the files to copy with their export paths`.
- R4: [x] `data-export-builder.test.ts` › `never includes a channel token` (no aparece `secret-token`, `hasToken` true/false y `config` sin token).
- R5: [x] `apps/api/test/data-export.test.ts` sin cambios en el diff y en verde; el mapeo movido es idéntico línea a línea al de `main` (comparado con `git show main:…/service.ts`); `presentFiles` con `log.warn` y `export()`/`yazl` intactos.
- R6: [x] `packages/shared/src/data-export-zip.test.ts` › `stores files uncompressed under their path` (método 0 y mismos bytes), `writes data.json at the root as formatted JSON` (método 8, `JSON.stringify(document, null, 2)` exacto).
- R7: [x] `apps/api/test/data-import.test.ts` › `imports a zip built with the shared builder and zip writer` (zip leído con `readZip`/yauzl, `dataExportSchema.safeParse` sin error, mismas entradas que el export de la API, 201 en B, re-export de B igual al de A tras `normalize`, mismos bytes por fichero).
- R8: [x] `apps/web/src/lib/data-source/http.test.tsx` › `exports through GET /api/me/export with its file name` (URL, método, nombre de `Content-Disposition`, contenido del blob).
- R9: [x] `local-export.test.ts` › `exports a zip whose data.json satisfies dataExportSchema` (tipo `application/zip`, ajustes, vehículos, lecturas, plan, mantenimiento, adjuntos, repostaje, `notificationChannels: []`), `names the zip after today in the settings time zone` (Kiritimati, cambio de día).
- R10: [x] `local-export.test.ts` › `copies every stored file with its bytes` (rutas `attachments/<id>.<ext>`, `photos/<id>.webp` y bytes iguales a los del almacén).
- R11: [x] `local-export.test.ts` › `skips files missing from the device` (foto y PDF borrados → fuera del zip y del documento, el resto se exporta).
- R12: [x] `local-export.test.ts` › `rejects with a 500 when a file cannot be read` (Problem 500 exacto).
- R13: [x] `apps/web/src/features/mobile/local-mode.test.tsx` › `settings show the data card with export only` (tarjeta, descripción local, botón, sin enlace, sin import ni input).
- R14: [x] `local-mode.test.tsx` › `exports the local data through the share sheet` (`saveFile` con `ikrive-export-<hoy>.zip` y zip válido); `data-section.test.tsx` › `shows the export in progress` (botón deshabilitado con «Preparando…»; mismo `exportData.isPending` que en local).
- R15: [x] `local-mode.test.tsx` › `shows a toast when the local export fails` (toast «No se ha podido generar el export» y sin `saveFile`).
- R16: [x] `data-section.test.tsx` › `links to the export download`, `server mode: downloads the export with the token`, `server mode: shows an error toast when the export fails`, `native: …` sin cambios de aserciones y en verde. `api.download('/me/export')` es la misma petición que hacía `saveApiFile` (`files.get` → `downloadUrl`).
- R17: [x] Las 4 claves nuevas están en `es.json` y `en.json`; `apps/web/src/i18n/locales.test.ts` en verde.

## Tasks

- T1..T14: [x]

## Checkpoints

- C1: [x] `pnpm harness` OK; una sola feature activa (#66 in_progress); rama `feat/mobile-local-export`.
- C2: [x] Spec completo, EARS, tabla acceptance → R cubre los 5 criterios; tasks todas `[x]`; cada R con test leído.
- C3: [x] El diff toca solo lo listado en `design.md` (A–D). Las desviaciones documentadas (filtro por `LOCAL_USER_ID`, `Pick<LocalDeps,'files'>`, `localDataPortability` devuelve solo `{ export }`) son menores y coherentes con el diseño.
- C4: [x] Sin cambios de BD ni de rutas HTTP; lógica pura en `packages/shared` con tests unitarios; operación nueva en `types.ts`, `http.ts` y `local/`; `queries.ts` usa `dataSource()`; textos en ambos idiomas; mismos `Card`/`Button`/`Loader2`. El cargador local acota por propietario como el repositorio de la API.
- C5: [x] Sin `any`, `@ts-ignore` ni `console.log`; sin castings en la API (`DataExportRows` asignable a `DataExportInputRows`); fechas `YYYY-MM-DD` intactas; nombre del zip con `todayIn(timezone)`.
- C6: [x] `pnpm harness --full` en verde ejecutado por mí (shared 177, db 3, api 370, web 554, mobile 27). Tests sobre SQLite en memoria real (API y `createMemorySqlite`), sin mocks de BD. Capturas: excepción justificada en `progress/impl_mobile-local-export.md` (la tarjeta en modo local solo se renderiza en la app nativa; en navegador no hay cambio visual; en modo servidor solo se añade el estado «Preparando…» con el patrón ya existente del import). Ver avisos.
- C7: [x] `progress/impl_mobile-local-export.md` con ficheros, mapa R → test y salida; `progress/current.md` al día; `docs/PLAN.md` no requiere cambios (no cierra fase ni cambia decisiones).

## Hallazgos

Ninguno bloqueante.

## Avisos para el humano (no bloquean)

- **Firma de `finish`:** devuelve `Uint8Array<ArrayBuffer>[]` en vez del `Uint8Array[]` del design. Es un subtipo (más estricto), compatible con cualquier llamador que espere `Uint8Array[]`, y evita castings al construir el `Blob`. `ownBuffer` crea una vista sin copia salvo con `SharedArrayBuffer`. Aceptable.
- **Capturas:** no hay capturas del modo local (requiere build nativa en emulador). Si quieres validar visualmente la tarjeta en el teléfono («Preparando…», texto de ayuda local), hazlo con `build:native` antes del merge.
- **`fflate` y entradas pasadas tal cual:** `ZipPassThrough` emite el mismo `Uint8Array` que recibe, así que el zip retiene los bytes de cada fichero hasta el `Blob`. Es el riesgo de memoria ya aceptado en el design y recogido en #75 `mobile-local-export-streaming`.
- **Ventana entre filas y ficheros en local:** las filas se leen en la cola y los ficheros fuera de ella; si en ese intervalo se borra un adjunto, su fichero falta y se omite (como un `MissingFileError`). Coherente con el design (paso 2) y con el comportamiento de la API.
- **Texto en inglés:** `localExportHint` usa comillas angulares («Your data») en `en.json`; quizá prefieras "Your data" con comillas inglesas. Cuestión de estilo.
- **R14 en modo local:** el estado «Preparando…» solo se prueba en modo servidor; en local usa el mismo `exportData.isPending`, así que queda cubierto por el mismo código, tal como fijaba T13.

## Cambios requeridos

Ninguno.

## Re-review after Gate 2

**Veredicto:** APPROVED

- Cambio pedido por el humano: `apps/web/src/i18n/locales/en.json:610` › `dataPortability.localExportHint` usa ahora `\"Your data\"` (comillas inglesas escapadas) en lugar de `«Your data»`. JSON válido (parseado con Node); el texto resultante es `Import it in "Your data" of your account: …`. `es.json` mantiene `«Tus datos»`, correcto en español.
- Ninguna otra cadena nueva de la feature en `en.json` lleva comillas angulares. El `«Don't remind me»` de `settings.odometerReminderWeekdayInfo` (línea 85) es anterior a esta feature y queda fuera de alcance (aviso, no bloquea).
- Nada más ha cambiado desde la aprobación anterior: los únicos ficheros de `apps/`, `packages/`, `docker/`, `specs/` modificados después de `progress/review_mobile-local-export.md` son `en.json` y `feature_list.json`; este último solo refleja el estado de #66 (`in_progress`, vuelta atrás desde Gate 2 por el leader) y el alta previa de #75, ya vistos.
- `pnpm harness --full`: en verde según el leader tras el cambio; el implementer reporta `pnpm lint` limpio y 554 tests web en verde. Ningún test afirma este texto en inglés, así que no hacen falta cambios de tests; `locales.test.ts` (paridad de claves) sigue cubriendo R17.
- Trazabilidad, tasks y checkpoints C1–C7 sin cambios respecto a la revisión anterior.
