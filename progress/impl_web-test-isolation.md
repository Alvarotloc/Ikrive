# Implementación — #28 web-test-isolation (`sdd: false`)

Sin spec: guía = `acceptance` de la feature 28, `progress/current.md` y avisos 2 y 3 de `progress/review_mobile-nav-menu.md`.

## Diagnóstico previo

- **`scrollTo()`**: con un `window.scrollTo` temporal que registraba la pila, los 32 avisos de la línea base vienen todos de `@tanstack/router-core/dist/esm/scroll-restoration.js:182` (la scroll restoration del router al navegar), en los 4 ficheros que montan un router: `notification-bell`, `app-navigation`, `use-user-locale` y `settings-page`. No hay más orígenes.
- **Red**: con un `fetch` instrumentado, ningún test de la línea base hacía peticiones sin `mockApi` (nada salía a `localhost:3000`). Sí había **10 peticiones en 6 tests** a rutas que `mockApi` no declaraba y que caían en su 404 implícito (ver «Ajustes en tests existentes»).
- **`setup-unit.ts`**: los `*.test.ts` (Node) son lógica pura. Solo importan la clase `ApiError` de `api-client` (sin llamar a `fetch`), ninguno importa `auth-client` y en Node no hay `window.scrollTo`. **No necesita cambios.**

## Cambios por archivo

- `apps/web/src/test/setup.ts`
  - Shim de `fetch` diferido, instalado como **asignación directa** (no `vi.stubGlobal`): así el `vi.unstubAllGlobals()` del `afterEach` deja otra vez el shim en lugar de quitarlo (restaura el valor que había antes del primer `stubGlobal`, que es el shim). Delega en el `globalThis.fetch` del momento de la llamada (el `mockApi` del test). Si no hay stub, no llama al `fetch` real: rechaza con `rejectUnmockedRequest`.
  - `window.scrollTo = () => {}` (asignación directa, por lo mismo).
  - `@/i18n` pasa a importarse con `await import()` **después** del shim, para que ningún módulo de la app se evalúe antes (las demás importaciones estáticas son librerías de test y `./unmocked-requests`). Los ficheros de test se importan después del setup, así que el shim ya está cuando `auth-client` llama a `createAuthClient`.
  - `beforeEach` descarta peticiones sueltas del test anterior; `afterEach` (tras `cleanup`/`unstub`/`restore`) lanza un `Error` con todas las peticiones sin mock del test → el test falla con método y URL.
- `apps/web/src/test/unmocked-requests.ts` (nuevo): registro por fichero de test. `rejectUnmockedRequest(request)` guarda y devuelve un rechazo con el mensaje `Unmocked request: <MÉTODO> <URL>. Answer it with mockApi() in the test.`; `takeUnmockedRequests()` lo vacía. Va aparte para que lo compartan `setup.ts` y `render.tsx` sin que el setup importe módulos de la app.
- `apps/web/src/test/render.tsx` (`mockApi`): una ruta no declarada ya no responde 404, llama a `rejectUnmockedRequest` (acceptance 2: «una petición sin respuesta en mockApi»). JSDoc actualizado: hay que declarar todas las peticiones, incluso las que deban responder 404.
- `apps/web/src/features/navigation/app-navigation.test.tsx`: quitado el `vi.hoisted` local y el `vi` que solo usaba ese bloque.
- `apps/web/src/test/setup.test.tsx` (nuevo): tests del setup (abajo).
- `CONTRIBUTING.md` › Tests: la frase «las rutas no declaradas responden 404» describía el comportamiento antiguo; ahora explica que fallan con método y URL y qué hace `setup.ts`. Es el único cambio fuera de `apps/web`, necesario para que la documentación no contradiga el código.

## Ajustes en tests existentes (no cambian lo que comprueban)

Hacían peticiones incidentales que `mockApi` no declaraba y que recibían el 404 implícito; con el nuevo comportamiento habrían fallado. Se declaran con los mismos cuerpos que ya usan los tests vecinos del mismo fichero. No se toca ningún `expect`.

