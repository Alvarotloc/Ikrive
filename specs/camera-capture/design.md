# Design — camera-capture

## Lo que hace Capacitor (verificado en `@capacitor/android` 8.6.0)

`BridgeWebChromeClient.onShowFileChooser` (`node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/BridgeWebChromeClient.java`, l. 276–305):

1. Solo entra en modo cámara si `fileChooserParams.isCaptureEnabled()` **y** `acceptTypes` contiene literalmente `"image/*"`. Con `accept="application/pdf,image/jpeg,…"` (el de las facturas) ignora `capture` y abre el selector de archivos. → El input de cámara de las facturas tiene que usar `accept="image/*"`.
2. `isMediaCaptureSupported()` = permiso `CAMERA` concedido **o** `CAMERA` no declarado en el manifest. Si no está declarado, lanza `ACTION_IMAGE_CAPTURE` sin pedir nada. Si está declarado y no concedido, **pide el permiso él solo** (`permissionLauncher.launch({CAMERA})`) y, si se concede, abre la cámara. Así se cumple «la primera vez se pide» sin código propio.
3. Si se deniega: `Logger.warn("Camera permission not granted")` y `filePathCallback.onReceiveValue(null)`. A la web solo le llega una selección vacía: el WebView (Chromium) dispara `cancel` en el `<input>`, igual que si el usuario cierra la cámara sin hacer la foto. Con «no volver a preguntar», Android responde `false` al instante sin diálogo y pasa lo mismo.
4. `showImageCapturePicker` usa `intent.resolveActivity(pm)`; si es `null`, cae en silencio al selector de archivos. Con `targetSdkVersion = 36` la visibilidad de paquetes (Android 11+) hace que `resolveActivity` devuelva `null` salvo que el manifest declare `<queries>` con `IMAGE_CAPTURE` (R9). La foto se escribe en `getExternalFilesDir(PICTURES)` vía el `FileProvider` `${applicationId}.fileprovider`, que `file_paths.xml` ya cubre (`external-path .`).

**Detectar la denegación.** El `cancel` no distingue «denegado» de «cerré la cámara». Pero Capacitor solo abre la cámara con el permiso concedido, así que: `cancel` + permiso no concedido ⇒ no hubo cámara ⇒ denegado (R11); `cancel` + concedido ⇒ el usuario canceló (R12). El estado se lee con `checkPermissions()` de un plugin propio mínimo (R10): `Bridge.getPermissionStates` devuelve `granted` con `checkSelfPermission`, y si no, `prompt`/`denied` (la caché de «denied» solo la rellena el flujo de permisos de plugins, no el del file chooser), por eso la comparación es solo `=== 'granted'`.

## Archivos por capa

### Android (`apps/mobile`)
- `android/app/src/main/AndroidManifest.xml`: `<uses-permission android:name="android.permission.CAMERA" />` (R8) y `<queries><intent><action android:name="android.media.action.IMAGE_CAPTURE" /></intent></queries>` (R9).
- `android/app/src/main/java/com/ikrive/app/CameraPermissionPlugin.java` (nuevo):
  ```java
  @CapacitorPlugin(name = "CameraPermission",
      permissions = @Permission(alias = "camera", strings = { Manifest.permission.CAMERA }))
  public class CameraPermissionPlugin extends Plugin {}
  ```
  Sin métodos: `checkPermissions` lo hereda de `Plugin` (`@PluginMethod`). No pide nada; el permiso lo pide Capacitor al abrir la cámara.
- `MainActivity.java`: `onCreate` con `registerPlugin(CameraPermissionPlugin.class)` antes de `super.onCreate(...)` (R10).
- `test/config.test.mjs`: tests del manifest y del registro del plugin (lectura como texto, como los actuales).

