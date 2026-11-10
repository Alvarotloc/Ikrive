# Implementación — mobile-native-files (#55)

Rama `feat/mobile-native-files`. Tasks T1–T16 marcadas en `specs/mobile-native-files/tasks.md`. Sin commits.

## Cambios por archivo

| Archivo | Cambio |
|---|---|
| `apps/web/package.json` | `@capacitor/core` `8.6.0`, `@capacitor/filesystem` `8.1.5`, `@capacitor/share` `8.0.3`, `@capacitor-community/file-opener` `8.0.1` (versiones exactas) |
| `apps/mobile/package.json` | Los tres plugins con las mismas versiones exactas |
| `pnpm-lock.yaml` | Resultado de `pnpm add -E` (supply-chain policy OK) |
| `apps/mobile/android/capacitor.settings.gradle`, `apps/mobile/android/app/capacitor.build.gradle` | Regenerados por `cap sync android`: incluyen `capacitor-community-file-opener`, `capacitor-filesystem`, `capacitor-share` |
| `apps/web/src/lib/native-files.ts` (nuevo) | `safeFileName`, `blobToBase64` (bloques de 32 KiB), `isShareCanceled`, `saveFile` (caché → `Share.share` con `files.shareTitle`, la cancelación resuelve), `openFile` (caché → `FileOpener.open` con `blob.type` o `application/octet-stream`) |
| `apps/web/src/lib/download.ts` | `downloadBlob(fileName, blob)` y `openBlob(blob, fileName)` pasan a `async`; si `isNativeApp()` cargan `./native-files` con `import()`; si no, el `<a>` de siempre, sin `await` antes del clic |
| `apps/web/src/lib/api-files.ts` | `saveApiFile` hace `await downloadBlob`; `openApiFile(url, fallbackName)` pasa `fileName ?? fallbackName` |
| `apps/web/src/features/maintenance/maintenance-attachments.tsx` | `openApiFile(inlineUrl(attachment.url), name)` |
| `apps/web/src/features/calendar/actions.ts` | `downloadIcs` devuelve la promesa |
| `apps/web/src/features/schedules/add-to-calendar.tsx` | `onSelect` captura el rechazo → `toast.error(t('common.fileError'))` |
| `apps/web/src/features/reports/queries.ts` | `await downloadBlob(…)` en el `mutationFn` |
| `apps/web/src/i18n/locales/{es,en}.json` | `files.shareTitle`: «Guardar o compartir» / «Save or share» |
| `docs/mobile.md` | Fuera la limitación de ficheros y la frase «hasta entonces no se publica ninguna APK»; sección nueva «Ficheros» (descargar = hoja de compartir, abrir PDF = visor del sistema, hace falta una app de PDF, sin permisos de almacenamiento) |
| Tests | `lib/download.test.ts`, `lib/native-files.test.ts`, `lib/api-files.test.tsx` (nuevos); casos nativos en `maintenance-attachments.test.tsx`, `data-section.test.tsx`, `add-to-calendar.test.tsx`; `apps/mobile/test/config.test.mjs` y `docs.test.mjs` |

## Trazabilidad

| R | Test(s) |
|---|---|
| R1 | `apps/web/src/lib/download.test.ts` › `web: downloads through a temporary <a download> without loading the native module` |
| R2 | `apps/web/src/lib/download.test.ts` › `web: opens in a new tab without loading the native module` |
| R3 | `download.test.ts` › `native: saves through native-files with the file name`; `native-files.test.ts` › `writes the file to the cache with its sanitized name` |
| R4 | `native-files.test.ts` › `opens the share sheet with the written file` |
| R5 | `native-files.test.ts` › `resolves when the share sheet is cancelled` |
| R6 | `download.test.ts` › `native: opens through native-files with the file name`; `native-files.test.ts` › `opens the file with its MIME type`, `falls back to application/octet-stream` |
| R7 | `apps/web/src/lib/api-files.test.tsx` › `server mode: opens a PDF with its Content-Disposition name or the fallback` |
| R8 | `download.test.ts` › `native: rejects when the native module fails`; `native-files.test.ts` › `rejects when writing, sharing or opening fails` |
| R9 | `maintenance-attachments.test.tsx` › `native: saves an invoice with its original name` (tarjeta + visor) |
| R10 | `maintenance-attachments.test.tsx` › `native: opens a PDF with the system viewer` |
| R11 | `data-section.test.tsx` › `native: saves the export zip with its name` |
| R12 | `add-to-calendar.test.tsx` › `native: saves the .ics with its name` |
| R13 | `maintenance-attachments.test.tsx` › `native: shows an error toast when opening fails`; `data-section.test.tsx` › `native: shows an error toast when saving the export fails`; `add-to-calendar.test.tsx` › `shows an error toast when the .ics cannot be saved` (+ los existentes `server mode: shows an error toast when a download fails` / `…when the export fails`) |
| R14 | `apps/mobile/test/config.test.mjs` › `declares the web's Capacitor plugins with the same versions` |
| R15 | `apps/web/src/i18n/locales.test.ts` (paridad de claves es/en, en verde) |
| R16 | `apps/mobile/test/docs.test.mjs` › `documents native files and no longer lists them as a limitation` |

Test extra no pedido: `native-files.test.ts` › `encodes large blobs to base64 without the data: prefix` (100 000 bytes, varios bloques de 32 KiB).

