# Implementación: #71 api-photo-avif (`sdd: false`)

## Comprobación previa

El sharp empaquetado (0.35.5, libvips 8.18.7, libheif 1.23.5, aom 3.15.1) **sí decodifica AVIF**: un AVIF generado con `sharp().avif()` da `metadata()` = `{ format: 'heif', compression: 'av1' }` y se recodifica a WebP sin error. No incluye codificador HEVC (`heif({ compression: 'hevc' })` → `heifsave: Unsupported compression`), ni hay `heif-enc`/`ffmpeg` y el `magick` del sistema no tiene delegado HEIC, así que no se puede generar un HEIC real. Decisión: **aceptar AVIF** (heif + av1) y rechazar cualquier otro heif.

## Cambios por archivo

- `packages/shared/src/domain/files.ts`
  - `UNSUPPORTED_PHOTO_MESSAGE` = `The file is not a supported image (JPEG, PNG, WebP, AVIF, GIF or TIFF)`, compartido por API y modo local.
  - `PhotoFormat` incluye `'avif'`; `detectPhotoFormat` detecta AVIF: caja `ftyp` en el offset 4 cuya marca principal o compatibles (dentro del tamaño de la caja, saltando la versión menor) sean `avif`/`avis`. HEIC (`heic`/`mif1` sin `avif`) sigue devolviendo `null`.
- `packages/shared/src/domain/files.test.ts`: AVIF (marca principal), AVIF por marca compatible (`mif1` + `avif`), `avis`, y `null` para HEIC, `avif` fuera de la caja `ftyp` y `ftypavif` sin cabecera de tamaño.
- `apps/api/src/lib/images.ts`: quitado `avif` de `SUPPORTED_FORMATS` (sharp nunca lo reporta así); nueva `isSupportedPhoto({ format, compression })` exportada: `heif` solo si `compression === 'av1'`, el resto contra `SUPPORTED_FORMATS`. `toWebpPhoto` la usa y lanza el 400 con `UNSUPPORTED_PHOTO_MESSAGE`.
- `apps/api/test/vehicles.test.ts`: dos tests nuevos (ver tabla).
- `apps/web/src/lib/data-source/local/vehicles.ts`: quitada la constante local duplicada; usa `UNSUPPORTED_PHOTO_MESSAGE` de `@ikrive/shared`.
- `apps/web/src/lib/data-source/local/local-files.test.ts`: test `accepts an AVIF photo`; HEIC añadido a los casos de `rejects an unsupported photo with 400 and keeps the current one` (mismo texto exacto).

## Trazabilidad (acceptance → test)

| Acceptance | Test |
|---|---|
| AVIF real subido a `PUT /api/vehicles/:id/photo` se guarda como WebP | `apps/api/test/vehicles.test.ts` › `accepts an AVIF photo and rejects a HEIC one with 400` |
| HEIC (heif sin av1) sigue con 400 | `apps/api/test/vehicles.test.ts` › `accepts HEIF only when it is AVIF (av1)` (rama `heif`/`hevc` de `isSupportedPhoto`) y › `accepts an AVIF photo and rejects a HEIC one with 400` (HEIC end-to-end); `packages/shared/src/domain/files.test.ts` › `detects the photo formats the API accepts`; `apps/web/src/lib/data-source/local/local-files.test.ts` › `rejects an unsupported photo with 400 and keeps the current one` |
| Texto del 400 enumera exactamente los aceptados y el modo local usa el mismo | Constante única `UNSUPPORTED_PHOTO_MESSAGE`; texto comprobado literal en `apps/api/test/vehicles.test.ts` › `accepts an AVIF photo and rejects a HEIC one with 400` y en `local-files.test.ts` › `rejects an unsupported photo with 400 and keeps the current one`; AVIF en local: `local-files.test.ts` › `accepts an AVIF photo` |
| Test en apps/api con AVIF generado con sharp | `apps/api/test/vehicles.test.ts` › `accepts an AVIF photo and rejects a HEIC one with 400` |
| `pnpm harness --full` en verde | ver abajo |

## `pnpm harness --full`

```
[OK]    80 features: 76 done, 3 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #71 api-photo-avif (in_progress)
[OK]    Rama actual: feat/api-photo-avif
[OK]    pnpm lint
[OK]    pnpm typecheck
e2e 6 · shared 185 · db 3 · web 662 · api 373 tests passed
[OK]    pnpm test
[OK]    Arnés en verde.
```

## Desviaciones y notas

- **HEIC del test end-to-end**: como no se puede generar un HEIC real, es el AVIF reetiquetado (`avif`→`heic`, `av01`→`hvc1`). libheif lo rechaza ya en `metadata()` (falta `hvcC`), así que recorre el camino del 400 por cabecera ilegible, no la rama `compression !== 'av1'`. Esa rama la cubre el test unitario de `isSupportedPhoto` con `{ format: 'heif', compression: 'hevc' }`.
- **Modo local acepta AVIF**: necesario para que el texto compartido sea cierto también en local. El diseño de #65 dice que local detecta "los mismos formatos que la API acepta de verdad", así que se amplía `detectPhotoFormat`. La decodificación real la hace el WebView (`createImageBitmap`); si un dispositivo no soporta AVIF, falla en `toWebpPhoto` y devuelve el mismo 400 (como ya pasa con TIFF).
- No se han tocado los specs cerrados de #65 (`specs/mobile-local-files/`), que dicen que AVIF se rechaza en local; quedan como registro histórico. Que el leader decida si hay que anotarlo.
- Sin UI nueva, así que no hay capturas.
