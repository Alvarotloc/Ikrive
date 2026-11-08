# Design — mobile-auth-api

Tres piezas independientes, todas en `apps/api`:

1. **Token:** plugin `bearer({ requireSignature: true })` de Better Auth. Su hook *before* convierte `Authorization: Bearer <token>` en la cookie de sesión de la petición, y lo hace tanto en `/api/auth/*` como en `auth.api.getSession(...)`, que es lo que llama `app.authenticate`. Por eso **todas** las rutas protegidas (incluidos los ficheros y `requireAdmin`) aceptan el token sin tocar `plugins/auth.ts` ni ningún módulo.
2. **Orígenes nativos:** nueva variable `CORS_ORIGINS` que alimenta a la vez el CORS de `/api/*` (`@fastify/cors`) y los `trustedOrigins` de Better Auth.
3. **Cuentas desactivadas:** ya resuelto por #37 (desactivar borra las sesiones; el hook `session.create.before` bloquea el login). Como el token es la propia sesión, solo hacen falta tests.

## Archivos

| Capa | Archivo | Cambio |
|---|---|---|
| api | `apps/api/package.json` | Dependencia `@fastify/cors` (^11, la de Fastify 5). JS puro: va en el bundle de tsup, no en `RUNTIME_EXTERNALS`. |
| api | `apps/api/src/config.ts` | `CORS_ORIGINS` en `envObjectSchema` → `string[]` (ver Configuración). |
| api | `apps/api/src/auth.ts` | `plugins: [bearer({ requireSignature: true })]`; `trustedOrigins` = lista actual + `config.CORS_ORIGINS`. |
| api | `apps/api/src/lib/http.ts` | Se mueve aquí `isApiRequest` (hoy local en `app.ts`) y se exporta para reutilizarlo en CORS y rate limit. |
| api | `apps/api/src/plugins/cors.ts` (nuevo) | Registra `@fastify/cors` con un `delegator` por petición (ver CORS). |
| api | `apps/api/src/app.ts` | `await app.register(corsPlugin, { origins: config.CORS_ORIGINS })` justo después de `helmet` y antes de `rateLimit` y `authPlugin`; importa `isApiRequest` de `lib/http.ts`. |
| docs | `docs/self-hosting.md` | Fila `CORS_ORIGINS` en «Variables de entorno». |
| docs | `docs/PLAN.md` | En «Decisiones tomadas»: sesión por token (`bearer`, firmada) para clientes nativos, CORS solo en `/api/*` sin credenciales y lista `CORS_ORIGINS`. |
| test | `apps/api/test/mobile-auth.test.ts` (nuevo) | Ver `tasks.md`. |

`plugins/auth.ts`, los módulos, la web y la BD **no cambian**. El puente `/api/auth/*` ya copia todas las cabeceras de Better Auth salvo `set-cookie`, así que `set-auth-token` llega al cliente.

## Configuración

```ts
const DEFAULT_CORS_ORIGINS = 'capacitor://localhost,https://localhost';
// esquema://host[:puerto], sin ruta, query ni barra final. `new URL().origin` no sirve: es "null" en esquemas no especiales (capacitor://).
const ORIGIN = /^[a-z][a-z0-9+.-]*:\/\/[^/?#\s*]+$/i;

CORS_ORIGINS: z.string().default(DEFAULT_CORS_ORIGINS)
  .transform((value) => value.split(',').map((o) => o.trim()).filter(Boolean))
  .pipe(z.array(z.string().regex(ORIGIN, 'Expected a comma-separated list of origins (scheme://host[:port])'))),
```

`Config['CORS_ORIGINS']` es `string[]`; `''` → `[]`. Entra en `ENV_VARIABLES` automáticamente, así que `config-docs.test.ts` exige la fila en `self-hosting.md` (R16).

## CORS (`plugins/cors.ts`)

```ts
export default fp(async (app, { origins }: { origins: string[] }) => {
  await app.register(cors, {
    delegator(request, callback) {
      const origin = request.headers.origin;
      const allowed = isApiRequest(request.url) && origin !== undefined && origins.includes(origin);
      callback(null, allowed
        ? { origin, credentials: false, methods: ['GET','POST','PUT','PATCH','DELETE'],
            allowedHeaders: ['authorization','content-type'],
            exposedHeaders: ['set-auth-token','content-disposition'], maxAge: 600 }
        : { origin: false });
    },
  });
});
```

