# Implementación: #72 `local-missing-file-404`

`sdd: false`: sin spec. Guía: los `acceptance` de `feature_list.json`, `specs/mobile-local-files/design.md` y el aviso 2 de `progress/review_mobile-local-files.md`.

## Cambios por archivo

- `apps/web/src/lib/data-source/local/files.ts`: nueva clase `MissingFileError` (`name = 'MissingFileError'`, guarda la `key`). Así un almacén indica «no hay fichero con esa clave» de forma distinta a cualquier otro fallo. Se documenta en `LocalFileStore.read` que rechaza con ella.
- `apps/web/src/lib/native-storage.ts`: `read` captura el error de `Filesystem.readFile`. Si es «does not exist» (el mismo `isMissingFile` que ya usaba `remove`), rechaza con `MissingFileError(key)`; si no, relanza el error original sin cambios.
- `apps/web/src/test/memory-file-store.ts`: `read` de una clave que no existe rechaza con `MissingFileError(key)` en vez de con un `Error` genérico. `failOn` sigue simulando los demás fallos.
- `apps/web/src/lib/data-source/local/files-get.ts`: nuevo helper `readStored(files, file)`, que traduce `MissingFileError` en `notFound('File not found')`, es decir, el Problem 404 `{ type: 'about:blank', title: 'Not Found', status: 404, detail: 'File not found' }`. Sirve para la foto, el original y la miniatura, porque los tres pasan por la misma lectura antes de hacer la miniatura. Cualquier otro error se relanza tal cual.
- `apps/web/src/lib/data-source/local/local-files.test.ts`: test nuevo `files.get rejects with 404 when the row exists but its file is gone`.
- `apps/web/src/lib/native-storage.test.ts`: test nuevo `tells a missing file apart from other read errors`.
- `progress/current.md`: línea en la bitácora.

## Trazabilidad acceptance → tests

| Acceptance | Test |
|---|---|
| 1. `files.get` da un Problem 404 si la fila existe y falta su fichero (foto, original, miniatura) | `local-files.test.ts` › `files.get rejects with 404 when the row exists but its file is gone`: se borran los ficheros del almacén y se dejan las filas. Las tres URLs dan `notFound('File not found')` y no se pide ninguna miniatura (`images.requested` vacío). |
| 2. `LocalFileStore` distingue «fichero inexistente» en el dispositivo y en memoria | Dispositivo: `native-storage.test.ts` › `tells a missing file apart from other read errors`, donde «File does not exist» da `MissingFileError` con su `key`. Memoria: lo cubre el test del punto 1, que solo pasa porque `memory-file-store.ts` lanza `MissingFileError`. |
| 3. Los demás errores se relanzan tal cual | Dispositivo: en el mismo test de `native-storage.test.ts`, «Permission denied» rechaza con el mismo objeto (`rejects.toBe(denied)`). DataSource: en el test del punto 1, con `store.failOn.add('read')` las tres URLs rechazan con `Error('File store read failed')`, que no es un `ApiError`. |
| 4. Tests con el almacén en memoria sin el fichero cubren los tres casos | `local-files.test.ts` › el test del punto 1 (foto, original y miniatura). |
| 5. `pnpm harness --full` en verde | Ver abajo. |

## `pnpm harness --full`

```
[OK]    74 features: 67 done, 6 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #72 local-missing-file-404 (in_progress)
[OK]    Rama actual: feat/local-missing-file-404
[OK]    pnpm lint
[OK]    pnpm typecheck
[OK]    pnpm test   (web 544, api 368, shared 169, db 3, mobile 27, e2e 6: todo en verde)
[OK]    Arnés en verde.
```

## Decisiones y desviaciones

- **Texto del 404:** `detail: 'File not found'`. La API no tiene un 404 equivalente: `storage.read` no comprueba si el fichero existe, y el export solo lo registra con `log.warn`. Por eso no había un texto que copiar. El formato sigue al resto de 404 de la DataSource local (`notFound(detail)`). No hay textos de UI nuevos: la UI sigue mostrando `viewerError`/`common.error` según el `status`.
- **Error tipado en vez de cambiar la firma:** `read` sigue devolviendo `Promise<Blob>` y rechaza con `MissingFileError`. Así no cambia ningún llamador, y #66 (export) podrá usar `instanceof MissingFileError` para saltarse los ficheros que faltan, como hace la API.
- **Detección en el dispositivo:** reutiliza la heurística del mensaje «does not exist» que ya usaba `remove`. Es el texto con el que `@capacitor/filesystem` rechaza en Android, iOS y web cuando el fichero no existe. No se ha probado en un dispositivo real; conviene incluirlo en la checklist manual (borrar `uploads/…` de una foto y abrir la ficha).
- No hay cambios de BD, de UI ni de dependencias. No hay capturas porque no hay UI nueva.
