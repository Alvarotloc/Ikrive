# Design — camera-process-restore

## Mecanismo elegido: marcador en disco + la foto que ya está en `Pictures/`

Seguimos con el `<input capture>` y el `BridgeWebChromeClient` de Capacitor. Esta feature no añade plugins ni código Java.

Lo que hace el flujo actual de Capacitor:
- Antes de lanzar la cámara crea el fichero `JPEG_yyyyMMdd_HHmmss_*.jpg` en `getExternalFilesDir(PICTURES)`.
- La app de la cámara escribe la foto en ese fichero.
- Si nuestro proceso muere, el fichero se queda en disco. Es justo lo que hoy borra la limpieza de #79, como se vio en el HONOR.

Lo único que se pierde es el `ValueCallback` del file chooser y el estado de la página. Para recuperarlo:

1. **Al pulsar «Hacer foto»** (solo en la app nativa, y solo si el botón recibe un destino), se empieza a guardar en `Directory.Data/camera/pending-capture.json` el marcador `{ target, mode, openedAt }` sin esperar (fire-and-forget) y, en el mismo gesto, se llama a `input.click()` de forma síncrona para no perder la activación transitoria de usuario.
   - La escritura tarda milisegundos y el arranque en frío de la app de la cámara (cuando iAware mata el proceso) tarda mucho más, así que el marcador llega a disco antes de que muera el proceso. Si la escritura falla, la cámara se abre igual (R3).
   - El marcador va a un fichero y no a `localStorage`. Chromium escribe el DOM storage en disco con retraso, así que un SIGKILL justo al abrir la cámara se llevaría el marcador. `Filesystem.writeFile` escribe el fichero directamente.
2. **En `change` y en `cancel`** se borra el marcador. El flujo normal no cambia: el `cancel` sigue avisando del permiso (`isCameraGranted`) como hasta ahora.
3. **En el proceso nuevo**, `CameraRestoreHandler` (montado en `/_app`, solo en la app nativa) lee el marcador y busca la foto de la cámara (la más reciente con tamaño > 0 y `mtime ≥ floor(openedAt)`). Si el destino sigue existiendo, deja `{ target, file }` en un almacén en memoria y navega a la ruta del destino. Allí el componente correspondiente consume la foto y la pasa por su `onFile`/`onFiles` de siempre.
   - Por eso la subida, los límites, los toasts y el `DataSource` (servidor o local) son los mismos que con una foto recién hecha.
   - Al terminar, salga bien o mal, se borra el marcador.

### Qué se restaura y qué se da por perdido

| Destino | Qué se restaura | Qué se pierde (aceptado) |
|---|---|---|
| `vehicle-photo` | Se abre `/vehicles/$id/edit` y la foto se sube al momento, como ahora | Los cambios sin guardar del formulario del vehículo en esa página |
| `invoice` (diálogo de un registro) | Se abre la ficha del vehículo con el diálogo de ese registro y la foto se sube | Nada |
| `invoice-draft` (formulario de alta) | Se abre la ficha con el formulario de alta: los campos tal como estaban (`form.getValues()` guardado en el marcador) y la foto como factura pendiente | Las otras facturas pendientes que se habían elegido antes: están solo en memoria (`File` de la galería) y se avisa con un toast (R8). La categoría y el filtro de la línea temporal |

Funciona igual en modo servidor y en modo local: el marcador guarda el modo solo para no entregar la foto en un modo distinto (R10). La subida va por `dataSource()`.

Si la sesión de servidor ha caducado, `/_app` redirige al login y el handler no se monta. El marcador se queda en disco y la recuperación se hace al entrar.

### Cuándo se borra la foto