- La comparación la hace el `delegator` (igualdad exacta de cadena); con `origin: false` el plugin no añade ninguna cabecera y su ruta `OPTIONS *` delega en el `notFoundHandler` → 404 `problem+json` (R8, R10).
- Las cabeceras se ponen en `onRequest`, antes de `authenticate`, así que también van en los 401/404 (R6): la app puede leer el error.
- `content-disposition` se expone porque `api.download` (`lib/api-client.ts`) saca de ahí el nombre del fichero; lo necesitará #50.

## Contrato HTTP (cliente nativo)

| Paso | Petición | Respuesta |
|---|---|---|
| Login | `POST /api/auth/sign-in/email`, `Origin: capacitor://localhost`, `{ email, password }` | 200 `{ token, user, … }` + `set-auth-token: <token>.<firma>` (+ `set-cookie`, que la app ignora). Origen no de confianza → 403. Cuenta desactivada → 403. |
| Uso | Cualquier ruta protegida con `Authorization: Bearer <set-auth-token>` | Igual que con cookie. Sin token / token inválido / sin firmar / sesión borrada → 401. Recurso ajeno → 404. |
| Logout | `POST /api/auth/sign-out` con el token | 200; la sesión se borra. |

## Impacto en UI

Ninguno. La web sigue en el mismo origen con cookie: no envía `Origin` de un tercero (no recibe cabeceras CORS) ni `Authorization`. Las respuestas de login llevan además `set-auth-token`, que la web ignora.

## Alternativas descartadas

- **CORS a mano** con un hook `onRequest` + ruta `OPTIONS`: unas 30 líneas propias (Vary, preflight estricto, max-age) que `@fastify/cors` ya resuelve y mantiene; el `delegator` da el mismo control por ruta.
- **Token en la query** (`?token=…`) para que `<img src>` funcione sin cabeceras: el token acabaría en logs, historial y `Referer`. La app cargará los ficheros con `fetch` + blob (#50), que sí puede enviar `Authorization`.
- **`requireSignature: false`** (por defecto): aceptaría también el `token` sin firmar del cuerpo del login, que es el valor guardado tal cual en `session.token`; quien lea la BD podría suplantar sesiones sin conocer `AUTH_SECRET`.
- **`credentials: true`** en CORS: la app no usa cookies, y permitir credenciales desde `https://localhost` abriría la sesión de cookie de la web a cualquier página servida en ese origen.

## Decisiones a validar

1. **Nombre y valor por defecto:** `CORS_ORIGINS`, por defecto `capacitor://localhost,https://localhost` para que la APK funcione sin configurar nada; `CORS_ORIGINS=` (vacía) lo desactiva. La alternativa era vacía por defecto (opt-in).
2. **Origen no permitido → sin cabeceras CORS** (el navegador bloquea) y su preflight → 404 `problem+json`, no 403.
3. **Solo tokens firmados** (`requireSignature: true`), ver alternativas.
4. **Sin `Access-Control-Allow-Credentials`.**
5. **Nueva dependencia** `@fastify/cors`.

## Riesgos

- `trustedOrigins` también valida `callbackURL`/`redirectTo` de Better Auth: los orígenes nativos pasan a ser destinos de redirección válidos. Hoy no se usan flujos con redirección (solo email + contraseña).
- Helmet envía `Cross-Origin-Resource-Policy: same-origin`; solo bloquea cargas `no-cors` (`<img src>` de otro origen), no `fetch` con CORS. Por eso #50 usa blob; no se relaja aquí.
- Los preflight cuentan para el rate limit de `/api` (300/min); `maxAge: 600` los reduce.
- Los tipos `Auth`/`SessionUser` se infieren de `betterAuth(...)`: comprobar en `typecheck` que `bearer` no los altera.

## Fuera de alcance

- Cliente web con URL base y token (#50), proyecto Capacitor (#51).
- `cookieCache` de Better Auth (seguiría sin usarse; con él un token borrado valdría hasta que caduque la caché).
- Rotar o listar tokens desde la UI; el token caduca como la sesión (`expiresIn` por defecto de Better Auth).
