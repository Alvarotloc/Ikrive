# Review — #72 local-missing-file-404

**Veredicto:** APPROVED

`sdd: false`: sin `specs/`. La revisión se hace contra `description` y `acceptance` de `feature_list.json`, `CONTRIBUTING.md`, `docs/sdd.md` (línea 26: `sdd: false` pasa de `pending` a `in_progress` y mantiene rama, reviewer y Gate 2) y `CHECKPOINTS.md`.

## Trazabilidad acceptance ↔ tests

- A1 (404 para foto, original y miniatura si la fila existe y falta el fichero): [x] `apps/web/src/lib/data-source/local/local-files.test.ts` › `files.get rejects with 404 when the row exists but its file is gone`. Borra todos los ficheros del almacén, comprueba que la fila del adjunto sigue en BD y que las tres URLs (`photoUrl`, `url`, `thumbnailUrl`) rechazan con `ApiError` y Problem `{about:blank, Not Found, 404, 'File not found'}`. También comprueba que no se pide ninguna miniatura (`images.requested` vacío).
- A2 (`LocalFileStore` distingue «fichero inexistente» en el dispositivo y en memoria): [x]
  - Dispositivo: `apps/web/src/lib/native-storage.test.ts` › `tells a missing file apart from other read errors`. Comprueba `instanceof MissingFileError` y `key`.
  - Memoria: `apps/web/src/test/memory-file-store.ts:35` lanza `MissingFileError`. El test de A1 solo pasa con ese cambio, porque un `Error` genérico se relanzaría y `problemOf` fallaría.
- A3 (los demás errores se relanzan tal cual): [x]
  - Dispositivo: en el mismo test, `rejects.toBe(denied)` comprueba que es el mismo objeto.
  - DataSource: en el test de A1, con `failOn.add('read')` las tres URLs rechazan con `Error('File store read failed')` y no con `ApiError`.
- A4 (tests con el almacén en memoria sin el fichero cubren los tres casos): [x] el test de A1 recorre las tres URLs.
- A5 (`pnpm harness --full` en verde): [x] lo he ejecutado: web 544, api 368, todo OK. Termina con «Arnés en verde».

## Detección de «fichero inexistente» en @capacitor/filesystem 8.1.5

He verificado el código real del plugin instalado (`node_modules/.pnpm/@capacitor+filesystem@8.1.5_…`) y de su librería nativa:

- **Android** (la única plataforma del proyecto: `apps/mobile` solo tiene `android/`). `FilesystemPlugin.readFile` llama a `controller.readFile(...).onFailure { call.sendError(it.toFilesystemError(...)) }`. He desensamblado `ionfilesystem-android-1.1.1.aar` (en la caché de Gradle): `IONFILELocalFilesHelper$readFile$2` comprueba `File.exists()` y, si es falso, lanza `IONFILEExceptions.DoesNotExist`. `FilesystemErrors.doesNotExist` lo convierte en código `OS-PLUG-FILE-0008` y mensaje `'readFile' failed because file at '<path>' does not exist.`. `/does not exist/i` lo detecta.
- **iOS** (no hay plataforma iOS en el proyecto): `FilesystemError.fileNotFound` da el mismo texto «… does not exist.» con código 0008.
- **Web**: `throw Error('File does not exist.')`.
- Otros errores (permiso `OS-PLUG-FILE-0007`, `operationFailed` 0013, ruta no válida…) no contienen «does not exist», así que se relanzan sin tocar (`native-storage.ts:39-43`).

## Tasks

- No aplica (`sdd: false`, sin `tasks.md`). El plan de `progress/current.md` (pasos 1–3) está cumplido.

## Checkpoints

- C1: [x] arnés en verde, una sola feature activa (#72 `in_progress`), rama `feat/local-missing-file-404`.
- C2: [x] no aplica por `sdd: false` (`docs/sdd.md:26`). Cada `acceptance` tiene un test concreto, abierto y leído (ver arriba).
- C3: [x] el diff solo toca `local/files.ts`, `local/files-get.ts`, `native-storage.ts`, el almacén en memoria de los tests, dos ficheros de test, `feature_list.json` (estado) y `progress/`. No hay refactors ajenos. `files.read` solo se usa en `files-get.ts`.
- C4: [x] el error sale como Problem RFC 7807 (`notFound` de `local/problems.ts`), igual que el resto de 404 de la DataSource local. No hay cambios de BD ni textos de UI nuevos, así que no hacen falta claves i18n.
- C5: [x] TypeScript estricto, sin `any` ni `@ts-ignore`, sin `console.log`. Las claves de fichero siguen siendo aleatorias.
- C6: [x] `pnpm harness --full` en verde. Los tests usan SQLite en memoria real; los únicos dobles son el almacén y el plugin. No hay UI nueva, así que no hacen falta capturas.
- C7: [x] `progress/impl_local-missing-file-404.md` tiene los archivos, el mapa acceptance → test y la salida del arnés. `progress/current.md` está actualizado. `docs/PLAN.md` no necesita cambios porque no cierra fase ni cambia decisiones.

## Hallazgos

Ninguno bloqueante.

## Avisos para el humano (no bloquean)

1. `native-storage.test.ts` simula el rechazo con `'File does not exist'` (el texto de la implementación web). El mensaje real en Android es `'readFile' failed because file at '…' does not exist.` (código `OS-PLUG-FILE-0008`). La regex cubre los dos textos. Sería más robusto comprobar también `code === 'OS-PLUG-FILE-0008'` o usar el mensaje real de Android en el test, pero `remove` ya usa la misma heurística.
2. Conviene incluir en la checklist manual del dispositivo lo que propone el implementer: borrar un fichero de `uploads/…` y abrir la foto o el adjunto para comprobar que la UI muestra el error de «no encontrado».

## Cambios requeridos

Ninguno.