- `cleanUpCameraPhotos` (en `main.tsx`, antes de React) lee el marcador. Si es válido, barre con `before = min(startedAt, openedAt)`: se borran las fotos anteriores y se conserva la pendiente (R12).
- La foto recuperada se lee entera en memoria (`Filesystem.readFile` → bytes → `File`), así que ya no depende del fichero.
- El fichero se queda hasta el siguiente arranque sin marcador, y entonces la limpieza normal de #79 lo borra (R13). Es la misma regla que hoy para cualquier foto de la cámara.
- Una carrera entre la limpieza y el handler no es posible: el handler borra el marcador después de leer la foto, y la limpieza lee el marcador antes de listar.

## Archivos por capa (`apps/web/src`)

### Nativo (solo `import()`, chunk `assets/native/`)

`lib/native-camera.ts` (+ `lib/native-camera.test.ts`):

```ts
export const PENDING_CAPTURE_PATH = 'camera/pending-capture.json'; // Directory.Data
export function savePendingCapture(json: string): Promise<void>;     // recursive: true
export function readPendingCapture(): Promise<string | null>;        // null si no existe
export function clearPendingCapture(): Promise<void>;                // sin error si no existe
/** Foto de la cámara desde `openedAt` (más reciente, size > 0, mtime ≥ floor(openedAt)), o null. */
export function readCameraPhotoSince(openedAt: number): Promise<File | null>;
```

`removeCameraPhotos(before)` no cambia de firma: ya recibe el corte.

`lib/native-files.ts`: se exporta `base64ToBytes`, que hoy es privado en `native-storage.ts`, y `native-storage.ts` pasa a importarlo. Así se reutiliza en `readCameraPhotoSince`.

### Web (sin dependencias nativas estáticas)

- **`features/mobile/camera-restore.ts`** (nuevo):
  - el esquema zod del marcador y los tipos;
  - `rememberCapture(target)` / `forgetCapture()`: con `isNativeApp()`, `import('@/lib/native-camera')`, y los errores se tragan;
  - `pendingCaptureCutoff(): Promise<number | null>`: el `openedAt` del marcador válido, o `null`, para la limpieza;
  - el almacén en memoria `offerRestoredCapture` / `useRestoredCapture`.

  ```ts
  export type CaptureTarget =
    | { kind: 'vehicle-photo'; vehicleId: string }
    | { kind: 'invoice'; vehicleId: string; recordId: string }
    | { kind: 'invoice-draft'; vehicleId: string; draft: MaintenanceFormInput; pendingCount: number };
  export const pendingCaptureSchema: z.ZodType<{ target: CaptureTarget; mode: 'server' | 'local'; openedAt: number }>;
  export interface RestoredCapture { target: CaptureTarget; file: File }
  /** Llama a `consume` una vez cuando hay una captura que cumple `match`, y la saca del almacén. */
  export function useRestoredCapture(match: (t: CaptureTarget) => boolean, consume: (c: RestoredCapture) => void): void;
  ```
- **`features/mobile/camera-restore-handler.tsx`** (nuevo): `CameraRestoreHandler`, que no pinta nada. Lleva una guarda de módulo para ejecutarse una vez por proceso (StrictMode monta dos veces) y hace esto:
  1. `readPendingCapture` y valida con el esquema.
  2. Comprueba el modo con `isLocalMode()`.
  3. Comprueba que el destino existe: `queryClient.fetchQuery(vehicleQuery)` y, para `invoice`, busca `recordId` en `maintenanceQuery`.
  4. `readCameraPhotoSince`, `offerRestoredCapture`, `navigate`.
  5. Si falla, `toast.error(t('camera.restoreFailed'))`.
  6. `clearPendingCapture` en un `finally`.
- **`routes/_app.tsx`**: `{isNativeApp() && <CameraRestoreHandler />}` junto a `DeviceNotificationsSync`.
- **`features/mobile/camera-photo-cleanup.ts`**: antes de `removeCameraPhotos`, `before = Math.min(startedAt, (await pendingCaptureCutoff()) ?? startedAt)`.
- **`components/camera-capture-button.tsx`**:
  - Prop nueva y opcional `restoreTarget?: () => CaptureTarget`. Es una función porque el borrador se lee en el momento del clic.
  - `onClick`: si `isNativeApp()` y hay `restoreTarget`, lanza `void rememberCapture(restoreTarget())` sin `await` (nunca rechaza) y llama a `input.click()` justo después, de forma síncrona y en el mismo gesto, para conservar la activación transitoria de usuario.
  - `onChange` y `cancel`: `forgetCapture()`.
