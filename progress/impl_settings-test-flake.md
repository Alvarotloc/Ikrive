# Implementación — #46 `settings-test-flake` (`sdd: false`)

## Causa

Las rutas se generan con `autoCodeSplitting` (`apps/web/vite.config.ts`): el componente de cada página es un chunk perezoso (`?tsr-split=component`). En el **primer test de cada fichero** (cada fichero tiene un grafo de módulos propio), el router importa en frío ese chunk y todo lo que arrastra (en Ajustes: react-hook-form, zod resolver, canales, feed de calendario, «Tus datos»…), y Vite lo transforma en ese momento. Ese coste caía **dentro** de la ventana del primer `findBy*`, cuyo timeout por defecto es de 1 s.

Medido con instrumentación temporal (ya retirada) en `settings-page.test.tsx`:

| Momento (primer test, fichero aislado) | Sin arreglo | 2.º test |
| --- | --- | --- |
| Peticiones del loader respondidas | +25 ms | +3 ms |
| `router onLoad` (espera a los chunks) | +190 ms | +3 ms |
| Etiqueta encontrada | +294 ms | +38 ms |

Las peticiones (mockApi) y los loaders tardan milisegundos; el hueco hasta `onLoad` es la importación de los chunks. Con la suite completa y los tests de la API en paralelo (como en `pnpm -r test`), la importación de los chunks tarda **0,85–1,8 s** (medido), así que el primer `findBy` se quedaba sin tiempo con el body vacío. Es el mismo patrón en `use-user-locale.test.tsx` (primer test, 762–1028 ms) y `login-page.test.tsx` (chunk de `/login`, ~1 s): los tres montaban `RouterProvider` a mano con el `routeTree` real.

Problema relacionado: `login.tsx` importa `@/lib/auth-client` desde su chunk perezoso. `createAuthClient` guarda el `fetch` que ve al importarse; importado durante un test, se quedaba con el stub de `mockApi` de ese test. `login-page.test.tsx` lo evitaba con un import estático local.

## Arreglo

- **Nuevo helper común `apps/web/src/test/render-app.tsx` › `renderApp(path, { queryClient? })`** (async): crea el router con el `routeTree` real y memoria en `path`, **carga los chunks de todas las rutas** (`router.loadRouteChunk` sobre `router.routesById`) y después renderiza con `renderWithProviders`. La importación en frío queda fuera de la ventana de los `findBy*` (solo la limita el timeout del test, 5 s). Se precargan todas las rutas, no solo las de `path`, para que redirecciones y navegaciones dentro del test tampoco paguen la importación. No se ha subido ningún timeout.
- **`apps/web/src/test/setup.ts`**: importa `@/lib/auth-client` justo después de instalar el `fetch` diferido, para todos los tests; se elimina el import estático de `login-page.test.tsx`.
- Migrados al helper los cuatro tests que montaban el árbol de rutas real: `settings-page.test.tsx`, `use-user-locale.test.tsx`, `login-page.test.tsx` y `admin-route.test.tsx` (este último no fallaba, pero usaba el mismo patrón). Los tests que montan un árbol de rutas propio en memoria (`app-navigation`, `notification-bell`, `users-page`) no usan chunks code-split y no cambian.
- `CONTRIBUTING.md` › Tests: indica usar `renderApp` para páginas con el árbol de rutas real y por qué `authClient` se importa en `setup.ts`.

Margen tras el arreglo (13 ejecuciones de la suite web con los tests de la API en paralelo, instrumentación temporal): la precarga tarda 853–1784 ms y el `findByLabelText('Hora de los recordatorios')` del primer test **375–648 ms** (antes, precarga + render dentro del mismo 1 s). Lo que queda es el primer render del layout + página en jsdom, que es lo que el `findBy` debe esperar.

## Cambios por archivo

