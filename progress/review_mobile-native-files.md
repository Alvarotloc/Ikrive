# Review — #55 mobile-native-files

**Veredicto:** APPROVED

Revisado: `git diff main...HEAD` (solo el spec y `feature_list.json`) + cambios sin commitear + 4 ficheros nuevos sin trackear (`lib/native-files.ts` y tres tests). `pnpm harness --full` ejecutado por el reviewer: **EXIT 0** (web 423, api 368, lint y typecheck OK).

## Trazabilidad requirements ↔ tests
- R1: [x] `apps/web/src/lib/download.test.ts:40` › `web: downloads through a temporary <a download> without loading the native module` (comprueba `createObjectURL(pdf)`, el `<a>` clicado con `href=blob:1`, `download=invoice.pdf`, que se retira del DOM y `native.loaded === false`)
- R2: [x] `download.test.ts:52` › `web: opens in a new tab…` (`target=_blank`, `rel=noopener`, sin `download`, módulo nativo sin cargar)
- R3: [x] `download.test.ts:65` (delegación a `saveFile('invoice.pdf', pdf)` sin clic) + `native-files.test.ts:28` (`writeFile` con `files/Taller_ revisión_2026.pdf`, base64 exacto del contenido UTF-8, `Directory.Cache`, `recursive`; casos de `safeFileName` incluidos `''`/`'...'` → `file`)
- R4: [x] `native-files.test.ts:54` (`Share.share` con `title`, `files: [uri escrita]`, `dialogTitle: 'Guardar o compartir'`)
- R5: [x] `native-files.test.ts:67` (rechazo «Share canceled» → resuelve `undefined`; otros errores no se tratan como cancelación). Verificado además que `SharePlugin.java:79` de `@capacitor/share@8.0.3` rechaza exactamente con `"Share canceled"`.
- R6: [x] `download.test.ts:77` + `native-files.test.ts:77` (`FileOpener.open({ filePath: uri, contentType: 'application/pdf' })`) y `:87` (fallback `application/octet-stream`)
- R7: [x] `apps/web/src/lib/api-files.test.tsx:12` (con y sin `content-disposition`: `factura-taller.pdf` / `fallback.pdf`, y el blob correcto)
- R8: [x] `download.test.ts:89` (ambas funciones rechazan con el error del módulo) + `native-files.test.ts:98` (fallo de escribir, compartir y abrir propagado; tras fallo de escritura no se llama a share/open)
- R9: [x] `maintenance-attachments.test.tsx` › `native: saves an invoice with its original name` (tarjeta → nombre del `Content-Disposition`; visor → `originalName`; ningún `<a>` clicado)
- R10: [x] `maintenance-attachments.test.tsx` › `native: opens a PDF with the system viewer` (`openFile('factura.pdf', blob application/pdf con el contenido)`)
- R11: [x] `data-section.test.tsx` › `native: saves the export zip with its name` (nombre del `Content-Disposition`, tipo y bytes del zip, sin toast)
- R12: [x] `add-to-calendar.test.tsx` › `native: saves the .ics with its name` (nombre slug, `text/calendar;charset=utf-8`, contenido con `UID`)
- R13: [x] tres tests nativos que afirman el texto del toast «No se ha podido abrir el archivo» (adjunto, export, `.ics`); el visor ya estaba cubierto por `attachment-viewer`/tests previos de modo servidor y su código no cambia
- R14: [x] `apps/mobile/test/config.test.mjs` › `declares the web's Capacitor plugins with the same versions` (los tres presentes en web y misma versión en mobile)
- R15: [x] `apps/web/src/i18n/locales.test.ts` (paridad es/en); `files.shareTitle` en ambos
- R16: [x] `apps/mobile/test/docs.test.mjs` › `documents native files and no longer lists them as a limitation`

## Tasks
- T1..T16: [x]. T15: APK no generada en local (falta JDK 21), justificado en `impl_mobile-native-files.md` con la vía del artefacto `ikrive-debug-apk` de CI y la checklist manual, tal como permite la propia task.