| Test | Petición incidental | Ajuste |
|---|---|---|
| `maintenance-form.test.tsx` › `invalidates the vehicle queries after saving` | `GET /config`, `GET /vehicles/v1/schedules` (el formulario las pide al abrirse) | añadidas al `mockApi` del test (`{ maxUploadMb: 1 }`, `[]`, como el `setup()` del fichero) |
| `maintenance-timeline.test.tsx` › `shows the add button only for active vehicles`, `opens the form prefilled when editing a record`, `opens the attachments dialog of a record` | `GET /config`, `GET /vehicles/v1/schedules` | añadidas a las rutas por defecto del `setup()` del fichero (los tests pueden sobrescribirlas) |
| `odometer-form.test.tsx` › `shows the backwards-odometer error…`, `shows the empty-field error…` | `GET /settings` | añadido `'GET /settings': { body: DEFAULT_USER_SETTINGS }`. En el segundo test el aserto `ningún POST` sigue igual |

Ningún test dependía de la red real.

## Trazabilidad acceptance → prueba

| Acceptance | Dónde | Prueba |
|---|---|---|
| A1 shim en `setup.ts` antes de importar la app; sin `vi.hoisted` en `app-navigation` | `src/test/setup.ts`; `app-navigation.test.tsx` | `src/test/setup.test.tsx` › `sends the auth client requests, captured on import, to the mockApi of the test`; `app-navigation.test.tsx` › `logs out from the menu` (sin `vi.hoisted`). Desactivando la línea `globalThis.fetch = deferredFetch` fallan los dos (y el de A2 sin mockApi): comprobado. |
| A2 petición sin respuesta en `mockApi` o sin `mockApi` → error con método y URL, sin red | `setup.ts`, `unmocked-requests.ts`, `render.tsx` | `setup.test.tsx` › `rejects a request made without mockApi, naming its method and URL` y `rejects a request to a route mockApi does not declare, naming its method and URL`. Además, probado a mano con un test temporal (borrado) que se tragaba el rechazo con `.catch()`: falla igualmente con `Error: Unmocked request: GET http://localhost:3000/api/vehicles. Answer it with mockApi() in the test.` desde el `afterEach`. |
| A3 `scrollTo` stubeado, sin avisos | `setup.ts` | Salida de `pnpm test`: 32 avisos `Not implemented: Window's scrollTo()` en la línea base → **0**. No hay test unitario: el aviso de jsdom va por su `VirtualConsole` (enlazada al `console` del entorno al crearlo), que no se puede espiar desde el test; un intento con `vi.spyOn(console, 'error')` pasaba también sin el stub, así que lo descarté por no comprobar nada. |
| A4 ningún test cambia lo que comprueba | tabla anterior | Mismos 260 tests previos en verde + 3 nuevos = 263 |
| A5 `pnpm harness --full` en verde | — | abajo |

## `pnpm harness --full`

```
[OK]    28 features: 27 done, 0 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #28 web-test-isolation (in_progress)
[OK]    Rama actual: feat/web-test-isolation
[OK]    pnpm lint
[OK]    pnpm typecheck
packages/shared test:       Tests  75 passed (75)
apps/api test:       Tests  194 passed (194)
apps/web test:       Tests  263 passed (263)
[OK]    pnpm test
[OK]    Arnés en verde.
```

En esa salida: `Not implemented` → 0 apariciones; `Unmocked request` → 0.

## Desviaciones

- `mockApi` cambia su contrato (rutas no declaradas: de 404 a error que falla el test). Lo pide el acceptance 2; obliga a los ajustes documentados en 6 tests de 3 ficheros y a corregir `CONTRIBUTING.md`.
- Sin test automático para `scrollTo` (motivo en la tabla); se verifica con la salida de `pnpm test`, que es lo que pide el acceptance.
- Sin UI: no aplican capturas.