## `pnpm harness --full`

```
[OK]    58 features: 54 done, 3 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #55 mobile-native-files (in_progress)
[OK]    Rama actual: feat/mobile-native-files
[OK]    pnpm lint
[OK]    pnpm typecheck
[OK]    pnpm test        (web 423, api 368, shared 119, mobile 24, e2e-unit 6)
[OK]    Arnés en verde.
```

## T15 — Build y APK

- `pnpm --filter @ikrive/web build`: OK. El código de la web no cambia de comportamiento (R1/R2 cubiertos). Como prevé la decisión 4 del diseño, el build web emite los chunks `native-files-*.js` (≈9,8 KB) y dos `web-*.js` de los plugins (≈8,8 KB) que la web nunca pide; **observación:** el SW de la PWA los incluye en el precache (≈18 KB extra descargados una vez). Excluirlos tocaría `features/pwa/config.ts` (fuera de `design.md`), así que no lo he hecho; lo dejo a criterio del reviewer/humano.
- `pnpm --filter @ikrive/mobile build:web` + `cap sync android`: OK, detecta los 3 plugins.
- `./gradlew assembleDebug`: **no generada en local.** El SDK de Android está (`~/Android/Sdk`), pero no hay JDK 21 (solo 17 y 25; Gradle 8.14.3 no corre en 25 y con 17 falla la toolchain `languageVersion=21` de `capacitor-filesystem`). No he instalado nada. La fase de configuración de Gradle sí resuelve los tres proyectos de plugin.
- **Cómo obtener la APK debug:** el job `android` de `ci.yml` la compila en cada PR que toca `apps/mobile`, `apps/web` o el lockfile y la sube como artefacto `ikrive-debug-apk`. Con la rama empujada y el PR abierto: `gh run list --branch feat/mobile-native-files --workflow ci.yml` → `gh run download <run-id> -n ikrive-debug-apk`. Alternativa local: instalar un JDK 21 y `JAVA_HOME=<jdk21> ./gradlew assembleDebug` en `apps/mobile/android` (`app/build/outputs/apk/debug/app-debug.apk`).

## Checklist de pruebas manuales (humano, APK debug, antes de Gate 2)

Preparación: instalar `app-debug.apk` (`adb install -r app-debug.apk` o abrirla en el móvil), elegir «Mi servidor» con una instancia que tenga un vehículo con un mantenimiento con **una factura PDF y una imagen**, un mantenimiento programado **con fecha** y alguna foto.

- [ ] **Descargar factura PDF (tarjeta):** Facturas del mantenimiento → botón «Descargar» de la tarjeta del PDF → se abre la hoja de compartir titulada «Guardar o compartir»; guardar en Archivos/Drive → el fichero tiene el **nombre original** (el del `Content-Disposition`).
- [ ] **Descargar imagen desde el visor:** tocar la miniatura → visor → «Descargar» → hoja de compartir con el nombre original de la imagen.
- [ ] **Abrir PDF:** tocar la tarjeta del PDF → se abre en el **visor de PDF del sistema** (Drive/visor del fabricante) con el contenido correcto; volver con «Atrás» → la app sigue en el diálogo de facturas.
- [ ] **Sin app de PDF** (opcional, si se puede desactivar el visor): abrir el PDF → toast «No se ha podido abrir el archivo», sin cuelgue.
- [ ] **Export zip con fotos:** Ajustes › «Descargar mis datos» → hoja de compartir con `ikrive-export-AAAA-MM-DD.zip`; guardarlo y **anotar su tamaño: ____ MB**. Comprobar que el zip se abre y contiene las fotos/facturas. Si el tamaño es grande (decenas de MB), anotar si la app tardó o se cerró (riesgo de memoria por base64 del diseño).
- [ ] **`.ics`:** Programados → «Añadir al calendario» → «Descargar .ics» → hoja de compartir con `<titulo>-<vehiculo>.ics`; abrirlo con Google Calendar u otra app de calendario → evento en la fecha correcta.
- [ ] **Cancelar la hoja de compartir:** repetir cualquier descarga y cerrar la hoja sin elegir destino (gesto atrás o tocar fuera) → **sin toast de error** y la app sigue usable.
- [ ] **Informe de venta (PDF)** (de rebote, sin requirement): Vehículo › Informe de venta › descargar → hoja de compartir con el PDF.
- [ ] **Web sin cambios** (navegador de escritorio, modo mismo origen): descargar factura y export, abrir PDF en pestaña nueva y descargar `.ics` siguen funcionando como antes.

## Desviaciones y notas

- `download.test.ts` usa `// @vitest-environment jsdom` en la cabecera: el spec pide un `.ts` (proyecto `unit`, Node), pero la vía web necesita DOM para el `<a>`. Mantengo nombre y proyecto del spec y cambio solo el entorno de ese fichero.
- `safeFileName` filtra los caracteres de control por código (`charCodeAt`) en vez de con una regex, para no tener que desactivar la regla `noControlCharactersInRegex` de Biome.
- Observación de UI (fuera de alcance, sin cambiar): en la app, el `aria-label` del botón del PDF sigue siendo «Abrir «…» en una pestaña nueva» aunque abra el visor del sistema.
- Observación del precache de la PWA: ver T15.
- `cap sync android` también copia `dist-native` a `android/app/src/main/assets/` (ignorado por git).