### Web (`apps/web/src`)
- `lib/use-can-capture.ts` (nuevo): `COARSE_POINTER_QUERY = '(pointer: coarse)'` y `useCanCapture(): boolean` = `useMediaQuery(COARSE_POINTER_QUERY) || isNativeApp()` (hook siempre llamado; reutiliza `useMediaQuery`).
- `lib/native-camera.ts` (nuevo, solo con `import()` tras `isNativeApp()`): `registerPlugin<CameraPermissionPlugin>('CameraPermission')` y `isCameraGranted(): Promise<boolean>` (`(await plugin.checkPermissions()).camera === 'granted'`).
- `features/pwa/config.ts`: `camera` en la regex de `NATIVE_ONLY_MODULES` (R15).
- `components/camera-capture-button.tsx` (nuevo): `CameraCaptureButton` = `Button` («Hacer foto», icono `Camera`) + input de cámara oculto (`sr-only`, `tabIndex={-1}`, `aria-label`). En `change` llama a `onFile(file)` y vacía `value`. Un `useEffect` suscribe `cancel` con `addEventListener` (React no garantiza `onCancel` en `<input>`): si `isNativeApp()`, `import('@/lib/native-camera')` → `isCameraGranted()`; si es `false`, `toast.error(t('camera.denied'))`. Un fallo del import o del plugin se ignora (no hay nada que avisar). No valida nada: la validación sigue en quien recibe `onFile`.
  ```ts
  interface CameraCaptureButtonProps {
    inputLabel: string;            // aria-label del input (tests y lectores)
    onFile: (file: File) => void;
    disabled?: boolean;
    size?: ButtonProps['size'];
    variant?: ButtonProps['variant'];
  }
  ```
- `features/vehicles/photo-picker.tsx`: `const canCapture = useCanCapture()`. Táctil: `CameraCaptureButton` con `onFile={onFile}` (el mismo `onFile` → `upload.mutateAsync`, toasts actuales) y el botón actual con el texto `vehicles.photo.gallery`. Escritorio: igual que hoy. El input actual recibe `aria-label={t('vehicles.photo.fileInput')}`. La barra pasa a `flex-wrap` para que tres botones quepan en 320 px.
- `features/maintenance/attachment-picker.tsx`: táctil → `CameraCaptureButton` (`variant="outline"`, `size="sm"`, `disabled={disabled}`) junto al botón actual, con `onFile={(file) => onFiles([file])}`. Así la foto entra por el mismo `onFiles` que ya aplican `maintenance-attachments.tsx` (`acceptFiles` + `uploadFiles`) y `maintenance-form.tsx` (`acceptFiles` + subida tras crear): mismos límites y mensajes sin tocar esos ficheros. El texto de ayuda («PDF, JPG, PNG o WebP · máx. N MB») sigue debajo de los dos.
- i18n `es.json`/`en.json`:
  - `camera.take`: «Hacer foto» / «Take photo»
  - `camera.input`: «Hacer una foto con la cámara» / «Take a photo with the camera»
  - `camera.denied`: «Ikrive no tiene permiso para usar la cámara. Actívalo en Ajustes › Aplicaciones › Ikrive › Permisos, o elige una imagen o un archivo ya guardado.» / «Ikrive isn't allowed to use the camera. Turn it on in Settings › Apps › Ikrive › Permissions, or choose an image or file you already have.»
  - `vehicles.photo.gallery`: «Elegir de la galería» / «Choose from gallery»
  - `vehicles.photo.fileInput`: «Elegir foto del vehículo» / «Choose vehicle photo»
- `docs/mobile.md`: viñeta «Cámara» (permiso, qué pasa si se deniega, dónde activarlo).

### API, `packages/shared`, `packages/db`, `DataSource`
Sin cambios. La foto de la cámara es un `File` más (JPEG en Android) que entra por `vehicles.setPhoto` / `attachments.upload` del `DataSource` activo: HTTP en modo servidor (token incluido) y `local/` en modo local (WebP por canvas, ficheros en `Directory.Data`). Los tipos los sigue validando la API / el modo local por contenido (415).

## Impacto en UI

| | Táctil (app nativa o móvil web) | Escritorio |
|---|---|---|
| Foto del vehículo | [X] [Hacer foto] [Elegir de la galería] | [X] [Añadir foto / Cambiar foto] (igual que hoy) |
| Facturas (diálogo y alta) | [Subir/Añadir facturas] [Hacer foto] + ayuda | igual que hoy |

Botones de `components/ui/button`, mismos tamaños; sin estados nuevos de carga (el `busy`/`disabled` actual desactiva también «Hacer foto»). Modo oscuro sin cambios (mismos variantes). En el móvil web el permiso lo gestiona el navegador; no hay aviso propio (R14).

