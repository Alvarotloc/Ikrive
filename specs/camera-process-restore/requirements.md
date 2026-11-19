# Requirements — camera-process-restore

> Feature 81 (fase 8). En el HONOR de la prueba de #79, Android mata el proceso de la app (y el del WebView) en cuanto se abre la cámara. Al volver arranca un proceso nuevo, el `<input capture>` ya no recibe la foto y la limpieza de #79 la borra en el siguiente arranque.
> Fuentes: `progress/explore_camera-process-restore_web.md`, `progress/explore_camera-process-restore_native.md`.
> Términos:
> - **Marcador:** el JSON `{ target, mode, openedAt }` que la app nativa guarda en `Directory.Data` antes de abrir la cámara.
> - **Destino** (`target`): una de estas tres cosas:
>   - `vehicle-photo`: la foto del vehículo en `/vehicles/$id/edit`;
>   - `invoice`: el diálogo de facturas de un mantenimiento que ya existe;
>   - `invoice-draft`: el formulario de alta de un mantenimiento, con los valores que tenía el formulario y cuántas facturas pendientes había.
> - **Foto de la cámara:** un fichero `JPEG_*.jpg` de `Pictures` (`CAMERA_PHOTO_NAME`, #79) con tamaño > 0 y `mtime` igual o posterior a `openedAt` redondeado hacia abajo al segundo. Si hay varios, cuenta el más reciente.
> - **Recuperación:** lo que hace la app la primera vez que monta el layout autenticado (`/_app`) en un proceso nuevo y encuentra un marcador.

## Antes de abrir la cámara

## R1
CUANDO el usuario pulsa «Hacer foto» en la app nativa y el botón tiene un destino, el sistema DEBE empezar a guardar el marcador con ese destino, el modo actual (`server`/`local`) y `openedAt` en el mismo gesto en que abre el input de la cámara, sin esperar a que termine la escritura.

## R2
CUANDO el input de la cámara de la app nativa emite `change` o `cancel`, el sistema DEBE borrar el marcador.

## R3
SI no se puede guardar el marcador ENTONCES el sistema DEBE haber abierto la cámara igualmente, igual que antes de esta feature (la escritura fallida no la bloquea ni la retrasa).

## Recuperación

## R4
CUANDO se monta el layout autenticado de la app nativa por primera vez en el proceso y hay un marcador, el sistema DEBE leer la foto de la cámara como un `File` `image/jpeg` con el nombre del fichero. Lo hace una sola vez por proceso.

## R5
CUANDO se recupera una foto con destino `vehicle-photo`, el sistema DEBE abrir `/vehicles/$vehicleId/edit` y subirla como foto del vehículo por el mismo camino que una foto recién hecha (`PhotoPicker`, toast «Foto guardada»).

## R6
CUANDO se recupera una foto con destino `invoice`, el sistema DEBE abrir la ficha del vehículo con el diálogo de facturas de ese mantenimiento y subirla como factura por el mismo camino que una foto recién hecha (`useAttachmentUpload`).

## R7
CUANDO se recupera una foto con destino `invoice-draft`, el sistema DEBE abrir la ficha del vehículo con el formulario de alta del mantenimiento, rellenarlo con los valores del marcador y poner la foto como factura pendiente, sin guardar nada hasta que el usuario pulse «Guardar».

## R8
CUANDO se recupera una foto con destino `invoice-draft` y el marcador indica que había otras facturas pendientes, el sistema DEBE avisar con un toast de que hay que volver a añadirlas.

## R9
MIENTRAS la app está en modo local, el sistema DEBE guardar la foto recuperada en el dispositivo a través del `DataSource` local, como foto del vehículo o como factura.

## R10
SI hay un marcador y la foto no se puede recuperar ENTONCES el sistema DEBE mostrar el toast `camera.restoreFailed` sin navegar. Los casos son:
- el marcador no es válido;
- no hay foto de la cámara o no se puede leer;
- el modo del marcador no es el actual;
- el vehículo o el mantenimiento ya no existen.

## R11
CUANDO termina un intento de recuperación, haya salido bien o mal, el sistema DEBE borrar el marcador.

## Limpieza de #79

## R12
MIENTRAS haya un marcador válido, la limpieza del arranque (`cleanUpCameraPhotos`) NO DEBE borrar las fotos con `mtime` igual o posterior a su `openedAt` redondeado hacia abajo al segundo.

## R13
CUANDO la app arranca sin marcador, la limpieza DEBE borrar, como cualquier otra foto de una ejecución anterior, la foto recuperada en esa ejecución.

## Web y documentación

## R14
En la web y en la PWA, el sistema NO DEBE guardar marcadores, recuperar fotos ni cargar módulos nativos: «Hacer foto» abre la cámara sin hacer nada más.

## R15
El sistema DEBE documentar en `docs/mobile.md` la recuperación de la foto y la prueba en dispositivo con `adb shell am kill` mientras la cámara está abierta.

## Trazabilidad acceptance → requirements

| Acceptance (`feature_list.json`) | Requirements |
|---|---|
| Si el sistema mata el proceso con la cámara abierta, al volver la foto llega al mismo sitio (foto del vehículo o factura) y se puede guardar, en modo servidor y local | R1, R2, R3, R4, R5, R6, R7, R8, R9, R11 |
| Si no se puede recuperar la foto, toast en lugar de fallar en silencio | R10 |
| La limpieza de #79 no borra la foto pendiente | R12, R13 |
| En la web y la PWA no cambia nada | R14 |
| Tests de la restauración con el plugin simulado y prueba en dispositivo con `adb shell am kill` | R4–R10 (tests), R15 |
| `pnpm harness --full` en verde | todas (T última) |
