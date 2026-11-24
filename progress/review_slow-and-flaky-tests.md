# Review — #94 slow-and-flaky-tests

**Veredicto:** APPROVED

Feature `"sdd": false`, sin spec: el criterio son los `acceptance` de `feature_list.json`, `CONTRIBUTING.md` y `CHECKPOINTS.md`. Cambios sin commitear en `feat/slow-and-flaky-tests` (diff + ficheros sin trackear leídos enteros).

## Trazabilidad acceptance ↔ evidencia

- A1 (zip conserva lo que comprueba, < 500 ms, sin subir timeout): [x] `packages/shared/src/data-export-zip.test.ts:139` › `streams the same bytes for a file pushed in pieces as with addFile`. Sigue generando 1 MB + 3 bytes, empujando 4 trozos de 256 KiB más un trozo final parcial de 3 bytes, comparando el zip completo por trozos con el de `addFile`, el contenido descomprimido y la entrada vacía (`toEqual(empty)`). Sin timeout propio. Medido por mí: 26 ms.
- A2 (causa del flake identificada y corregida sin subir timeouts): [x] `progress/impl_slow-and-flaky-tests.md` §2 y `apps/web/src/test/render-app.tsx`. No se toca ningún timeout.
- A3 (arreglo en el helper común): [x] `renderApp` (helper común de los tests con el router) y `expectSameBytes` (3 tests).
- A4 (20 ejecuciones seguidas): [x] §3 del informe: 20/20 aisladas y 20/20 con las tres suites en paralelo.
- A5 (`pnpm harness --full` en verde): [x] lo he ejecutado yo: lint, typecheck y test en verde (web 720, api 373, shared 279).

## Tasks
- N/A (`sdd: false`, sin `tasks.md`).

## Checkpoints
- C1: [x] arnés en verde, una sola feature activa (#94 `in_progress`), rama `feat/slow-and-flaky-tests`.
- C2: [x] N/A por `sdd: false`. Los acceptance tienen su evidencia (ver arriba).
- C3: [x] El diff toca solo tests, helpers de test, `CONTRIBUTING.md` y `progress/`. No hay código de producción. Los dos tests extra (`local-export`, `native-export`) tienen el mismo patrón y caben en A3.
- C4: [x] N/A en API/BD/UI. La documentación de `CONTRIBUTING.md` está actualizada (línea de `renderApp` y una nueva de `expectSameBytes`).
- C5: [x] Sin `any`, `@ts-ignore`, `console.log` ni TODOs.
- C6: [x] harness `--full` en verde. Los tests nuevos del helper afirman resultados concretos (offset y longitud en el mensaje). Sin UI, así que no hacen falta capturas.
- C7: [x] El informe existe con los ficheros, la evidencia por acceptance y la salida de la verificación. `progress/current.md` está al día y `docs/PLAN.md` no necesita cambios.

## Hallazgos

Los cuatro puntos que pedía revisar:

1. **`expectSameBytes` no debilita las aserciones** (`packages/shared/src/test/bytes.ts`, idéntico a `apps/web/src/test/bytes.ts`).
   - Con `undefined`, `toBeInstanceOf(Uint8Array)` falla. Lo cubre el test `fails without bytes`.
   - `firstDifference` recorre hasta `max(len)`, así que un prefijo común con distinta longitud también da diferencia (`undefined !== n`). Además, la longitud se compara de forma explícita.
   - Un byte distinto deja un offset `≠ -1`.
   - Los tres casos tienen test en `bytes.test.ts` y comprueban el mensaje `{ length, firstDifference }`.
   - Frente a `toEqual`, no se pierde nada relevante: `toEqual` tampoco distinguía subclases (`Buffer` frente a `Uint8Array`).
   - Siguen cubiertos los varios trozos, el trozo final parcial y la entrada vacía (A1).
2. **`renderApp` esperando el primer `onRendered` es correcto.** Lo he contrastado con `@tanstack/react-router@1.170.44`:
   - `load-client.js` emite `onRendered` al confirmar la transacción vigente (`router._tx === tx`), también cuando hay `errorComponent`/`notFound`.
   - Si hay redirección, la primera transacción queda sustituida y el evento llega con la página de destino. Así que no se cuelga con redirecciones ni con errores en `beforeLoad` o en los loaders (`route-error.test.tsx` con `/me` 500, `login-page`, `admin-route`). Además, la suscripción se hace antes de `render`, así que no hay carrera.
   - He revisado los 12 ficheros que usan `renderApp` (el informe dice 14: ver avisos) buscando promesas retenidas, `pending` y spinners. Las retenidas (`server-screen` `GET /health`, `back-button-handler`, `local-reminders-refresh`, el `reportPdf.gate` de `local-mode`) se liberan después de la primera navegación, por interacción del usuario. Ningún test comprobaba un estado intermedio de la carga inicial del router.
   - Los fallos no se ocultan: los errores de ruta siguen renderizándose y una petición sin mock sigue fallando el test.
   - `asyncWrapper` es el mismo envoltorio que usan los `findBy*`.
3. **Causa del flake razonablemente demostrada.**
   - No se reprodujo el fallo, pero se midió la ventana real entre el render y el toast bajo la carga de `pnpm -r test`: 449–930 ms frente al límite de 1000 ms. Hay un perfil de CPU que atribuye el coste al arranque en frío (CSS de Sonner en jsdom, `Intl`, JIT).
   - Después del arreglo, la ventana es de 121–213 ms.
   - No se sube ningún timeout. El primer test sigue tardando lo mismo en total: el arranque solo sale de la ventana del `findBy*`, que es lo que se pretendía.
4. **La duplicación del helper es aceptable.** Son unas 20 líneas idénticas, con sus tests en ambos sitios, y `CONTRIBUTING.md` documenta las dos rutas. Compartirlo obligaría a añadir una entrada de test a los `exports` de `@ikrive/shared`, que hoy solo publica código de producción.

No encuentro defectos que bloqueen.

## Avisos para el humano (no bloquean)
- ~~El informe dice «14 ficheros» que usan `renderApp`, pero son 12.~~ Corregido en el informe antes del merge.
- Riesgo residual documentado: si la primera navegación no termina nunca, o un render lanza fuera de los límites de error del router, `renderApp` espera hasta el timeout de 5 s del test en vez de fallar enseguida. El error sigue saliendo como no capturado, pero el diagnóstico es más lento. Está documentado en el JSDoc y en `CONTRIBUTING.md`.
- `bytes.test.ts` › `compares a few MB in well under a second` afirma `< 500 ms` sobre un tiempo real (9 ms medidos). El margen es amplio, pero es un test de rendimiento con reloj real.
- Si más adelante aparece un tercer consumidor del helper de bytes, convendría plantearse exportarlo desde `@ikrive/shared` (por ejemplo, `./test/bytes`).
- Fuera de alcance, para el backlog: `apps/api` › `data-dir.test.ts` tarda unos 3,6 s. Añadido como #95 `slow-data-dir-test`.

## Cambios requeridos
- Ninguno.
