# Review — #46 settings-test-flake

**Veredicto:** APPROVED

Feature `sdd: false`: no hay `specs/settings-test-flake/`, así que reviso contra la `description` y los `acceptance` de `feature_list.json`, `CONTRIBUTING.md`, `docs/` y `CHECKPOINTS.md`. Diff revisado: `git diff main...HEAD` (vacío) + `git diff` + no trackeados (`apps/web/src/test/render-app.tsx`, `progress/impl_settings-test-flake.md`).

## Trazabilidad acceptance ↔ evidencia
- A1 (causa identificada, sin subir timeouts a ciegas): [x] `impl_settings-test-flake.md` › «Causa» explica la importación en frío de los chunks de `autoCodeSplitting` dentro del 1 s del primer `findBy*`, con medidas (loader +25 ms frente a `onLoad` +190 ms en frío, 0,85–1,8 s bajo carga). El arreglo, `apps/web/src/test/render-app.tsx:28`, espera a `router.loadRouteChunk` para todas las rutas antes de renderizar. `grep timeout` en `apps/web/src` no encuentra ningún timeout nuevo ni modificado.
- A2 (arreglo en el helper común): [x] nuevo `renderApp` usado por los cuatro tests que montaban el `routeTree` real (`settings-page`, `use-user-locale`, `login-page`, `admin-route`). Los otros tests con `RouterProvider` (`app-navigation`, `notification-bell`, `users-page`) usan árboles propios sin chunks, así que es correcto dejarlos igual.
- A3 (20 ejecuciones seguidas): [x] el informe lista 20/20 ejecuciones de la suite web completa (322/322), con los tests de la API corriendo en paralelo para reproducir la carga. Lo he comprobado con 6 ejecuciones más en las mismas condiciones: 6/6 en verde.
- A4 (`pnpm harness --full` en verde): [x] lo he ejecutado: lint, typecheck y test en verde (shared 117, web 322, api 293).

## Aislamiento por el import de `auth-client` en `setup.ts`
- Los setupFiles se ejecutan en el grafo de módulos de cada fichero de test (`isolate` por defecto, sin cambios en `vitest.config.ts`). Cada fichero tiene, por tanto, su propia instancia de `authClient`, como antes.
- `authClient` se importa después de instalar `deferredFetch` (`setup.ts:17` y luego `:28`), así que guarda el `fetch` diferido, que en cada llamada delega en el `mockApi` del test que esté en curso. Ya no se queda con el stub de un test anterior. Lo cubre `apps/web/src/test/setup.test.tsx` › «sends the auth client requests, captured on import, to the mockApi of the test», que sigue en verde.
- Ningún test hace `vi.mock('@/lib/auth-client')` (comprobado con grep), así que la precarga no anula ningún mock.

## Tasks
- No aplica (`sdd: false`, sin `tasks.md`). El plan de `progress/current.md` está completo.

## Checkpoints
- C1: [x] harness con código 0, una sola feature activa (#46 `in_progress`) y rama `feat/settings-test-flake`.
- C2: [x] N/A por `sdd: false`. Los `acceptance` están cubiertos (ver arriba).
- C3: [x] solo cambian helpers y tests web, una línea de documentación en `CONTRIBUTING.md` y el rastro del harness. Migrar `admin-route.test.tsx` también es coherente con A2, porque usaba el mismo patrón.
- C4: [x] sin cambios de API, BD ni UI. La convención de tests queda documentada en `CONTRIBUTING.md`.
- C5: [x] sin `any`, `@ts-ignore`, `console.log` ni código comentado. La instrumentación temporal se retiró.
- C6: [x] `pnpm harness --full` en verde. No se necesitan capturas porque no cambia la UI.
- C7: [x] `impl_settings-test-flake.md` incluye archivos tocados, trazabilidad de acceptance y salida de la verificación. `current.md` está al día. `PLAN.md` no necesita cambios.

## Hallazgos
Ninguno bloqueante.

## Avisos para el humano (no bloquean)
- Como `setup.ts` importa `@/lib/auth-client`, un `vi.mock('@/lib/auth-client')` futuro dentro de un test podría no aplicarse al módulo ya cacheado. Hoy ningún test lo mockea, y la convención es `mockApi`.
- `renderApp` precarga todas las rutas en cada llamada. A partir del primer test del fichero sale barato porque los módulos ya están cacheados, pero el primer test de cada fichero paga la precarga completa (hasta ~1,8 s bajo carga, que cuenta dentro del timeout de 5 s del test). El margen sobra hoy. Si el árbol de rutas crece mucho, conviene vigilarlo.
- El comentario de `admin-route.test.tsx` («not for the lazily loaded page to render») sigue siendo válido, aunque ahora el chunk ya está precargado.

## Cambios requeridos
Ninguno.