## Checkpoints
- C1: [x] arnés en verde, una sola feature activa (#55 `in_progress`), rama `feat/mobile-native-files`.
- C2: [x] spec completo, EARS, tabla acceptance → R, tasks `[x]`, cada R con test leído.
- C3: [x] el diff coincide con la tabla «Archivos» de `design.md` (más los tests previstos en tasks, `.gradle` regenerados y `pnpm-lock.yaml`); sin refactors ajenos.
- C4: [x] N/A API/BD/shared. Web: código en `lib/` (costura transversal ya existente) y `features/*`; textos en es/en; sin componentes nuevos.
- C5: [x] sin `any`/`@ts-ignore`, sin `console.log`, sin TODOs; no aplica a fechas ni ficheros subidos.
- C6: [x] harness en verde; tests con resultados concretos; sin BD implicada. Capturas: no aplica (sin cambio visible en la web; la UI nativa es la hoja/visor del sistema, cubierta por la checklist manual del humano).
- C7: [x] `impl_mobile-native-files.md` con archivos, mapa R → test y salida; `progress/current.md` al día; `PLAN.md` no requiere cambio (no cierra fase ni cambia decisión).

## Hallazgos
Ninguno bloqueante.

## Criterio sobre los puntos abiertos

1. **Precache de la PWA (~18 KB de `native-files-*.js` + `web-*.js` de los plugins).** No bloquea. La decisión 4 de `design.md` (aprobada en Gate 1) ya acepta que el chunk aparezca en `dist/` sin cargarse; el precache es una consecuencia de esa decisión, no un incumplimiento de R1/R2 (que hablan de *cargar* el módulo en ejecución, y no se carga). Tocar `features/pwa/config.ts` estaría fuera de `design.md`, así que hizo bien en no hacerlo. Además, excluirlos con `globIgnores` es frágil: los chunks de los plugins se llaman `web-*.js`, un nombre genérico que podría coincidir con chunks propios en el futuro; si se quiere, mejor nombrarlos con `manualChunks`/`chunkFileNames` y excluir ese prefijo, en una feature aparte. Coste real: 18 KB descargados una vez por instalación. Recomendación: dejarlo así o abrir un ítem pequeño de backlog.
2. **`aria-label` «Abrir «…» en una pestaña nueva» en la app.** Es cierto que en la APK es inexacto (abre el visor del sistema), pero solo afecta al nombre accesible (lector de pantalla); el texto visible no cambia y `design.md` › «Impacto en UI» declara la UI sin cambios. No viola ningún R. Recomendación: corregirlo en una feature pequeña (clave i18n alternativa tipo «Abrir «…» con el visor del sistema» cuando `isNativeApp()`), o en #52, que volverá a tocar la app. Lo dejo en avisos.
3. **Desviaciones documentadas:**
   - `// @vitest-environment jsdom` en `download.test.ts`: correcta. La vía web necesita DOM para el `<a>`; se mantiene el nombre y el proyecto del spec y solo cambia el entorno de ese fichero. Aceptada.
   - `safeFileName` con `charCodeAt` en vez de regex: equivalente al diseño (controles `< 0x20` y `0x7f` → `_`) y evita desactivar una regla de Biome. Aceptada; el test cubre `\u0001`.
   - El test de R13 del `.ics` se llama `shows an error toast when the .ics cannot be saved`, igual que en `tasks.md` (sin prefijo `native:`), aunque corre en modo nativo. Sin efecto.

## Avisos para el humano (no bloquean)
- **Prueba real pendiente (Gate 2):** nada de la parte nativa se ha ejecutado en un dispositivo (tests con plugins mockeados y APK no compilada en local). Ejecutar la checklist de `progress/impl_mobile-native-files.md` con el artefacto `ikrive-debug-apk` de CI antes de aprobar el merge; el job `android` de CI confirmará además que Gradle compila con los tres plugins (en local la toolchain JDK 21 de `capacitor-filesystem` no se pudo comprobar).
- En la checklist, probar una factura cuyo nombre tenga **espacios o acentos** al abrir el PDF: `FileOpener` hace `Uri.parse(uri).getPath()` sobre el `file://` que devuelve Filesystem y usa su propio `FileProvider` (`${applicationId}.file.opener.provider`, distinto del de la app); conviene ver que encuentra el fichero.
- Precache de la PWA y `aria-label` del PDF en la app: ver «Criterio sobre los puntos abiertos» 1 y 2; candidatos a backlog.
- Memoria con exports grandes (base64 en el puente): anotar el tamaño del zip en la checklist como prevé el diseño.

## Cambios requeridos
Ninguno.
