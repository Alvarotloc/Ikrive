# Implementación #94 `slow-and-flaky-tests` (`sdd: false`)

Solo tests, helpers de test y `CONTRIBUTING.md`. **No se ha tocado código de producción.** Ningún timeout subido.

## 1. Test lento del zip (`packages/shared/src/data-export-zip.test.ts`)

### Medición previa (copia instrumentada del test, `performance.now()` por fase)

| Fase | ms |
|---|---|
| Bucle que genera el fichero de 1 MB + 3 | 2,5 |
| Zip con `addFile` | 4,9 |
| Zip con `openFile` por trozos | 2,7 |
| `concat` de los dos zips | 0,8 |
| `expect(concat(pieces)).toEqual(concat(whole))` | **1728** |
| `readEntries` (descomprimir) | 8,7 |
| `expect(entries.get(pdf)).toEqual(pdf)` | **1602** |
| (comparación con `Buffer.equals`, como referencia) | 1,0 |

**Causa:** `toEqual` recorre un `Uint8Array` como un objeto genérico, elemento a elemento (~1,6 s por MB). El bucle de generación no influye (2,5 ms). Test completo: **3413 ms** en local.

### Corrección

- Helper `expectSameBytes(actual, expected)` en `packages/shared/src/test/bytes.ts`: compara en un bucle simple (milisegundos por MB). Si falla, informa de las dos longitudes y del primer offset distinto (`{ length, firstDifference }`) en vez de un diff de millones de elementos. Admite `undefined` y falla con él.
- El test usa `expectSameBytes` en las dos comparaciones de ~1 MB. Lo que comprueba se mantiene igual: los bytes del zip son idénticos entre `openFile` por trozos y `addFile` (4 trozos de 256 KiB + un trozo final parcial de 3 bytes), el contenido descomprimido coincide y la entrada vacía sigue igual (`toEqual(empty)`, que es barato).
- Tests del helper en `packages/shared/src/test/bytes.test.ts`: iguales, offset distinto, longitud distinta con prefijo común, `undefined` y 4 MB en menos de 500 ms.

**Después:** **3413 ms → 25–28 ms** (20 ejecuciones aisladas) y 69–124 ms con las tres suites en paralelo saturando la CPU.

### El mismo patrón en la vecindad

He buscado tests con buffers de ≥1 MB comparados con `toEqual` en shared, API y web, y he medido la duración de todos los tests:

| Test | Antes | Después |
|---|---|---|
| `apps/web/src/lib/data-source/local/local-export.test.ts` › «writes the same zip as one built from whole files» (zip de ~2 MB) | 3884 ms | 81 ms |
| `apps/web/src/lib/native-export.test.ts` › «appends each chunk in base64 slices of at most 512 KiB» (1,2 MB) | 2141 ms | 83 ms |

Ambos estaban también a menos de un factor 2 del timeout de 5 s. Usan el mismo helper, copiado en `apps/web/src/test/bytes.ts` (con su `bytes.test.ts`), porque `@ikrive/shared` no exporta helpers de test y añadirlo a sus `exports` sería tocar la configuración del paquete. El resto de `toEqual` sobre bytes son de pocos KB (≤ 35 ms). En la API, el test más lento (`data-dir.test.ts`, 3,6 s) lanza un proceso hijo con `spawnSync`, no compara bytes: es otro problema y queda fuera del alcance.

## 2. Test intermitente de la cámara (`apps/web/src/features/mobile/camera-restore-handler.test.tsx`)

### Reproducción y medición

- En solitario, el primer test dura ~390 ms y el equivalente que corre más tarde («forgets the pending capture after restoring it», misma cadena) dura 43 ms: hay un coste de arranque en frío.
- Para reproducir la carga de `pnpm harness --full` (`pnpm -r test` lanza shared, API y web a la vez, cada uno con sus workers, en 28 CPUs) he ejecutado la suite web completa con la de API y la de shared en paralelo: 13/13 ejecuciones en verde, pero el primer test tardaba entre 1,8 y 3,3 s. El fallo es raro: no se ha reproducido, así que he medido el margen.
- Con una copia instrumentada (marcas de tiempo en cada petición mockeada, en `readPendingCapture`/`readCameraPhotoSince`, en el `onResolved` del router y en la aparición del toast) y bajo esa misma carga, **el tiempo entre que `renderApp` vuelve y aparece «Foto actualizada» fue de 449, 541, 930, 903 y 807 ms**, con un límite de 1000 ms en `findByText`. En solitario son ~165 ms.

