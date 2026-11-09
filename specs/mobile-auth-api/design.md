# Design — mobile-auth-api

Tres piezas pequeñas sobre lo que ya existe:

1. **Token:** plugin `bearer()` de Better Auth. Convierte `Authorization: Bearer <token>` en la cookie de sesión antes de cada llamada a Better Auth, incluida `auth.api.getSession` que usa `app.authenticate`. Por eso **todas** las rutas protegidas (incluidos los ficheros y `requireAdmin`) aceptan el token sin tocar ningún módulo.
2. **CORS:** `@fastify/cors` registrado a nivel raíz con un `delegator` que solo responde a `/api/*` y solo a los orígenes de `TRUSTED_ORIGINS`, **sin credenciales**.
3. **Config:** `TRUSTED_ORIGINS` validada con zod; la misma lista alimenta CORS y `trustedOrigins` de Better Auth.

Comprobado en un prototipo (scratchpad, Better Auth 1.7.7): login con `origin: capacitor://localhost` en `trustedOrigins` → 200 con `set-auth-token` (`<token>.<firma>`) y `token` en el cuerpo; `getSession` acepta el token firmado y el crudo y rechaza uno alterado; origen no fiable → 403; `sign-out` con Bearer invalida la sesión.

## Estado actual relevante

| Pieza | Hoy | Impacto |
|---|---|---|
| `src/auth.ts` | sin plugins; `trustedOrigins` = `[BASE_URL]` (+ `localhost:5173/5174` en desarrollo); hook `session.create.before` rechaza cuentas desactivadas | se añade `plugins: [bearer()]` y la lista |
| Desactivar cuenta (`admin-users/repository.ts`) | pone `disabled_at` y **borra sus sesiones** en una transacción | el token es la sesión: deja de valer sin cambios (R8). Sin `cookieCache`, no hay sesión cacheada que sobreviva |
| `plugins/auth.ts` | puente Fastify ↔ Better Auth solo para `GET`/`POST /api/auth/*`; copia todas las cabeceras salvo `set-cookie` | el preflight `OPTIONS` lo atiende `@fastify/cors`; el puente deja de copiar las cabeceras `access-control-*` de Better Auth (el plugin `bearer` añade `Access-Control-Expose-Headers` por su cuenta) para que CORS tenga una sola fuente (R15) |
| `app.ts` | helmet → rate limit (solo `/api/`, `allowList` con `isApiRequest`) → multipart → auth → rutas bajo `prefix: '/api'` | CORS se registra **antes** del rate limit, así un 429 de un origen permitido también lleva CORS y la app puede leerlo |
| Ficheros | `vehicles/routes.ts` y `attachments/routes.ts` con `addHook('preHandler', app.authenticate)`; propiedad en el servicio → 404 | sin cambios; solo tests (R10–R12) |
| `config.ts` | `envObjectSchema` → `ENV_VARIABLES`; `config-docs.test.ts` exige cada clave en `docs/self-hosting.md` | nueva clave; el test existente cubre R3 |

## Archivos

| Capa | Archivo | Cambio |
|---|---|---|
| api | `apps/api/package.json` | dependencia `@fastify/cors` (JS puro: va en el bundle de tsup, **no** en `RUNTIME_EXTERNALS`) |
| api | `apps/api/src/config.ts` | `TRUSTED_ORIGINS` (ver Tipos) |
| api | `apps/api/src/lib/http.ts` | exporta `isApiRequest(url)` (se mueve desde `app.ts`, que lo reutiliza) |
| api | `apps/api/src/auth.ts` | `plugins: [bearer()]`; `trustedOrigins: [BASE_URL, ...devOrigins, ...config.TRUSTED_ORIGINS]`; `advanced: { disableOriginCheck: false }` (ver «Comprobación de origen en tests») |
| api | `apps/api/src/plugins/cors.ts` (nuevo) | `fp` que registra `@fastify/cors` con `delegator` (ver abajo) |
| api | `apps/api/src/plugins/auth.ts` | el puente ignora las cabeceras `access-control-*` de la respuesta de Better Auth |
| api | `apps/api/src/app.ts` | `await app.register(corsPlugin, { origins: config.TRUSTED_ORIGINS })` justo antes de `rateLimit`; usa `isApiRequest` de `lib/http.ts` |
| docs | `docs/self-hosting.md` | fila de `TRUSTED_ORIGINS` en la tabla; en «Exponer a internet», «El resto de la API exige sesión (cookie o token de la app)» |
| docs | `.env.example` | `# TRUSTED_ORIGINS=capacitor://localhost,https://localhost` comentada con una línea de explicación |
| test | `apps/api/test/helpers.ts` | `signUp` envía como `origin` el `BASE_URL` de la app (no un `http://localhost:3000` fijo) |
| test | `apps/api/test/config.test.ts` (nuevo), `apps/api/test/mobile-auth.test.ts` (nuevo) | ver `tasks.md` |

