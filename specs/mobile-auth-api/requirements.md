# Requirements — mobile-auth-api

> Feature 49 (fase 8, etapa 1 «Mi servidor»). La API acepta a un cliente nativo (Capacitor) de otro origen: sesión por token (plugin `bearer` de Better Auth) además de la cookie, CORS en `/api/*` y `trustedOrigins` configurables. Solo `apps/api` y docs; sin cambios en BD, `packages/shared` ni web.
> **Token** = valor de la cabecera `set-auth-token` del login. **Con token** = `Authorization: Bearer <token>` y sin cookie. **Lista** = orígenes de `TRUSTED_ORIGINS`. **Origen permitido** = origen de la lista. **Ficheros** = `GET /api/vehicles/:id/photo`, `GET …/attachments/:attachmentId` y `GET …/attachments/:attachmentId/thumbnail`.

## Configuración

## R1
El sistema DEBE leer `TRUSTED_ORIGINS` como una lista de orígenes separados por comas (ignorando espacios y elementos vacíos), con `capacitor://localhost,https://localhost` por defecto y lista vacía cuando la variable es una cadena vacía.

## R2
SI algún elemento de `TRUSTED_ORIGINS` no es un origen `esquema://host[:puerto]` (con ruta, query, fragmento o `*`) ENTONCES el sistema DEBE negarse a arrancar con un error `Invalid configuration` que nombre `TRUSTED_ORIGINS`.

## R3
El sistema DEBE documentar `TRUSTED_ORIGINS` en la tabla de variables de `docs/self-hosting.md`.

## Sesión por token

## R4
CUANDO un cliente inicia sesión o se registra por email y contraseña, el sistema DEBE devolver el token de sesión en la cabecera `set-auth-token`.

## R5
CUANDO una petición a una ruta autenticada de `/api` llega con token válido, el sistema DEBE atenderla como al usuario de esa sesión, igual que con su cookie.

## R6
SI el token no existe, está mal formado, su firma no es válida o su sesión caducó ENTONCES el sistema DEBE responder 401 `application/problem+json`.

## R7
CUANDO el cliente cierra sesión (`POST /api/auth/sign-out`) con su token, el sistema DEBE invalidar esa sesión, de modo que el mismo token reciba 401 después.

## R8
MIENTRAS una cuenta está desactivada, el sistema DEBE responder 401 a las peticiones con un token emitido antes de desactivarla.

## R9
SI una cuenta desactivada intenta iniciar sesión desde un origen permitido ENTONCES el sistema DEBE responder 403 sin cabecera `set-auth-token`.

## Ficheros con token

## R10
CUANDO el propietario pide un fichero con token, el sistema DEBE servirlo con el mismo estado, cuerpo, `content-type` y `cache-control` que con su cookie.

## R11
SI un fichero pertenece a otro usuario ENTONCES el sistema DEBE responder 404 `application/problem+json` a la petición con token.

## R12
SI se pide un fichero sin cookie ni token ENTONCES el sistema DEBE responder 401.

## CORS

## R13
CUANDO llega un preflight `OPTIONS` a una ruta `/api/*` (incluida `/api/auth/*`) desde un origen permitido, el sistema DEBE responder 204 con `access-control-allow-origin` igual a ese origen, `access-control-allow-methods` con `GET, POST, PUT, PATCH, DELETE` y `access-control-allow-headers` con `authorization` y `content-type`.

## R14
CUANDO una petición a `/api/*` llega desde un origen permitido, la respuesta, también la de error (401, 404), DEBE llevar `access-control-allow-origin` igual a ese origen, `vary: Origin` y `access-control-expose-headers` con `set-auth-token` y `content-disposition`.

## R15
SI el origen de una petición o preflight a `/api/*` no está en la lista (o la lista está vacía) ENTONCES el sistema NO DEBE incluir ninguna cabecera `access-control-allow-*` en la respuesta.

## R16
El sistema NO DEBE enviar `access-control-allow-credentials` en ninguna respuesta.

## R17
SI una petición fuera de `/api/*` (SPA, estáticos) llega desde un origen permitido ENTONCES el sistema NO DEBE incluir cabeceras `access-control-*` en la respuesta.

## Better Auth

## R18
CUANDO un origen permitido envía el login a `/api/auth/*`, el sistema DEBE aceptarlo como origen de confianza (200), además de `BASE_URL`.

## R19
SI un origen que no es `BASE_URL` ni está en la lista envía el login ENTONCES el sistema DEBE responder 403 sin crear sesión.

## Web

## R20
CUANDO la web inicia sesión desde `BASE_URL`, el sistema DEBE seguir emitiendo la cookie de sesión `httpOnly` y autenticando con ella las rutas de `/api`.

## Acceptance → requirements

| Criterio de `feature_list.json` | Requirements |
|---|---|
| Un cliente puede iniciar sesión y obtener un token de sesión (plugin bearer) y usarlo en `Authorization` en todas las rutas autenticadas | R4, R5, R6, R7 |
| La web sigue funcionando con cookie y sin cambios de comportamiento | R20, R16, R17 (y la suite existente en verde) |
| CORS (con preflight) para los orígenes de Capacitor y `trustedOrigins`; lista configurable por env validada con zod, documentada en `docs/self-hosting.md`, y vacía no abre CORS | R1, R2, R3, R13, R14, R15, R18, R19 |
| Foto, miniaturas y facturas con el token, solo para su propietario (404 al resto) | R10, R11, R12 |
| Las cuentas desactivadas no pueden usar sus tokens | R8, R9 |
| Tests de integración: login por token, CORS (permitido y no permitido), ficheros con token y autorización | R4–R19 (tests en `tasks.md`) |
| `pnpm harness --full` pasa en verde | última task de `tasks.md` |
