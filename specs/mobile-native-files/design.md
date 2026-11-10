# Design — mobile-native-files

La costura ya existe: todos los ficheros de la web pasan por `downloadBlob` / `openBlob` (`lib/download.ts`), directamente (`.ics`, informe de venta) o a través de `saveApiFile` / `openApiFile` (`lib/api-files.ts`: facturas, visor, export). En la app siempre hay servidor (`isServerMode()` es `true` tras `/server`), así que las ramas `<a href download>` de mismo origen no se usan dentro de la APK. Solo cambia la costura: si `isNativeApp()`, se delega en un módulo nuevo `lib/native-files.ts` cargado con `import()` dinámico; si no, el código actual tal cual.

## Plugins elegidos

| Plugin (versión exacta, Capacitor 8) | Para qué | Por qué |
|---|---|---|
| `@capacitor/filesystem` `8.1.5` (oficial) | Escribir el blob en `Directory.Cache` y obtener su `uri` (`file://…`) | Share y el file-opener necesitan un fichero real en disco, no un `blob:`. La caché no pide permisos de almacenamiento y ya está en `res/xml/file_paths.xml` (`cache-path`) del `FileProvider` que generó #51 |
| `@capacitor/share` `8.0.3` (oficial) | «Descargar»: hoja de compartir con el fichero (`files: [uri]`) | Desde ella el usuario elige «Guardar en Archivos/Drive», enviarlo, etc. Cumple «guarda o comparte con su nombre original» sin permisos ni rutas públicas |
| `@capacitor-community/file-opener` `8.0.1` | «Abrir PDF»: `ACTION_VIEW` con el `FileProvider` → visor del sistema | Ni Filesystem ni Share abren un fichero con su app asociada; es el plugin de la organización Capacitor Community, MIT, con soporte de Capacitor 8 y una API mínima (`open({ filePath, contentType })`) |

Van en `dependencies` de **`apps/web`** (el código JS que se importa) y de **`apps/mobile`** con la misma versión exacta (R14): `cap sync android` solo registra el código nativo de los plugins que declara el proyecto Capacitor. Tras añadirlos, `pnpm --filter @ikrive/mobile exec cap sync android` regenera `android/capacitor.settings.gradle` y `android/app/capacitor.build.gradle` (versionados); no necesita el SDK de Android.

## Detección de plataforma