Sin cambios en BD, `packages/shared`, web ni Docker.

## Tipos y firmas

```ts
// config.ts — dentro de envObjectSchema
/** Origins of native/other-origin clients (CORS + Better Auth trustedOrigins). Empty string = none. */
TRUSTED_ORIGINS: z
  .string()
  .default('capacitor://localhost,https://localhost')
  .transform((value) => value.split(',').map((item) => item.trim()).filter(Boolean))
  .pipe(z.array(z.string().regex(ORIGIN_PATTERN, 'Expected origins like scheme://host[:port]'))),
// ORIGIN_PATTERN = /^[a-z][a-z0-9+.-]*:\/\/[^/?#\s*]+$/i  (sin ruta, query, fragmento ni comodín)
// Config['TRUSTED_ORIGINS']: string[]

// lib/http.ts
export const isApiRequest = (url: string) => url.startsWith('/api/');

// plugins/cors.ts
export default fp(async (app, { origins }: { origins: readonly string[] }) => { … });
```

`new URL('capacitor://localhost').origin` es `'null'` (esquema no especial), por eso se valida con un patrón y no con `z.url()`. Los orígenes se comparan tal cual (sin barra final), como hace el navegador con `Origin`.

## CORS (`plugins/cors.ts`)

```ts
await app.register(cors, {
  delegator: (request, callback) => {
    const origin = request.headers.origin;
    const allowed = isApiRequest(request.url) && origin !== undefined && origins.includes(origin);
    callback(null, allowed
      ? { origin, credentials: false, methods: ['GET','POST','PUT','PATCH','DELETE'],
          allowedHeaders: ['authorization', 'content-type'],
          exposedHeaders: ['set-auth-token', 'content-disposition'], maxAge: 600 }
      : { origin: false });
  },
});
```

- `origin: false` → el plugin no añade cabeceras y el preflight no se habilita (cae al `notFound` → 404 problem+json). Con la lista vacía, `allowed` es siempre falso (R15).
- `vary: Origin` lo añade el plugin cuando el origen es dinámico (R14).
- Peticiones sin `Origin` (la web en el mismo origen, `curl`, el feed iCal) no cambian.
- `@fastify/cors` registra `OPTIONS *` oculto; cubre también `/api/auth/*`, que el puente no atiende.

## Comprobación de origen en tests

Better Auth 1.7.7 desactiva la comprobación de origen (y CSRF) cuando `NODE_ENV=test` salvo que `advanced.disableOriginCheck` esté definido (`context/create-context.mjs`: `skipOriginCheck = disableOriginCheck ?? isTest()`). Sin fijarlo, R19 no se puede verificar y R18 pasaría sin probar nada. Se fija `disableOriginCheck: false` explícitamente: en producción es el valor que ya tenía, y en tests la suite valida el origen como en producción. Como consecuencia, el helper `signUp` de los tests debe usar el `BASE_URL` de cada app de test (p. ej. `client-config.test.ts` crea la app con `BASE_URL=https://ikrive.example.com`).

## Contrato HTTP

Sin endpoints nuevos. Cambios observables:

