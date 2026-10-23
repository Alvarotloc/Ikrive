# Implementación: #21 rate-limit-api-only

Feature `sdd: false` (sin spec). Guía: `acceptance` de la feature en `feature_list.json`.

## Cambios por archivo

- `apps/api/src/app.ts`
  - `@fastify/rate-limit` se registra con `allowList: (request) => !isApiRequest(request.url)`: solo las peticiones a `/api/*` cuentan y pueden recibir 429. Los estáticos de la SPA (rutas de `@fastify/static`), `index.html` y el fallback de rutas del cliente quedan fuera (sin contar y sin cabeceras `x-ratelimit-*`).
  - Nuevo helper local `isApiRequest(url)` (`url.startsWith('/api/')`), reutilizado también en el not-found handler (antes tenía la misma comprobación inline).
  - Límite sin cambios: 300 peticiones/min por IP.
  - Better Auth no se toca: su `rateLimit: { enabled: NODE_ENV === 'production' }` en `src/auth.ts` sigue igual. Las rutas `/api/auth/*` siguen además bajo el límite global de Fastify, como antes.
- `apps/api/test/rate-limit.test.ts` (nuevo): tests de integración con `app.inject()` y un `WEB_DIST_DIR` temporal (`index.html` + `assets/app.js`).

## Trazabilidad

| Acceptance | Test |
|---|---|
| Estáticos (index.html, /assets/*, fallback) no cuentan ni reciben 429 aunque se superen 300 req/min | `apps/api/test/rate-limit.test.ts` › `does not count or limit SPA static files and client-route fallback` (320 × 4 URLs = 1280 peticiones, todas 200 sin cabeceras de rate limit; después `/api/health` tiene `x-ratelimit-remaining = 299`) |
| /api/* sigue limitado: superar el máximo responde 429 | `apps/api/test/rate-limit.test.ts` › `still limits /api routes and answers 429 past the maximum` (300 × 200, la 301 → 429; los estáticos siguen respondiendo 200 con el presupuesto de la API agotado) |
| Rate limit de Better Auth en producción no cambia | Sin cambios en `apps/api/src/auth.ts` (verificable en el diff) |
| Tests de integración cubren ambos casos | Los dos tests anteriores |
| `pnpm harness --full` en verde | Ver abajo |

Comprobado además que, quitando el `allowList`, los dos tests fallan.

## `pnpm harness --full`

```
[OK]    pnpm lint
[OK]    pnpm typecheck
apps/api test:  Test Files  12 passed (12)  Tests  93 passed (93)
apps/web test:  Test Files  20 passed (20)  Tests 152 passed (152)
[OK]    pnpm test
[OK]    Arnés en verde.
```

## Desviaciones

Ninguna. Nota: el fallback de la SPA (not-found handler) ya no pasaba por el rate limit antes del cambio (el plugin no aplica a not-found salvo que se pida); el problema real eran las rutas de `@fastify/static`. El `allowList` cubre ambos casos de forma uniforme.
