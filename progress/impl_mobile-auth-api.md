# Implementación — mobile-auth-api (#49)

**Estado: hecha.** T1–T22 y T19a hechas (T22 se añadió en Gate 2). `pnpm harness --full` pasa en verde.

## Bloqueo resuelto (T19 → T19a)

En el primer intento, `trusted origins › rejects sign-in from other origins` fallaba: un inicio de sesión desde `https://evil.example` devolvía 200. El motivo es que Better Auth 1.7.7 no comprueba el origen cuando `NODE_ENV=test` salvo que se defina `advanced.disableOriginCheck` (`context/create-context.mjs`: `skipOriginCheck = disableOriginCheck ?? isTest()`). El humano eligió la opción 1 y el spec se actualizó (design › «Comprobación de origen en tests», task T19a):

- `apps/api/src/auth.ts`: `advanced: { disableOriginCheck: false }`. En producción el valor no cambia. En los tests, el origen ahora se comprueba igual que en producción.
- `apps/api/test/helpers.ts`: `createTestApp` registra en un `WeakMap` el `BASE_URL` de cada app, y `signUp` lo envía como `origin` en lugar del `http://localhost:3000` fijo. Esto arregla `client-config.test.ts › does not flag a public BASE_URL`, que usa `BASE_URL=https://ikrive.example.com`. Ningún otro test existente tuvo que cambiar.

## Cambios por archivo

| Archivo | Cambio |
|---|---|
| `apps/api/src/config.ts` | `ORIGIN_PATTERN` y `TRUSTED_ORIGINS`: separa por comas, quita espacios y elementos vacíos. Por defecto `capacitor://localhost,https://localhost`. Tipo `string[]` |
| `apps/api/src/auth.ts` | `plugins: [bearer()]`; `trustedOrigins = [BASE_URL, ...orígenes de Vite en desarrollo, ...TRUSTED_ORIGINS]`; `advanced: { disableOriginCheck: false }` |
| `apps/api/src/lib/http.ts` | exporta `isApiRequest` |
| `apps/api/src/plugins/cors.ts` (nuevo) | `@fastify/cors` con el `delegator` de `design.md`: solo `/api/*`, solo orígenes de la lista, sin credenciales, `maxAge: 600` |
| `apps/api/src/plugins/auth.ts` | el puente ya no copia las cabeceras `access-control-*` que devuelve Better Auth |
| `apps/api/src/app.ts` | registra `corsPlugin` antes de `rateLimit`; importa `isApiRequest` de `lib/http.ts` |
| `apps/api/package.json`, `pnpm-lock.yaml` | `@fastify/cors ^11.4.1` (va en el bundle, no en `RUNTIME_EXTERNALS`) |
| `apps/api/test/helpers.ts` | `signUp` envía como `origin` el `BASE_URL` de la app |
| `docs/self-hosting.md` | fila de `TRUSTED_ORIGINS`; «El resto de la API exige sesión (cookie o token de la app).» |
| `.env.example` | línea `# TRUSTED_ORIGINS=…` comentada, con explicación |
| `apps/api/test/config.test.ts` (nuevo) | tests de T2 |
| `apps/api/test/mobile-auth.test.ts` (nuevo) | tests de T9–T20 |

## Trazabilidad

