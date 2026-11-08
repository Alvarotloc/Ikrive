# Implementación — mobile-auth-api (#49)

## Cambios por archivo

| Archivo | Cambio |
|---|---|
| `apps/api/package.json`, `pnpm-lock.yaml` | `@fastify/cors` `^11.4.1` (JS puro, va en el bundle de tsup; comprobado en `dist/`). No toca `RUNTIME_EXTERNALS`. |
| `apps/api/src/config.ts` | `CORS_ORIGINS`: default `capacitor://localhost,https://localhost`, split por comas con `trim`, `''` → `[]`, cada entrada validada con la regex `ORIGIN` de `design.md`. `Config['CORS_ORIGINS']` es `string[]`. |
| `apps/api/src/auth.ts` | `plugins: [bearer({ requireSignature: true })]`; `trustedOrigins` = `BASE_URL` + (dev: 5173/5174) + `CORS_ORIGINS`; **`advanced: { disableOriginCheck: false }`** (ver Desviaciones). Tipos `Auth`/`SessionUser` intactos (`typecheck` verde). |
| `apps/api/src/lib/http.ts` | Exporta `isApiRequest` (movido desde `app.ts`). |
| `apps/api/src/plugins/cors.ts` (nuevo) | `@fastify/cors` con el `delegator` de `design.md`: solo `/api/*` y origen exacto de la lista; sin credenciales; methods/allowedHeaders/exposedHeaders/maxAge 600. Resto → `origin: false` (sin cabeceras; preflight → not-found handler → 404 problem+json). |
| `apps/api/src/app.ts` | Registra `corsPlugin` tras `helmet` y antes de `rateLimit`/`authPlugin`; importa `isApiRequest` de `lib/http.ts`. |
| `apps/api/src/plugins/auth.ts` | **Ronda de review:** el puente `/api/auth/*` fusiona `Access-Control-Expose-Headers` de Better Auth con la ya fijada por el plugin CORS (unión sin duplicados, insensible a mayúsculas; helper `mergeHeaderList`) en vez de sobrescribirla (ver Desviaciones, 3). |
| `apps/api/test/mobile-auth.test.ts` (nuevo) | 21 tests (T7–T16 + test de R6 en `/api/auth/*`). |
| `apps/api/test/helpers.ts` | `signUp(app, email, name, origin = 'http://localhost:3000')`: parámetro opcional `origin` (ver Desviaciones). |
| `apps/api/test/client-config.test.ts` | `does not flag a public BASE_URL` se registra desde su propio `BASE_URL` (ver Desviaciones). |
| `docs/self-hosting.md` | Fila `CORS_ORIGINS` (default, formato, sin `*`, vacía = sin CORS ni orígenes extra, sin credenciales/bearer). |
| `docs/PLAN.md` | Decisión «Clientes nativos (fase 8)»: bearer firmado, CORS solo `/api/*` sin credenciales, `CORS_ORIGINS`, ficheros por `fetch` + token. |

Módulos, web y BD sin cambios.

## Trazabilidad

Todos en `apps/api/test/mobile-auth.test.ts`.

| R | Test |
|---|---|
| R1 | bearer session › returns a signed token in set-auth-token on sign-in |
| R2 | bearer session › authenticates protected and admin routes with the bearer token (`/api/me`, `POST/GET /api/vehicles`, `GET /api/admin/users` admin 200 / user 403) |
| R3 | bearer session › invalidates the token on sign-out |
| R4 | bearer session › rejects malformed, forged and unsigned tokens with 401; files with a bearer token › answers 401 without a token |
| R5 | bearer session › keeps cookie sign-in working for the web (+ suite existente en verde) |
| R6 | CORS › answers allowed origins with CORS headers, also on errors (200 y 401); CORS › keeps both exposed headers on Better Auth responses that create a session (`POST /api/auth/sign-in/email` desde `capacitor://localhost` → `set-auth-token, content-disposition`; login web desde `BASE_URL` sin cambios) |
| R7 | CORS › answers the preflight of an allowed origin with 204 |
| R8 | CORS › sends no CORS headers to other origins (simple y preflight → 404) |
| R9 | CORS › answers allowed origins… / answers the preflight… (`access-control-allow-credentials` ausente) |
| R10 | CORS › sends no CORS headers outside /api (`WEB_DIST_DIR`, GET `/` y `/vehicles/123`, preflight → 404) |
| R11 | trusted origins › accepts sign-in from a native origin (`capacitor://localhost`, `https://localhost`) |
| R12 | trusted origins › rejects sign-in from an untrusted origin with 403 (sin `set-auth-token`) |
| R13 | CORS_ORIGINS config › uses the Capacitor origins by default; trusted origins › accepts sign-in from a native origin |
| R14 | CORS_ORIGINS config › trusts no extra origin when empty |
| R15 | CORS_ORIGINS config › rejects invalid origins (`*`, `example.com`, `https://a.example/`, `https://a.example/path`, lista con `*`); accepts a custom list |
| R16 | `docs/self-hosting.md` fila `CORS_ORIGINS`; `test/config-docs.test.ts` en verde |
| R17 | files with a bearer token › serves photo, thumbnail and invoice to the owner (mismo `content-type`, `content-disposition` y bytes que con cookie) |
| R18 | files with a bearer token › answers 404 to another user's token (los cuatro ficheros) |
| R19 | disabled accounts › rejects the tokens of a disabled account, also after re-enabling it (`/api/me` y foto) |
| R20 | disabled accounts › does not issue a token to a disabled account |

