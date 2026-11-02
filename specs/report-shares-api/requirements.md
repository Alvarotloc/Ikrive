# Requirements — report-shares-api

> Feature 32 (fase 6). Enlaces públicos de solo lectura al informe de venta de #29/#30.
> «Enlace» = fila de `report_shares`. «Token» = selector + verificador en hex (80 caracteres, patrón de `calendar_feeds`). «Ruta pública» = `GET /api/public/reports/:token`. «Rutas de gestión» = `POST`/`GET /api/vehicles/:id/report-shares` y `DELETE /api/vehicles/:id/report-shares/:shareId`.

## Datos

## R1
El sistema DEBE guardar cada enlace en la tabla `report_shares` (`id`, `vehicle_id` → `vehicles.id`, `selector` único, `verifier_hash`, `hide_prices`, `hide_plate`, `hide_vin`, `include_invoices`, `expires_at`, `revoked_at` nullable, `created_at`), creada por una migración generada con drizzle-kit.

## R2
CUANDO se borra un vehículo, el sistema DEBE borrar sus enlaces en cascada.

## R3
El sistema NO DEBE guardar el token ni el verificador en claro: solo el selector y el SHA-256 en hex del verificador.

## Crear (`POST /api/vehicles/:id/report-shares`)

## R4
El sistema DEBE validar el cuerpo con `createReportShareSchema` de `@ikrive/shared`: `hidePrices`, `hidePlate`, `hideVin` e `includeInvoices` booleanos JSON (por defecto `false`) y `expiresInDays` entero de 1 a 90 (por defecto 30).

## R5
SI el cuerpo no cumple `createReportShareSchema` ENTONCES el sistema DEBE responder 400 `application/problem+json` sin crear ningún enlace.

## R6
CUANDO el propietario crea un enlace válido, el sistema DEBE guardarlo con sus opciones y `expires_at = ahora + expiresInDays × 24 h` y responder 201 con el enlace y `url` = `<BASE_URL>/api/public/reports/<token>`.

## R7
El sistema NO DEBE devolver el token (ni la `url`) en ninguna respuesta que no sea la 201 de creación.

## Listar y revocar

## R8
CUANDO el propietario pide `GET /api/vehicles/:id/report-shares`, el sistema DEBE devolver todos los enlaces del vehículo, del más reciente al más antiguo, con `id`, sus cuatro opciones, `expiresAt`, `revokedAt`, `createdAt` y `status`.

## R9
El sistema DEBE derivar `status` con `reportShareStatus(share, now)` de `@ikrive/shared`: `revoked` si `revokedAt` no es null; si no, `expired` si `now >= expiresAt`; si no, `active`.

## R10
CUANDO el propietario pide `DELETE /api/vehicles/:id/report-shares/:shareId` sobre un enlace sin revocar, el sistema DEBE fijar `revoked_at` a la fecha actual y responder 204.

## R11
SI el enlace ya estaba revocado ENTONCES el sistema DEBE responder 204 sin cambiar su `revoked_at`.

## Autorización de las rutas de gestión

## R12
SI el vehículo no existe o es de otro usuario ENTONCES las rutas de gestión DEBEN responder 404 `application/problem+json`.

## R13
SI `:shareId` no existe o pertenece a otro vehículo ENTONCES el sistema DEBE responder 404 `application/problem+json` al `DELETE`.

## R14
SI la petición a una ruta de gestión no tiene sesión ENTONCES el sistema DEBE responder 401.

## Ruta pública (`GET /api/public/reports/:token`)

## R15
CUANDO se pide la ruta pública sin sesión con el token de un enlace activo, el sistema DEBE responder 200 `application/pdf` con `Content-Disposition: inline` y el nombre de fichero del informe, generado en ese momento con las opciones guardadas en el enlace y los datos actuales del vehículo.

## R16
SI el token está mal formado, su selector no existe, el verificador no coincide, el enlace está caducado o está revocado ENTONCES el sistema DEBE responder 404 `application/problem+json` con el mismo cuerpo en todos los casos.

## R17
El sistema DEBE comparar el verificador con su hash en tiempo constante (`verifierMatches`, `crypto.timingSafeEqual`).

## R18
CUANDO la ruta pública responde 200, el sistema DEBE enviar `Cache-Control: private, no-store`, `X-Robots-Tag: noindex` y `X-Content-Type-Options: nosniff`.

## R19
SI un cliente supera 10 peticiones por minuto a la ruta pública ENTONCES el sistema DEBE responder 429.

## R20
MIENTRAS el vehículo está archivado o vendido, el sistema DEBE seguir sirviendo el PDF de sus enlaces activos.

## R21
El sistema NO DEBE escribir el token de la ruta pública en los logs de peticiones.

## Acceptance → requirements

| Acceptance (`feature_list.json` #32) | Requirements |
|---|---|
| Tabla `report_shares` (columnas, cascada, selector único, hash, opciones, fechas) + migración drizzle-kit | R1, R2, R3 |
| `POST …/report-shares` autenticado, opciones + caducidad 1–90 (30), 201 con URL completa; token irrecuperable | R4, R5, R6, R7 |
| `GET …/report-shares` sin token, con opciones, caducidad y estado; `DELETE …/:shareId` revoca (204) | R7, R8, R9, R10, R11 |
| 404 si el vehículo o el enlace son de otro usuario | R12, R13, R14 |
| Ruta pública 200 `application/pdf` inline con las opciones; 404 indistinto (inexistente, no coincide, caducado, revocado) | R15, R16, R17, R20, R21 |
| `Cache-Control: no-store`, `X-Robots-Tag: noindex` y rate limit propio | R18, R19 |
| Tests de integración: crear, listar, revocar, público válido, caducado, revocado, manipulado, aislamiento | R6, R8, R10, R12, R15, R16 (T6–T10) |
| `pnpm harness --full` en verde | T11 |