| R | Test |
|---|---|
| R1 | `config.test.ts` › `parses TRUSTED_ORIGINS with the Capacitor defaults`, `trims and drops empty TRUSTED_ORIGINS items`, `allows an empty TRUSTED_ORIGINS list` |
| R2 | `config.test.ts` › `rejects TRUSTED_ORIGINS entries that are not origins` |
| R3 | `config-docs.test.ts` › `documents every environment variable` |
| R4 | `mobile-auth.test.ts` › `bearer sessions › returns a session token on sign-up and sign-in` |
| R5 | `mobile-auth.test.ts` › `bearer sessions › authenticates API routes with the bearer token` |
| R6 | `mobile-auth.test.ts` › `bearer sessions › rejects unknown, tampered and malformed tokens` |
| R7 | `mobile-auth.test.ts` › `bearer sessions › invalidates the token on sign-out` |
| R8 | `mobile-auth.test.ts` › `disabled accounts › rejects the tokens of a disabled account` |
| R9 | `mobile-auth.test.ts` › `disabled accounts › does not issue a token to a disabled account` |
| R10 | `mobile-auth.test.ts` › `files with a bearer token › serves the photo, attachment and thumbnail to their owner` |
| R11 | `mobile-auth.test.ts` › `files with a bearer token › answers 404 to another user's token` |
| R12 | `mobile-auth.test.ts` › `files with a bearer token › answers 401 without cookie or token` |
| R13 | `mobile-auth.test.ts` › `CORS › answers preflight from an allowed origin` |
| R14 | `mobile-auth.test.ts` › `CORS › adds CORS headers to responses and errors for an allowed origin`, `adds CORS headers to rate-limited responses` (T22) |
| R15 | `mobile-auth.test.ts` › `CORS › ignores origins outside the list`, `opens CORS to nobody when TRUSTED_ORIGINS is empty` |
| R16 | `mobile-auth.test.ts` › `CORS › adds CORS headers…`, `answers preflight…` (sin `access-control-allow-credentials`), `ignores origins outside the list` |
| R17 | `mobile-auth.test.ts` › `CORS › does not add CORS headers outside /api` |
| R18 | `mobile-auth.test.ts` › `trusted origins › accepts sign-in from a listed origin` |
| R19 | `mobile-auth.test.ts` › `trusted origins › rejects sign-in from other origins` |
| R20 | `mobile-auth.test.ts` › `web › keeps cookie sessions for the web` + la suite existente (`auth.test.ts`, `admin-users.test.ts`, `rate-limit.test.ts`…) |

## `pnpm harness --full`

```
[OK]    Feature activa: #49 mobile-auth-api (in_progress)
[OK]    Rama actual: feat/mobile-auth-api
[OK]    pnpm lint
[OK]    pnpm typecheck
        e2e 6 passed · shared 119 passed · web 348 passed · api 358 passed
[OK]    pnpm test
[OK]    Arnés en verde.
```

## T22 (Gate 2, aviso 5 del reviewer)

`CORS › adds CORS headers to rate-limited responses`: hace 300 peticiones a `GET /api/health` desde `capacitor://localhost` (el mismo límite que `rate-limit.test.ts`); la siguiente devuelve 429 con `access-control-allow-origin: capacitor://localhost`, `access-control-expose-headers: set-auth-token, content-disposition` y sin `access-control-allow-credentials`. No hizo falta tocar el código de producción.

**Ojo: el test no protege el orden de registro de `app.ts`, aunque la task diga lo contrario.** Lo comprobé registrando CORS después de `rateLimit` en una prueba temporal (ya deshecha) y el test seguía pasando. `@fastify/rate-limit` engancha su hook `onRequest` a cada ruta, y los hooks de ruta se ejecutan después del `onRequest` global de `@fastify/cors`. Por eso el 429 lleva las cabeceras CORS se registren en el orden que se registren. El test sí garantiza el comportamiento que importa (R14 en un 429), pero no el orden en sí.

## Desviaciones del spec

- Ninguna respecto al spec actualizado (T19a incluida).
- `rejects unknown, tampered and malformed tokens` también prueba `Bearer` sin valor y el esquema `Basic`.
- `invalidates the token on sign-out` también comprueba que la cookie web del mismo usuario sigue funcionando: solo se cierra esa sesión.
- `config.test.ts` › `rejects…` prueba con ruta, query, fragmento, `*`, comodín en el host y un valor sin esquema.

No hay UI: no se necesitan capturas. No se toca Docker: sin smoke test.