Se reutiliza `isNativeApp()` (flag de build `MODE === 'native'`, decisión 4 de #51): sin `Capacitor.isNativePlatform()` en tiempo de ejecución. Los plugins solo se importan desde `lib/native-files.ts`, y este solo con `await import('./native-files')` dentro de la rama nativa: la web nunca lo pide (R1, R2) y los tests cambian de vía con `vi.stubEnv('MODE', 'native')` + `vi.mock('./native-files')`.

## Archivos

| Capa | Archivo | Cambio |
|---|---|---|
| web | `package.json` | deps exactas `@capacitor/core` `8.6.0` (peer de los plugins, la misma que `apps/mobile`), `@capacitor/filesystem`, `@capacitor/share`, `@capacitor-community/file-opener` |
| web | `src/lib/download.ts` | `downloadBlob` y `openBlob` pasan a `async` y bifurcan por `isNativeApp()` (R1–R3, R6). La rama web es la actual, sin `await` antes del clic |
| web | `src/lib/native-files.ts` (nuevo) | `saveFile`, `openFile`, `safeFileName`, `blobToBase64`, `isShareCanceled` (R3–R6, R8) |
| web | `src/lib/api-files.ts` | `saveApiFile` hace `await downloadBlob(…)`; `openApiFile(url, fallbackName)` pasa `fileName ?? fallbackName` a `openBlob` (R7) |
| web | `src/features/maintenance/maintenance-attachments.tsx` | `openApiFile(inlineUrl(attachment.url), name)` (R10) |
| web | `src/features/calendar/actions.ts` | `downloadIcs` devuelve la promesa de `downloadBlob` |
| web | `src/features/schedules/add-to-calendar.tsx` | `onSelect`: `downloadIcs(…).catch(() => toast.error(t('common.fileError')))` (R12, R13) |
| web | `src/features/reports/queries.ts` | `await downloadBlob(…)` en el `mutationFn` (el informe de venta también funciona en la app; su error ya va al toast `saleReport.error`) |
| web | `src/i18n/locales/{es,en}.json` | `files.shareTitle` (R15) |
| mobile | `apps/mobile/package.json` | los tres plugins, mismas versiones (R14); `cap sync android` |
| docs | `docs/mobile.md` | quita la limitación de ficheros y la frase «hasta entonces no se publica ninguna APK»; añade una sección corta «Ficheros» (descargar = hoja de compartir, abrir PDF = visor del sistema; hace falta una app que lea PDF) (R16) |

Sin cambios en la API, la BD ni `packages/shared`. `data-section.tsx` y `attachment-viewer.tsx` no cambian (ya hacen `await saveApiFile` con toast `common.fileError`).

## Tipos y firmas

```ts
// lib/download.ts
export async function downloadBlob(fileName: string, blob: Blob): Promise<void>;
//   isNativeApp() → (await import('./native-files')).saveFile(fileName, blob); si no, <a download> como hoy.
export async function openBlob(blob: Blob, fileName: string): Promise<void>;
//   isNativeApp() → (await import('./native-files')).openFile(fileName, blob); si no, <a target=_blank> como hoy.

// lib/api-files.ts
export async function openApiFile(url: string, fallbackName: string): Promise<void>;

// lib/native-files.ts — solo se carga en la app
/** Sustituye `/ \ : * ? " < > |` y controles por `_`, recorta espacios/puntos finales; '' → 'file'. */
export function safeFileName(name: string): string;
/** Base64 sin prefijo `data:` (blob.arrayBuffer + btoa por bloques de 32 KiB; vale en Node y en la WebView). */
export function blobToBase64(blob: Blob): Promise<string>;
/** El plugin Share rechaza con «Share canceled» al cerrar la hoja. */
export function isShareCanceled(error: unknown): boolean;
/** Filesystem.writeFile({ path: `files/${safeFileName(name)}`, data, directory: Directory.Cache, recursive: true })
 *  → Share.share({ title: name, files: [uri], dialogTitle: i18n.t('files.shareTitle') }); cancelación → resuelve. */
export function saveFile(fileName: string, blob: Blob): Promise<void>;
/** writeFile igual → FileOpener.open({ filePath: uri, contentType: blob.type || 'application/octet-stream' }). */
export function openFile(fileName: string, blob: Blob): Promise<void>;
```

`i18n` se importa de `@/i18n` (instancia ya inicializada; no hay hook fuera de componentes). Cualquier otro error de los plugins se propaga (R8) y lo pinta el llamador (R13).

## Impacto en UI

Ninguno visible en la web. En la app: «Descargar» abre la hoja de compartir del sistema titulada «Guardar o compartir» / «Save or share»; tocar un PDF lo abre en el visor del sistema (fuera de la app; al volver, la app sigue donde estaba). Sin estados de carga nuevos: los botones ya esperan la descarga autenticada.

## Decisiones a validar (Gate 1)

1. **«Descargar» = hoja de compartir, no guardado directo en `Documentos`/`Descargas`.** Es la vía sin permisos de Android 10+ y deja elegir destino; el acceptance la admite («la guarda o abre la hoja de compartir»). Coste: un toque más para guardar.
2. **Ficheros temporales en la caché, sin limpieza propia:** se sobrescriben por nombre y Android vacía la caché cuando necesita espacio. No se borran tras compartir porque la app destino puede leerlos después.
3. **Mismo toast `common.fileError` («No se ha podido abrir el archivo») para guardar y abrir**, como ya hace la web en descargas autenticadas: así la web no cambia ni un texto. Alternativa: una clave nueva `common.fileSaveError` para guardar (cambiaría el texto también en la web).
4. **`@capacitor/core` pasa a dependencia de `apps/web`** (lo pide como peer cada plugin). Solo lo usa el chunk de `native-files`, que la web nunca pide; puede aparecer como fichero en `dist/` sin cargarse.
5. **Informe de venta (PDF)** también funciona en la app de rebote (usa `downloadBlob`), sin requirement propio.

## Alternativas descartadas

- **Solo `@capacitor/share` también para «abrir»:** la hoja de compartir no es «mostrarla con el visor del sistema» (acceptance 2) y obliga a elegir app cada vez.
- **`Filesystem.downloadFile` (descarga nativa directa al disco):** evita pasar el blob por base64, pero sale por HTTP nativo sin el `fetch` de la WebView (salta CORS/`TRUSTED_ORIGINS` y el manejo de 401 de `api-client`) y no sirve para el `.ics`, que se genera en el cliente. Queda como plan B si el export zip resulta demasiado grande (ver Riesgos).
- **`@capawesome-team/capacitor-file-opener`:** equivalente; se prefiere el de Capacitor Community por API mínima y misma organización que otros plugins comunitarios. Cambiarlo es sustituir una línea de `openFile`.
- **`Capacitor.isNativePlatform()` en tiempo de ejecución:** ya descartado en #51 (decisión 4).

## Riesgos

- **Memoria con exports grandes:** el blob se convierte a base64 (≈1,33×) y cruza el puente de Capacitor como string. Para exports de decenas de MB puede ir justo en móviles modestos; la checklist manual que el implementer deja en `progress/impl_mobile-native-files.md` incluye un export con fotos anotando su tamaño, que el humano prueba en la APK debug antes de Gate 2.
- **Sin app de PDF instalada:** `FileOpener.open` rechaza → toast `common.fileError` (R13). Se menciona en `docs/mobile.md`.
- **Sin emulador en CI:** la lógica se cubre con Vitest mockeando los plugins; el job `android` de CI comprueba que el proyecto Gradle compila con los plugins. La prueba real (factura, PDF, export, `.ics`, cancelar la hoja) la hace el humano con la APK debug antes de Gate 2, siguiendo la checklist que deja el implementer en `progress/impl_mobile-native-files.md` (el implementer no puede manejar un móvil).
- **Texto del rechazo al cancelar:** `isShareCanceled` se basa en el mensaje del plugin («Share canceled»); si cambia en una versión futura, el usuario vería un toast al cancelar. Las versiones van fijadas.

## Fuera de alcance

- Calendario nativo y notificaciones (#52; sustituirá el `.ics` en la app), modo «En este teléfono» (#53, #54), iOS.
- Importar el zip con un selector nativo (el `<input type="file">` ya funciona en la WebView).
- Publicar el primer tag con APK (lo decide el humano tras esta feature).