### Causa

El único `findByText` del test no espera a un paso, sino a todo el arranque de la app más la cadena de restauración. `renderApp` volvía nada más llamar a `render`; el router resuelve después y de forma asíncrona (`beforeLoad` con `/me` y loaders), así que todo el primer render quedaba dentro de esa ventana de 1 s:

1. el primer render del layout y del dashboard en un worker frío (unos 70 ms en solitario frente a 12 ms en caliente; 180–350 ms bajo carga);
2. restauración → `navigate` → render de la página de edición → subida → toast.

Un perfil de CPU de esa ventana (`node:inspector` desde el propio test) muestra costes de arranque en frío ajenos a lo que se prueba:
- `Toaster` de Sonner llama a `getComputedStyle(document.documentElement)` (`getDocumentDirection`), y en jsdom la primera llamada procesa los ~15 KB de CSS que Sonner inyecta: 29 ms en frío y 0,1 ms después;
- los primeros `Intl.NumberFormat`/`DateTimeFormat` de `useFormat` (12 ms);
- la compilación JIT de React y de los componentes en su primer render.

Bajo carga, todo eso se multiplica entre 3 y 6 veces y la ventana roza (y alguna vez supera) el segundo. No es un problema de orden de mocks, timers ni estado compartido: los mocks nativos se limpian en `afterEach` y `forgetRestoreRun()` reinicia el estado del módulo. Mockear `@/lib/native-back-button` (importación dinámica real sin mock) solo ahorraba ~8 ms. Este es el mismo tipo de fallo que el de #46 (`settings-test-flake`), donde se resolvió la parte de los chunks y quedó dentro la del primer render.

### Corrección (helper común `apps/web/src/test/render-app.tsx`)

Afecta a todos los tests que usan `renderApp` (12 ficheros): su primer `findBy*` pagaba el arranque de la app. Por eso el arreglo va en el helper. `renderApp` se suscribe al evento `onRendered` del router antes de renderizar y no vuelve hasta que el router ha pintado la primera ubicación resuelta, después de guards y redirecciones. Espera con `getConfig().asyncWrapper` de Testing Library (el mismo envoltorio que usan los `findBy*`, fuera de `act`) y sin timeout propio, así que el límite es el del test (5 s). El JSDoc documenta la causa y la única limitación: si la primera navegación no termina nunca (un loader retenido a propósito), hay que montar el router a mano. Ningún test actual lo hace.

**Después** (misma instrumentación y la misma carga): **ventana `renderApp` → toast de 121, 126, 135, 175, 177 y 213 ms** (antes 449–930 ms). El margen frente al timeout de 1 s pasa de ~1,1× a ~5×. En solitario baja de ~165 a ~35 ms. La duración total del primer test no cambia (~380 ms en solitario), porque el arranque sigue ocurriendo, pero ahora fuera de la ventana del `findBy*`.

Comprobaciones: los 92 tests que usan `renderApp` pasan; los avisos `act(...)` en esos ficheros son 0 antes y 0 después; ningún test con `renderApp` usa temporizadores falsos salvo `Date` (`local-mode.test.tsx`), que no afecta al `setTimeout(0)` del `asyncWrapper`.

## 3. Evidencia de las 20 ejecuciones

**Aisladas** (cada fichero por separado, 20 veces seguidas):

```
run  1: zip 7/7 (pieces test 26 ms) | camera 13/13 (1st test 384 ms)
run  2: zip 7/7 (pieces test 26 ms) | camera 13/13 (1st test 378 ms)
...
run 19: zip 7/7 (pieces test 26 ms) | camera 13/13 (1st test 380 ms)
run 20: zip 7/7 (pieces test 25 ms) | camera 13/13 (1st test 382 ms)
```
20/20 en las dos: zip 25–28 ms y cámara 13/13 en todas.