| Petición | Antes | Ahora |
|---|---|---|
| `POST /api/auth/sign-in/email` / `sign-up/email` | cookie + `{ token, user }` | además `set-auth-token: <token>.<firma>` |
| Cualquier ruta autenticada con `Authorization: Bearer` válido | 401 | igual que con cookie |
| Bearer inválido / revocado / cuenta desactivada | — | 401 problem+json (el `UnauthorizedError` actual) |
| `OPTIONS /api/*` desde origen permitido | 404 | 204 + `access-control-allow-*` |
| `OPTIONS /api/*` desde origen no permitido | 404 | 404 sin `access-control-*` |
| Login desde origen no permitido (con cabecera `Origin`) | 403 | 403 (sin cambios) |
| Login desde origen permitido | 403 | 200 |

## Impacto en la web

Ninguno: la web no envía `Authorization` y sus peticiones son del mismo origen (`BASE_URL` no está en la lista CORS, así que no recibe cabeceras CORS). La cookie sigue siendo `httpOnly` y `SameSite=Lax`. `set-auth-token` no expone nada nuevo a JS: el cuerpo del login ya incluía `token`.

## Decisiones a validar

1. **Nombre y valor por defecto:** `TRUSTED_ORIGINS`, por defecto `capacitor://localhost,https://localhost` (Capacitor en iOS y Android) para que la APK de #51 funcione sin configurar nada. Vacía (`TRUSTED_ORIGINS=`) desactiva CORS y el login desde otros orígenes. Alternativa: vacía por defecto (opt-in), más cerrado pero obliga a configurar la instancia antes de usar la app.
2. **Sin credenciales en CORS:** la app usa el token, nunca la cookie. Así ningún origen de la lista puede usar la cookie de un navegador, aunque coincida con una página servida en `https://localhost`.
3. **Token sin `requireSignature`:** se aceptan el token firmado (`set-auth-token`) y el crudo (`token` del cuerpo), como hace el plugin por defecto. Se documenta el de la cabecera.
4. **Vida del token = la de la sesión de Better Auth** (7 días, renovada con el uso). Sin refresh tokens ni JWT.
5. **Origen no permitido en preflight → 404** (el `notFound` actual), no 403.

## Alternativas descartadas

- **Plugin `jwt` de Better Auth / tokens propios:** JWT sin estado no se pueden revocar al desactivar una cuenta o cerrar sesión; habría que duplicar la validación. `bearer` reutiliza la tabla `session` y su borrado.
- **Registrar CORS dentro del scope `prefix: '/api'`:** no cubre `/api/auth/*`, que el plugin de auth registra en la raíz, ni el preflight de esas rutas. Se filtra por URL en un plugin raíz.
- **CORS a mano con un hook `onRequest`:** menos dependencias, pero reimplementa preflight, `Vary` y la ruta `OPTIONS`; `@fastify/cors` es el plugin oficial y apenas pesa en el bundle.
- **Token en query string para `<img src>`:** acabaría en logs y en la caché del navegador; #50 pedirá los ficheros con `fetch` + Bearer y los pintará como blob.

## Riesgos

- **Contenido mixto en Android:** la WebView de Capacitor (`https://localhost`) bloquea `fetch` a un servidor `http://` de la LAN. Es cosa de #51 (`androidScheme`/`CapacitorHttp`); esta API no lo puede resolver.
- **CORP de helmet (`same-origin`):** solo afecta a peticiones `no-cors` (`<img>` de otro origen); las de `fetch` con CORS no se ven afectadas. No se cambia helmet.
- **Preflights y rate limit:** los `OPTIONS` a `/api/*` cuentan para el límite de 300/min; `maxAge: 600` los reduce.
- **El puente sobrescribe `access-control-expose-headers`** si no se filtra: por eso deja de copiar `access-control-*` (lo cubre el test de R14 sobre el login).

## Fuera de alcance

- Cliente web con URL base y token guardado (#50), proyecto Capacitor y APK (#51).
- Refresh tokens, listado/revocación de sesiones por dispositivo y OIDC.
- Cambios de helmet/CSP para servir ficheros a otros orígenes vía `<img>`.