## Cómo se prueba lo táctil
`mockMediaQuery(true|false)` de `src/test/render.tsx` hace que **todas** las queries coincidan o no: `true` = táctil, `false` = escritorio en web. Para la app nativa, `vi.stubEnv('MODE', 'native')`. Como `useMediaQuery` llama a `window.matchMedia` (jsdom no lo tiene), los tests que montan un picker y hoy no llaman a `mockMediaQuery` (`maintenance-form.test.tsx`, `maintenance-attachments.test.tsx`) añaden `mockMediaQuery(false)` en `beforeEach`. En los tests el plugin se simula con `vi.mock('@/lib/native-camera')` (como `native-notifications` en `settings-page.test.tsx`) y la cancelación con `fireEvent(input, new Event('cancel'))`.

## Alternativas descartadas
- **`@capacitor/camera` (`Camera.getPhoto` o solo `checkPermissions`).** Dependencia nueva con librería nativa propia (más peso en la APK y otra pieza que mantener en sincronía con `apps/web`) para algo que Capacitor ya hace con `capture`. Además, `getPhoto` cambiaría el flujo a base64/URI y duplicaría el camino de subida. El plugin propio son ~10 líneas sin dependencias.
- **Un solo input sin `capture`** (que Android muestre «Cámara o Archivos»): el `BridgeWebChromeClient` de Capacitor no ofrece ese selector combinado; abre solo el de archivos (es el bug actual).
- **Avisar en todo `cancel` («si no se abrió la cámara, revisa el permiso»)**: molesto cada vez que el usuario cierra la cámara a propósito; con `isCameraGranted` se distingue.
- **Comprobar el permiso antes de abrir el input**: el `await` del plugin puede consumir la activación de usuario que exige `input.click()`, y en el estado `prompt` no se sabe si Android aún mostrará el diálogo.
- **Ocultar por ancho (`DESKTOP_QUERY`)**: una ventana estrecha de escritorio mostraría «Hacer foto» sin cámara; el tipo de puntero describe mejor el dispositivo.

## Decisiones a validar (Gate 1)
1. **Criterio de «táctil»**: `isNativeApp() || (pointer: coarse)`. Un portátil táctil con ratón como puntero principal no ve «Hacer foto»; una tableta sí.
2. **Textos**: en el selector de foto, en táctil, «Añadir/Cambiar foto» pasa a «Elegir de la galería»; en facturas se mantiene «Subir facturas»/«Añadir facturas» como acción de elegir archivo (admite PDF y varios), y se añade «Hacer foto».
3. **Aviso de denegación**: un toast de error tras volver de la cámara, sin botón para abrir los ajustes de Android (necesitaría otro plugin).
4. **Plugin nativo propio** `CameraPermission` en `apps/mobile` en lugar de `@capacitor/camera`.
5. **`<queries>` de `IMAGE_CAPTURE`** en el manifest (deducido del código de Capacitor + `targetSdk 36`; sin él la cámara caería en el selector de archivos).

## Riesgos
- El evento `cancel` en `<input type=file>` existe desde Chromium 113. Con un Android System WebView más antiguo no habría aviso de denegación (la galería sigue funcionando). Aceptable: el WebView se actualiza con la Play Store.
- Las fotos de Capacitor quedan como `JPEG_*.jpg` en `Android/data/<pkg>/files/Pictures` (no las borra). Se suben y se quedan ahí; fuera de alcance.
- Fotos grandes: un JPEG de cámara ronda 3–8 MB; `MAX_UPLOAD_MB` es 20 por defecto. Si el servidor tiene un límite menor, sale el aviso de tamaño de siempre (R5).
- Declarar `CAMERA` implica `uses-feature android.hardware.camera` requerido para la Play Store; la APK no se publica allí, sin efecto.
- Comprobación real solo en un móvil: checklist manual en `progress/impl_camera-capture.md` (primera vez → diálogo; denegar → aviso y galería OK; «no volver a preguntar» → aviso inmediato; conceder → foto subida, en servidor y en local).

## Fuera de alcance
- Recortar, girar o comprimir la foto antes de subirla (lo hace el servidor / el modo local como hoy).
- Varias fotos seguidas en una sola acción para facturas; escanear documentos a PDF.
- iOS nativo (no hay proyecto); en iPhone, la PWA usa `capture` del navegador.
- Abrir los ajustes de Android desde la app.