Mutaciones comprobadas (cada una rompe al menos un test y se revirtió): `requireSignature: false`; quitar `disableOriginCheck: false`; quitar el filtro `isApiRequest` del delegator; `credentials: true`.

Smoke contra el build de producción (`node dist/server.js`, `NODE_ENV=production`): preflight desde `capacitor://localhost` → 204 con las cabeceras esperadas; sign-up/sign-in nativo → 200 + `set-auth-token`; `GET /api/me` con `Authorization: Bearer` → 200; sign-in desde `https://evil.example` → 403.

## `pnpm harness --full`

```
[OK]    54 features: 48 done, 5 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #49 mobile-auth-api (in_progress)
[OK]    Rama actual: feat/mobile-auth-api
[OK]    pnpm lint
[OK]    pnpm typecheck
e2e test:             Tests  6 passed (6)
packages/shared test: Tests  119 passed (119)
apps/web test:        Tests  348 passed (348)
apps/api test:        Tests  1 failed | 356 passed (357)
  × data-import › validation › answers 500 when the zip cannot be written to disk
[FAIL]  pnpm test
```

El único fallo es el test conocido que **no funciona como root** (`chmod 0o500` no impide escribir a root; ya anotado en `progress/history.md` y `progress/impl_data-import-api.md`). Este entorno ejecuta como `root`; no se puede correr la suite como otro usuario sin cambiar permisos del repo. No tiene relación con esta feature. En CI (usuario `runner`) debería pasar: conviene confirmarlo allí antes de Gate 2.

Docker: el daemon no está disponible en este entorno, no se pudo hacer `docker build`. La dependencia nueva va en el bundle (sin cambios en `RUNTIME_EXTERNALS` ni en el Dockerfile); `test/build.test.ts` en verde.

## Desviaciones del spec

1. **`advanced: { disableOriginCheck: false }` en `auth.ts`** (no está en `design.md`). Better Auth 1.7.7 **desactiva la comprobación de origen cuando `NODE_ENV=test`** (`skipOriginCheck` = `isTest()`), y vitest corre con `NODE_ENV=test`. Sin esta opción, R12 y R14 (403 desde un origen no de confianza) no se pueden probar. Fijarla a `false` es el comportamiento por defecto en desarrollo y producción, así que solo cambia el entorno de tests, que pasa a verificar lo mismo que producción.
2. **Consecuencia: `client-config.test.ts` y `helpers.ts`** (fuera de la tabla de archivos de `design.md`). `does not flag a public BASE_URL` usa `BASE_URL=https://ikrive.example.com` pero se registraba con `origin: http://localhost:3000`; solo pasaba porque Better Auth no comprobaba el origen. Ahora `signUp` acepta un `origin` opcional (por defecto el de siempre) y ese test se registra desde su `BASE_URL`. El resto de la suite no cambia.

3. **`apps/api/src/plugins/auth.ts`** (fuera del alcance de `design.md`; decisión del leader, opción (a) de `review_mobile-auth-api.md`). El hook *after* del plugin `bearer` pone `Access-Control-Expose-Headers: set-auth-token` en las respuestas que crean sesión, y el puente lo copiaba con `reply.header`, pisando el `set-auth-token, content-disposition` del plugin CORS: R6 no se cumplía en login/sign-up nativos. Ahora el puente hace la unión de ambas listas (sin duplicados, case-insensitive). En peticiones same-origin de la web no hay cabecera previa, así que el resultado es idéntico al anterior (`set-auth-token`, sin `Allow-Origin`), lo que también afirma el test. Comprobado que el test nuevo falla con el puente original.

Si el leader/reviewer prefiere no tocar la configuración de Better Auth, la alternativa sería quitar la opción y aceptar que R12/R14 queden sin test de 403 (solo la parte CORS de R14).

## Observaciones (sin cambio, para el reviewer)

- (Resuelto en la ronda de review, Desviación 3: el puente ya no pisa `Access-Control-Expose-Headers`.) El login de la web desde `BASE_URL` también lleva esa cabecera `Expose-Headers` (sin `Allow-Origin`, así que el navegador la ignora; no es `Access-Control-Allow-*`, R8/R9 se cumplen).
- `Vary: Origin` lo añade `@fastify/cors` a todas las respuestas (también fuera de `/api` y a orígenes no permitidos), porque el delegator es dinámico. Es correcto para cachés y no es una cabecera `Access-Control-*`.