**Bajo carga** (suite web completa + shared + API en paralelo, como `pnpm -r test`, 20 veces seguidas):

```
run  1: web 720/720 camera 13/13 (1st test 1060 ms) | shared 279/279 zip 7/7 (pieces test 101 ms) | api rc=0 | fails=[]
run  2: web 720/720 camera 13/13 (1st test 2103 ms) | shared 279/279 zip 7/7 (pieces test 121 ms) | api rc=0 | fails=[]
...
run 16: web 720/720 camera 13/13 (1st test 3338 ms) | shared 279/279 zip 7/7 (pieces test 83 ms) | api rc=0 | fails=[]
...
run 20: web 720/720 camera 13/13 (1st test 1933 ms) | shared 279/279 zip 7/7 (pieces test 77 ms) | api rc=0 | fails=[]
```
20/20 sin ningún fallo en web, shared ni API. El zip, entre 69 y 124 ms. (La duración del primer test de la cámara incluye el arranque, que ya no consume el timeout del `findByText`.)

## 4. `pnpm harness --full`

```
[OK]    94 features: 84 done, 9 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #94 slow-and-flaky-tests (in_progress)
[OK]    Rama actual: feat/slow-and-flaky-tests
[OK]    pnpm lint
[OK]    pnpm typecheck
e2e 6, shared 279, db 3, web 720, api 373 tests en verde
[OK]    pnpm test
[OK]    Arnés en verde.
```

## Cambios por archivo

- `packages/shared/src/test/bytes.ts` (nuevo): `expectSameBytes`.
- `packages/shared/src/test/bytes.test.ts` (nuevo): 5 tests del helper.
- `packages/shared/src/data-export-zip.test.ts`: las dos comparaciones de ~1 MB pasan a `expectSameBytes`.
- `apps/web/src/test/bytes.ts` y `apps/web/src/test/bytes.test.ts` (nuevos): el mismo helper y sus tests en la web.
- `apps/web/src/lib/data-source/local/local-export.test.ts` y `apps/web/src/lib/native-export.test.ts`: `expectSameBytes` en la comparación grande.
- `apps/web/src/test/render-app.tsx`: espera el primer `onRendered` del router antes de volver; JSDoc con la causa.
- `CONTRIBUTING.md`: la línea de `renderApp` explica la espera, y hay una nueva sobre `expectSameBytes`.
- `progress/current.md`: bitácora.

## Trazabilidad (acceptance → evidencia)

| Acceptance | Evidencia |
|---|---|
| El zip conserva lo que comprueba y baja de 500 ms sin subir el timeout | `data-export-zip.test.ts` › «streams the same bytes for a file pushed in pieces as with addFile»: 25–28 ms; `bytes.test.ts` |
| Causa del flake identificada y corregida sin subir timeouts | §2 (mediciones bajo carga y perfil de CPU); `render-app.tsx` |
| Arreglo en el helper común si el patrón afecta a otros | `renderApp` (12 ficheros); `expectSameBytes` (3 tests) |
| 20 ejecuciones seguidas de ambos ficheros | §3: 20/20 aisladas y 20/20 bajo carga |
| `pnpm harness --full` en verde | §4 |

## Desviaciones y notas

- Además del test pedido, he corregido otros dos tests lentos con el mismo patrón (`local-export`, `native-export`), como pedía la tarea al revisar la vecindad.
- El helper de bytes está duplicado en shared y en web; el motivo se explica en §1.
- Riesgo residual de `renderApp`: un test futuro que retenga la primera navegación se quedaría colgado hasta el timeout de 5 s del test (documentado en el JSDoc y en `CONTRIBUTING.md`).
- Sin tocar: `findBy*` sigue llamando a `prettyDOM` en cada intento fallido (unos 15 ms en la ventana medida). Es un coste general de Testing Library y no es la causa del flake.
- Fuera de alcance, para el backlog si interesa: `apps/api` › `data-dir.test.ts` tarda 3,6 s (lanza un proceso con `spawnSync` y timeout propio de 30 s).
