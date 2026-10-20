# Requirements — attachment-preview

> Feature 12 (fase 3). Ver una factura sin descargarla: la API sirve el original también en línea, de forma segura para contenido de usuario en el mismo origen, y la web abre las imágenes en un visor propio y los PDF en una pestaña nueva con el visor del navegador.
> `F = GET /api/vehicles/:id/maintenance/:recordId/attachments/:attachmentId` (descarga del original, feature 5). «Factura» = `Attachment` de `@ikrive/shared`; `url` es `F` y la URL en línea es `url + '?inline=1'`.

## R1
CUANDO el propietario pide `F?inline=1`, el sistema DEBE responder 200 con el contenido original y `Content-Disposition: inline; filename="…"; filename*=UTF-8''…` con su nombre original.

## R2
CUANDO el propietario pide `F` sin `inline` o con `inline=0`, el sistema DEBE responder con `Content-Disposition: attachment; filename="…"; filename*=UTF-8''…`, como hasta ahora.

## R3
SI `inline` trae un valor distinto de `0` o `1` ENTONCES el sistema DEBE responder 400 `application/problem+json`.

## R4
CUANDO el sistema sirve un adjunto en línea, el sistema DEBE enviar como `Content-Type` el mime detectado por contenido al subirlo, no el declarado por el cliente.

## R5
CUANDO el sistema sirve un adjunto en línea, el sistema DEBE enviar `X-Content-Type-Options: nosniff`.

## R6
CUANDO el sistema sirve una imagen en línea, el sistema DEBE enviar `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; sandbox`.

## R7
CUANDO el sistema sirve un PDF en línea, el sistema DEBE enviar `Content-Security-Policy: default-src 'none'; object-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`.

## R8
SI quien pide `F?inline=1` no es el propietario del adjunto, o el adjunto no pertenece a ese vehículo y mantenimiento, ENTONCES el sistema DEBE responder 404 `application/problem+json` sin el contenido.

## R9
SI se pide `F?inline=1` sin sesión ENTONCES el sistema DEBE responder 401 `application/problem+json`.

## R10
CUANDO el usuario pulsa una factura de imagen en el diálogo de facturas, el sistema DEBE abrir un visor dentro de la app con su nombre y un `<img>` cuyo `src` es la URL en línea y cuyo `alt` es su nombre original.

## R11
El sistema DEBE mostrar cada factura PDF del diálogo como un enlace a su URL en línea con `target="_blank"` y `rel="noopener noreferrer"`.

## R12
El sistema DEBE ofrecer en cada factura del diálogo un enlace «Descargar» a su `url` (sin `inline`) con el atributo `download`.

## R13
MIENTRAS el visor de imagen está abierto, el sistema DEBE ofrecer un enlace «Descargar» a la `url` de la factura con el atributo `download`.

## R14
SI la imagen del visor no se puede cargar ENTONCES el sistema DEBE mostrar un mensaje de error con `role="alert"` en el visor.

## R15
CUANDO el usuario cierra el visor, el sistema DEBE dejar abierto el diálogo de facturas.

## R16
El sistema DEBE definir todos los textos nuevos en `es.json` y en `en.json`.

## R17
El sistema DEBE mostrar el visor y las acciones de cada factura sin desbordamiento horizontal a 375 px y legibles en modo claro y oscuro.

## Trazabilidad acceptance → requirements

| Criterio de `feature_list.json` | Requirements |
|---|---|
| La API permite servir un adjunto en línea (`?inline=1`, `Content-Disposition: inline`), manteniendo la descarga por defecto | R1, R2, R3 |
| La respuesta en línea es segura para contenido de usuario en el mismo origen (nosniff, mime validado por contenido, CSP restrictiva) | R4, R5, R6, R7 |
| Solo el propietario puede ver un adjunto en línea (404 al resto) | R8, R9 |
| Desde el diálogo, una imagen se abre ampliada en un visor y un PDF en una pestaña nueva | R10, R11, R14, R15 |
| Sigue existiendo una acción explícita para descargar el original | R2, R12, R13 |
| Todos los textos están en es.json y en.json | R16 |
| Tests de integración (respuesta en línea y autorización) y de componente (apertura del visor) | R1, R4, R5, R6, R7, R8, R10 |
| `pnpm harness --full` pasa en verde | todos (T11) |
| (Convención de la fase: UI móvil y modo oscuro) | R17 |
