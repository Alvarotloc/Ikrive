# Requirements — mobile-auth-api

> Feature 49 (fase 8, etapa 1 «Mi servidor»). La API acepta a la app de Capacitor, que corre en otro origen y no tiene la cookie de la web. Solo `apps/api` y docs; sin cambios en BD, shared ni web.
> **Token** = valor firmado (`<token>.<firma>`) que Better Auth devuelve en la cabecera `set-auth-token` al iniciar sesión (plugin `bearer`). **Con token** = con la cabecera `Authorization: Bearer <token>` y sin cookie. **Ruta protegida** = ruta con `app.authenticate` o `app.requireAdmin`. **Origen nativo** = origen incluido en `CORS_ORIGINS`. **Ficheros** = `GET /api/vehicles/:id/photo`, `GET …/attachments/:attachmentId` (con y sin `?inline=1`) y `GET …/attachments/:attachmentId/thumbnail`.

## Sesión por token

## R1
CUANDO un cliente inicia sesión con `POST /api/auth/sign-in/email` y credenciales válidas, el sistema DEBE devolver el token en la cabecera `set-auth-token`.

## R2
CUANDO una petición a una ruta protegida llega con un token válido, el sistema DEBE autenticarla como el dueño de esa sesión, igual que con su cookie (incluido el rol `admin` en `app.requireAdmin`).

## R3
CUANDO un cliente envía `POST /api/auth/sign-out` con token, el sistema DEBE borrar esa sesión, de modo que las peticiones siguientes con el mismo token respondan 401.

## R4
SI una petición a una ruta protegida lleva un token mal formado, con firma no válida o sin firmar (el `token` del cuerpo JSON del login) ENTONCES el sistema DEBE responder 401 `application/problem+json`.

## R5
CUANDO el usuario inicia sesión desde el origen `BASE_URL`, el sistema DEBE fijar la cookie de sesión y aceptarla en las rutas protegidas sin cabecera `Authorization`, como hasta ahora.

## CORS y orígenes de confianza

## R6
CUANDO llega a `/api/*` una petición con `Origin` igual a un origen nativo, el sistema DEBE responder (también en las respuestas de error) con `Access-Control-Allow-Origin` igual a ese origen, `Vary: Origin` y `Access-Control-Expose-Headers` con `set-auth-token` y `content-disposition`.

## R7
CUANDO llega a `/api/*` un preflight (`OPTIONS` con `Access-Control-Request-Method`) desde un origen nativo, el sistema DEBE responder 204 con `Access-Control-Allow-Methods` (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`) y `Access-Control-Allow-Headers` (`authorization`, `content-type`).

## R8
SI una petición o un preflight llega a `/api/*` desde un origen que no es nativo ENTONCES el sistema NO DEBE incluir ninguna cabecera `Access-Control-Allow-*` en la respuesta.

## R9
El sistema NO DEBE enviar `Access-Control-Allow-Credentials` en ninguna respuesta.

## R10
CUANDO llega una petición fuera de `/api/` (SPA servida con `WEB_DIST_DIR`) desde un origen nativo, el sistema NO DEBE incluir cabeceras `Access-Control-*`.

## R11
CUANDO un cliente inicia sesión con `Origin` igual a un origen nativo, el sistema DEBE aceptarlo como origen de confianza de Better Auth (200 con `set-auth-token`).

## R12
SI un cliente inicia sesión con un `Origin` que no es nativo ni `BASE_URL` ENTONCES el sistema DEBE responder 403 sin `set-auth-token`.

## Configuración

## R13
DONDE `CORS_ORIGINS` no está definida, el sistema DEBE usar como orígenes nativos `capacitor://localhost` y `https://localhost`.

## R14
MIENTRAS `CORS_ORIGINS` es la cadena vacía, el sistema NO DEBE confiar en ningún origen además de `BASE_URL` (sin cabeceras CORS y login desde `capacitor://localhost` → 403).

## R15
SI alguna entrada de `CORS_ORIGINS` (separadas por comas) no es un origen `esquema://host[:puerto]` (con ruta o barra final, `*`, sin esquema) ENTONCES `loadConfig` DEBE fallar con `Invalid configuration` mencionando `CORS_ORIGINS`.

## R16
El sistema DEBE documentar `CORS_ORIGINS` (valor por defecto, formato, que la cadena vacía lo desactiva) en la tabla de variables de `docs/self-hosting.md`.

## Ficheros con token

## R17
CUANDO el dueño pide un fichero con su token, el sistema DEBE servirlo con 200 y el mismo `content-type` (y `content-disposition` en las facturas) que con la cookie.

## R18
SI un usuario pide con su token un fichero de un vehículo de otro usuario ENTONCES el sistema DEBE responder 404 `application/problem+json`.

## Cuentas desactivadas

## R19
SI se desactiva la cuenta dueña de un token ENTONCES el sistema DEBE responder 401 a toda petición con ese token, incluidos los ficheros, también después de reactivarla.

## R20
SI una cuenta desactivada inicia sesión desde un origen nativo ENTONCES el sistema DEBE responder 403 sin `set-auth-token`.

## Acceptance → requirements

| Criterio de `feature_list.json` | Requirements |
|---|---|
| Un cliente puede iniciar sesión y obtener un token de sesión (plugin bearer) y usarlo en `Authorization` en todas las rutas autenticadas | R1, R2, R3, R4 |
| La web sigue funcionando con cookie y sin cambios de comportamiento | R5, R9, R10 (y la suite existente en verde) |
| CORS (con preflight) para los orígenes de Capacitor y `trustedOrigins`; lista configurable por entorno validada con zod, documentada en `docs/self-hosting.md`, y vacía no abre CORS a nadie | R6, R7, R8, R11, R12, R13, R14, R15, R16 |
| Foto, miniaturas y facturas con el token, solo para su propietario (404 al resto) | R17, R18 |
| Las cuentas desactivadas no pueden usar sus tokens | R19, R20 |
| Tests de integración: login por token, CORS (permitido y no permitido), ficheros con token y autorización | R1–R20 (tests en `tasks.md`) |
| `pnpm harness --full` pasa en verde | última task de `tasks.md` |