- **`features/vehicles/photo-picker.tsx`**: pasa `restoreTarget={() => ({ kind: 'vehicle-photo', vehicleId })}` y llama a `useRestoredCapture(t => t.kind === 'vehicle-photo' && t.vehicleId === vehicle.id, c => onFile(c.file))`.
- **`features/maintenance/attachment-picker.tsx`**: pasa `restoreTarget` al `CameraCaptureButton`.
- **`features/maintenance/maintenance-attachments.tsx`**: `restoreTarget` de tipo `invoice` y consume con `onFiles([file])`.
- **`features/maintenance/maintenance-form.tsx`**:
  - En el alta, `restoreTarget` de tipo `invoice-draft` con `form.getValues()` y `pending.length`.
  - Prop nueva `restored?: { draft: MaintenanceFormInput; file: File; lostInvoices: boolean }`. Si viene, se usa `draft` como `defaultValues`, se inicia `pending` con `acceptFiles([file])` y se muestra el toast de R8 si `lostInvoices`.
- **`features/maintenance/maintenance-timeline.tsx`** (`MaintenanceSection`): `useRestoredCapture` con los destinos `invoice` e `invoice-draft` de este vehículo.
  - `invoice`: abre el diálogo de facturas de ese registro y le pasa la foto. `MaintenanceAttachmentsDialog` recibe una prop `restoredFile?: File`, que se consume al montar.
  - `invoice-draft`: abre el formulario con `restored`.
- **i18n `{es,en}.json`**:
  - `camera.restoreFailed`: «No se ha podido recuperar la foto de la cámara. Vuelve a hacerla.»
  - `camera.restoredLostInvoices`: «Hemos recuperado la foto, pero las otras facturas que habías añadido se han perdido. Vuelve a añadirlas.»

### Docs

`docs/mobile.md` se actualiza en dos sitios:
- En el apartado **Cámara**, se explica qué pasa si Android cierra la app con la cámara abierta.
- Se añade la sección «Probar en un dispositivo» con este procedimiento:
  - `adb install -r app-debug.apk`;
  - abrir «Hacer foto» en cada destino y, con la cámara delante, ejecutar `adb shell am kill com.ikrive.app` y comprobar con `adb shell pidof com.ikrive.app` que no queda proceso;
  - hacer la foto y aceptarla;
  - comprobar el resultado en la app y en `adb shell ls /sdcard/Android/data/com.ikrive.app/files/Pictures`, en los dos modos;
  - probar también el caso de cancelar con la app muerta, y `adb shell dumpsys activity exit-info com.ikrive.app` para diagnosticar.

Se añade el test correspondiente en `apps/mobile/test/docs.test.mjs`.

## BD, API y contrato HTTP

No cambian. La subida usa los endpoints de siempre: `PUT /vehicles/:id/photo` y `POST /vehicles/:id/maintenance/:recordId/attachments`, o su equivalente local.

## UI

No hay componentes nuevos. Solo cambian dos cosas:
- la navegación automática al destino;
- dos toasts nuevos (sonner), que se ven igual en claro, oscuro y móvil.

La web y la PWA no ven nada distinto: `restoreTarget` se ignora fuera de la app nativa y el handler no se monta (R14).

## Alternativas descartadas

