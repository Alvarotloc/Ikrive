# Review — #71 api-photo-avif

**Veredicto:** APPROVED

Feature `sdd: false`: se valida contra `description` y `acceptance` de `feature_list.json`, `CONTRIBUTING.md`, `docs/` y `CHECKPOINTS.md`. No hay `specs/api-photo-avif/` (C2 se aplica como trazabilidad acceptance ↔ test).

## Trazabilidad acceptance ↔ tests
- A1 (AVIF real → WebP): [x] `apps/api/test/vehicles.test.ts` › `accepts an AVIF photo and rejects a HEIC one with 400`. Genera el AVIF con `sharp().avif()`, comprueba que sharp lo describe como `heif`/`av1`, sube por `PUT /api/vehicles/:id/photo`, espera 200, descarga la foto y comprueba `content-type: image/webp` y que su metadata es `webp` 64×32.
- A2 (HEIC → 400): [x] De dos formas. (a) El mismo test end-to-end sube un AVIF reetiquetado como HEIC (`heic`/`hvc1`), espera 400 con el texto exacto y comprueba que la foto guardada no cambia. (b) `accepts HEIF only when it is AVIF (av1)` comprueba que `isSupportedPhoto({format:'heif', compression:'hevc'})` y `compression: undefined` devuelven `false`. Basta: el fichero reetiquetado falla ya en `metadata()` y no pasa por la rama `hevc`, pero esa rama es exactamente la función que usa `toWebpPhoto`, y el unit test la cubre. No se puede generar un HEIC real en este entorno (no hay codificador HEVC). En local: `local-files.test.ts` › `rejects an unsupported photo with 400 and keeps the current one`, con HEIC incluido.
- A3 (el texto enumera exactamente los formatos aceptados, el mismo en local): [x] Hay una sola constante, `UNSUPPORTED_PHOTO_MESSAGE` (`packages/shared/src/domain/files.ts`), que usan `apps/api/src/lib/images.ts` y `apps/web/src/lib/data-source/local/vehicles.ts`. El texto literal se comprueba en el test de la API y en `local-files.test.ts`. La lista (JPEG, PNG, WebP, AVIF, GIF, TIFF) coincide con lo que acepta `isSupportedPhoto`.
- A4 (test en apps/api con AVIF generado con sharp): [x] el mismo que A1.
- A5 (harness): [x] `pnpm harness --full` en verde, ejecutado por mí (shared, db, web 662, api 373, e2e).

## Sobre la extensión del modo local
Es correcta y coherente. La decisión 1 de `specs/mobile-local-files/design.md` fija que el modo local detecta «los mismos formatos que la API acepta de verdad». Si la API acepta AVIF y local no, A3 (mismo texto, que menciona AVIF) sería falso en local. He comprobado en el scratchpad que un AVIF real generado con el sharp empaquetado (con pérdida y sin pérdida) lo detecta `detectPhotoFormat` como `'avif'`. `isAvif` respeta el tamaño de la caja `ftyp` y salta la versión menor. Un HEIC (`heic`/`mif1`) devuelve `null`. Si el WebView no decodifica AVIF, el resultado es el mismo 400 (`toWebpPhoto().catch`).

## Tasks
- No aplica (`sdd: false`, sin `tasks.md`). El plan de `progress/current.md` está completo.

## Checkpoints
- C1: [x] harness en verde, una sola feature activa (#71), rama `feat/api-photo-avif`.
- C2: [x] no aplica spec (`sdd: false`). Cada acceptance tiene un test abierto y leído (ver arriba).
- C3: [x] el diff se limita a `images.ts`, a la constante y la detección compartidas, al modo local de fotos y a sus tests. No hay refactors ajenos.
- C4: [x] la lógica de detección es pura y está en `packages/shared` con tests unitarios. El 400 sale como `BadRequestError` (RFC 7807). No hay cambios de BD, de rutas ni de UI.
- C5: [x] sin `any`, `@ts-ignore`, `console.log` ni TODOs. Las fotos se siguen guardando con nombre aleatorio (`.webp`).
- C6: [x] harness en verde, aserciones concretas, SQLite en memoria vía `createTestApp`. Sin UI, así que no hacen falta capturas.
- C7: [x] `progress/impl_api-photo-avif.md` tiene archivos, mapa acceptance → test y la salida de la verificación. `progress/current.md` está actualizado. `docs/PLAN.md` no menciona AVIF y no cambia ninguna decisión.

## Hallazgos
Ninguno bloqueante.

## Avisos para el humano (no bloquean)
- `specs/mobile-local-files/design.md` (decisión 1 y «Fuera de alcance»), `requirements.md:44` y `tasks.md` T2 siguen diciendo que local rechaza AVIF. Son specs cerrados y quedan como histórico. El leader puede añadir una nota que remita a #71.
- `isAvif` (`packages/shared/src/domain/files.ts`) no trata una caja `ftyp` con tamaño 0 («hasta el final») ni 1 (`largesize`): devolvería `null` y daría 400 en local. En `ftyp` no ocurre en la práctica.
- El HEIC end-to-end es sintético. Con un HEIC real, el sharp empaquetado probablemente lea la cabecera como `heif`/`hevc` y lo rechace por `isSupportedPhoto`, que tiene su unit test. Si alguna vez se dispone de un HEIC real, convendría añadirlo como fixture.

## Cambios requeridos
Ninguno.
