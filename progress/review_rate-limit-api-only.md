# Review — #21 rate-limit-api-only

**Veredicto:** APPROVED

Feature `sdd: false` (sin spec): los criterios son los `acceptance` de `feature_list.json` (id 21), `CONTRIBUTING.md`, `docs/` y `CHECKPOINTS.md`.

## Trazabilidad acceptance ↔ tests
- A1 (los estáticos de la SPA no cuentan ni reciben 429): [x] `apps/api/test/rate-limit.test.ts` › `does not count or limit SPA static files and client-route fallback`. Hace 320 × 4 peticiones (`/`, `/index.html`, `/assets/app.js`, `/vehicles/123` como fallback) y comprueba en todas un 200 sin cabecera `x-ratelimit-limit`. Después comprueba que `/api/health` tiene `x-ratelimit-remaining = 299`, es decir, que esas peticiones no han gastado presupuesto.
- A2 (/api/* sigue limitado y responde 429): [x] mismo archivo › `still limits /api routes and answers 429 past the maximum`. Las 300 primeras dan 200 y la 301 da 429. Comprueba además que los estáticos siguen dando 200 con el presupuesto agotado.
- A3 (el rate limit de Better Auth no cambia): [x] `apps/api/src/auth.ts` no aparece en el diff.
- A4 (tests de integración para los dos casos): [x] los dos tests anteriores usan `createTestApp` con SQLite `:memory:` y `app.inject()`.
- A5 (harness en verde): [x] lo he ejecutado yo: `pnpm harness --full` da OK (api 93/93, web 152/152).

## Tasks
- No aplica (`sdd: false`, sin `tasks.md`). La regla de `docs/sdd.md:26` permite el flujo sin spec.

## Checkpoints
- C1: [x] el harness está en verde, solo #21 está activa y la rama es `feat/rate-limit-api-only`.
- C2: [x] no aplica (`sdd: false`). Todos los acceptance tienen un test real (ver arriba).
- C3: [x] el diff solo toca `apps/api/src/app.ts` (`allowList` y el helper `isApiRequest`, que también usa el not-found handler con la misma semántica), el test nuevo, `progress/` y la entrada de `feature_list.json`. No hay cambios de otras features.
- C4: [x] no aplica en su mayoría (no hay dominio, BD ni web). El cableado sigue en `app.ts`.
- C5: [x] sin `any`, sin `@ts-ignore` y sin código comentado. El comentario nuevo explica el porqué.
- C6: [x] el harness está en verde. Los tests afirman códigos y cabeceras concretos y usan SQLite en memoria. Sin UI, así que no hacen falta capturas.
- C7: [x] `impl_rate-limit-api-only.md` incluye archivos, mapa acceptance → test y salida del harness. `current.md` describe la sesión. `PLAN.md` no cambia ninguna decisión: «helmet y rate limit» sigue siendo cierto.

## Hallazgos
Ninguno bloqueante.

## Avisos para el humano (no bloquean)
- `isApiRequest` usa `url.startsWith('/api/')`, que distingue mayúsculas. Como el router de Fastify también las distingue y no ignora barras duplicadas, una variante como `/API/...` o `//api/...` no llega a ninguna ruta de la API: cae en estáticos o en 404. No abre un hueco para saltarse el límite.
- El primer test hace unas 1.280 peticiones `inject`. Hoy es rápido (la suite de la API tarda unos 4 s), pero habrá que vigilarlo si el límite sube.

## Cambios requeridos
Ninguno.