- **`@capacitor/camera` (`getPhoto`) + `App.addListener('appRestoredResult')`.** Exige cambiar los tres sitios de «Hacer foto» del `<input capture>` a `Camera.getPhoto`, porque el `BridgeWebChromeClient` no guarda la llamada en `saveInstanceState` y `appRestoredResult` nunca devuelve un file chooser. Además:
  - Añade un plugin nativo (8.x, reescrito sobre las librerías de OutSystems con `takePhoto` y `getPhoto` obsoleto) cuya restauración tras SIGKILL no está verificada en esa versión.
  - Cambia el flujo de permisos: `CameraPermission`, el toast de `cancel` y sus tests sobrarían o se duplicarían.
  - Solo funciona si Android vuelve a entregar `onActivityResult` a la actividad recreada. Si el usuario vuelve desde el lanzador, no hay resultado.
  - Igualmente habría que guardar el destino (vehículo, registro, borrador), porque `appRestoredResult` solo trae la foto.

  El marcador cubre todo eso con algo que ya vimos en el dispositivo: la foto queda en `Pictures/`.
- **Plugin nativo propio** que guarde el `ValueCallback` o el `Uri` en `onSaveInstanceState`. Es Java que mantener a mano contra los internos de `BridgeWebChromeClient` y aporta lo mismo que el marcador.
- **Marcador en `localStorage` o en la URL.** El commit diferido del DOM storage lo pierde con un SIGKILL inmediato, y la URL no sobrevive porque Capacitor vuelve a cargar la URL de inicio.
- **Reducir memoria (`android:largeHeap`, bundle más pequeño).** **Fuera de alcance.** Los ~400 MB son sobre todo del renderer de Chromium. iAware mata con cualquier tamaño razonable cuando arranca la cámara en frío, así que habría que recuperar la foto de todos modos. `largeHeap` no afecta al proceso del WebView.

## Riesgos

- **Carrera de la escritura del marcador.** Como `input.click()` no espera a `writeFile`, si Android matara el proceso antes de que termine la escritura no habría marcador: la foto se perdería y la limpieza de #79 la borraría en el siguiente arranque, como hoy. La escritura tarda milisegundos frente al arranque en frío de la cámara, así que se acepta. Se comprueba en la prueba en dispositivo.
- **Foto duplicada.** Si el proceso muere entre `change` y el borrado del marcador, en el siguiente arranque se volvería a subir la misma foto. La ventana es de milisegundos y se acepta.
- **Cámara cancelada con la app muerta.** Queda un `JPEG_*` vacío (0 bytes) y no se puede distinguir de un fallo de la cámara: se muestra `camera.restoreFailed` (ver «Decisiones a validar»).
- **Galería.** El selector de la galería también puede matar el proceso, pero devuelve un `content://` que no está en nuestro disco. **Fuera de alcance.**

## Fuera de alcance

- Reducir el uso de memoria.
- Recuperar selecciones de la galería o de «Subir facturas».
- Recuperar las otras facturas pendientes del formulario de alta.
- Recuperar los cambios sin guardar del formulario del vehículo.
- iOS/PWA.

## Decisiones a validar (Gate 1)

1. **Mecanismo:** marcador + fichero de `Pictures/` en lugar de `@capacitor/camera` + `appRestoredResult`.
2. **Formulario de alta:** se restauran sus campos (el borrador va en el marcador). Las otras facturas pendientes se pierden con un toast (R8).
3. **Cámara cancelada con la app muerta:** muestra `camera.restoreFailed`. Es preferible un aviso de más a fallar en silencio.
4. **Sesión caducada:** la recuperación espera al primer montaje de `/_app` en ese proceso, es decir, tras el login. Si no se entra, el marcador y la foto esperan al siguiente arranque.
5. **Marcador:** no caduca. Se borra en el primer intento, salga bien o mal, y la foto se borra en el arranque siguiente.
6. **Escritura del marcador sin esperar:** `input.click()` se llama de forma síncrona en el mismo clic, sin `await` de la escritura, para no perder la activación de usuario. Se acepta la carrera residual (proceso muerto antes de terminar la escritura → foto perdida y limpiada después).
