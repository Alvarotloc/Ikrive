# Review — #28 web-test-isolation (`sdd: false`)

**Veredicto:** APPROVED

Sin spec: se revisa contra `description`/`acceptance` de la entrada 28 de `feature_list.json`, los avisos 2 y 3 de `progress/review_mobile-nav-menu.md`, `CONTRIBUTING.md` y `CHECKPOINTS.md`.

## Trazabilidad acceptance ↔ tests
- A1 (shim en `setup.ts` antes de importar la app; sin `vi.hoisted` en `app-navigation`): [x] `apps/web/src/test/setup.ts` asigna `globalThis.fetch = deferredFetch` y solo después hace `await import('@/i18n')`; las demás importaciones estáticas son librerías de test y `./unmocked-requests` (sin módulos de la app). `apps/web/src/test/setup.test.tsx` › `sends the auth client requests, captured on import, to the mockApi of the test` (llama a `authClient.signOut()`, comprueba `data`, `error === null`, la URL exacta pasada al `fetchMock` y que no queda ninguna petición sin mock). `app-navigation.test.tsx` ya no tiene `vi.hoisted` y su test de logout sigue en verde.
- A2 (petición sin respuesta → error con método y URL, sin red): [x] `setup.test.tsx` › `rejects a request made without mockApi…` y `rejects a request to a route mockApi does not declare…` (comprueban el mensaje exacto con método y URL y que queda registrado para que `afterEach` falle el test). `deferredFetch` nunca llama al `fetch` real.
- A3 (`scrollTo` stubeado, sin avisos): [x] `window.scrollTo = () => {}` en `setup.ts`. Verificado en mi ejecución de `pnpm harness --full`: 0 apariciones de `Not implemented` (y de `Unmocked request`). La falta de test automático está justificada en el informe (el aviso sale por la `VirtualConsole` de jsdom).
- A4 (ningún test cambia lo que comprueba): [x] Revisados los 6 tests de 3 ficheros: solo se añaden rutas incidentales (`GET /config`, `GET /vehicles/v1/schedules`, `GET /settings`) con los mismos cuerpos que ya usan los tests vecinos; no se toca ningún `expect`. En `odometer-form.test.tsx` el aserto «ningún POST» y la búsqueda del POST 409 siguen intactos. Ningún test dependía de la red real (documentado).
- A5 (`pnpm harness --full` verde): [x] ejecutado por mí, exit 0 (shared 75, api 194, web 263).

## Tasks
- No aplica (`sdd: false`); plan de `progress/current.md` cumplido en sus 5 puntos.

## Checkpoints
- C1: [x] harness 0, una feature activa, rama `feat/web-test-isolation`.
- C2: [x] N/A por `sdd: false`; trazabilidad acceptance → test en `impl_web-test-isolation.md`, verificada arriba.
- C3: [x] Solo toca infraestructura de test web, los 4 ficheros de test necesarios por el cambio de contrato y la frase de `CONTRIBUTING.md` que describía el 404 antiguo (necesario para no contradecir el código). Sin refactors ajenos.
- C4: [x] Sin cambios de API/BD/UI.
- C5: [x] Sin `any`, `@ts-ignore`, `console.log` ni código comentado.
- C6: [x] harness verde; tests nuevos con asertos concretos; sin UI → sin capturas.
- C7: [x] `impl_web-test-isolation.md` completo (archivos, mapa, salida); `current.md` al día; `PLAN.md` no requiere cambio.

## Hallazgos
Ninguno bloqueante.

- Orden de carga: correcto. `vi.unstubAllGlobals()` restaura el valor previo al primer `stubGlobal`, que es el shim (asignación directa), así que sobrevive entre tests; `vi.restoreAllMocks()` no le afecta.
- Contrato de `mockApi`: cambio deliberado exigido por A2, documentado en JSDoc y `CONTRIBUTING.md`.

## Avisos para el humano (no bloquean)
- Cambio de contrato de `mockApi`: a partir de ahora, quien escriba un test de componente tiene que declarar todas las peticiones, también las que antes recibían el 404 implícito (p. ej. `GET /config` y `GET /vehicles/v1/schedules` al abrir el formulario de mantenimiento).
- Una petición sin mock que salga después del `afterEach` del último test de un fichero (petición aún en curso tras `cleanup`) se registra pero no hace fallar nada; el `beforeEach` solo la descarta si hay un test siguiente. Sigue sin salir a la red, que es lo que importa.

## Cambios requeridos
Ninguno.