| Archivo | Cambio |
| --- | --- |
| `apps/web/src/test/render-app.tsx` | Nuevo: `renderApp` (precarga de chunks + render) |
| `apps/web/src/test/setup.ts` | Importa `@/lib/auth-client` tras el shim de `fetch` |
| `apps/web/src/features/settings/settings-page.test.tsx` | Usa `await renderApp('/settings')` |
| `apps/web/src/features/settings/use-user-locale.test.tsx` | Usa `renderApp` (helper local renombrado a `renderSignedIn`) |
| `apps/web/src/features/auth/login-page.test.tsx` | Usa `renderApp('/login')`; quita el import estático de `auth-client` |
| `apps/web/src/features/admin-users/admin-route.test.tsx` | Usa `renderApp('/admin/users')` |
| `CONTRIBUTING.md` | Documenta `renderApp` |

## Trazabilidad (acceptance)

| Acceptance | Evidencia |
| --- | --- |
| Causa identificada y corregida sin subir timeouts | Sección «Causa» (medidas) y «Arreglo»: precarga de chunks; ningún `timeout` tocado |
| Arreglo en el helper común | `apps/web/src/test/render-app.tsx` › `renderApp`, usado por los 4 tests con el árbol real; `auth-client` en `src/test/setup.ts` |
| 20 ejecuciones seguidas en verde | Abajo |
| `pnpm harness --full` en verde | Abajo |

## 20 ejecuciones seguidas de la suite web

Bucle de `pnpm --filter ./apps/web exec vitest run` (suite web completa, incluido `settings-page.test.tsx`), lanzando en paralelo en cada vuelta `pnpm --filter @ikrive/api test` para reproducir la carga de `pnpm -r test`:

```
run 1 exit=0  Tests 322 passed (322)  Duration 9.00s 
run 2 exit=0  Tests 322 passed (322)  Duration 10.24s 
run 3 exit=0  Tests 322 passed (322)  Duration 10.68s 
run 4 exit=0  Tests 322 passed (322)  Duration 10.24s 
run 5 exit=0  Tests 322 passed (322)  Duration 9.98s 
run 6 exit=0  Tests 322 passed (322)  Duration 10.41s 
run 7 exit=0  Tests 322 passed (322)  Duration 10.55s 
run 8 exit=0  Tests 322 passed (322)  Duration 10.28s 
run 9 exit=0  Tests 322 passed (322)  Duration 10.42s 
run 10 exit=0  Tests 322 passed (322)  Duration 10.41s 
run 11 exit=0  Tests 322 passed (322)  Duration 10.26s 
run 12 exit=0  Tests 322 passed (322)  Duration 10.14s 
run 13 exit=0  Tests 322 passed (322)  Duration 10.65s 
run 14 exit=0  Tests 322 passed (322)  Duration 10.85s 
run 15 exit=0  Tests 322 passed (322)  Duration 10.76s 
run 16 exit=0  Tests 322 passed (322)  Duration 12.04s 
run 17 exit=0  Tests 322 passed (322)  Duration 11.92s 
run 18 exit=0  Tests 322 passed (322)  Duration 11.03s 
run 19 exit=0  Tests 322 passed (322)  Duration 11.71s 
run 20 exit=0  Tests 322 passed (322)  Duration 10.91s 
```

(Sin arreglo, en el mismo bucle de carga los primeros tests ya rozaban el límite: `saves the reminder hour` 1250 ms, `shows a disabled account message…` 1012 ms.)

## `pnpm harness --full`

```
[OK]    46 features: 38 done, 7 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #46 settings-test-flake (in_progress)
[OK]    Rama actual: feat/settings-test-flake
[OK]    pnpm lint        (Checked 339 files, no fixes)
[OK]    pnpm typecheck
packages/shared  Tests 117 passed (117)
apps/web         Tests 322 passed (322)
apps/api         Tests 293 passed (293)
[OK]    pnpm test
[OK]    Arnés en verde.
```

## Desviaciones

Ninguna respecto a los acceptance. Extra: `admin-route.test.tsx` también se migra al helper (mismo patrón), y una línea en `CONTRIBUTING.md`.
