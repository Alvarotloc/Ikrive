# Requirements — notification-channels

> Feature 16 (fase 4). Canales de notificación externos por usuario (ntfy, Gotify, Apprise vía apprise-api y webhook), CRUD con botón de prueba en Ajustes y envío desde los jobs además de la notificación in-app (#15).
> «Canal» = fila de `notification_channels`. «Canal activo» = `enabled = true`. «Token» = campo secreto `token` de la config (ntfy, Gotify y webhook). «Mensaje» = `ChannelMessage` (ver `design.md`).

## Datos y validación

## R1
El sistema DEBE persistir los canales en la tabla `notification_channels` (`id`, `user_id` con FK a `user` en cascada, `type` `ntfy|gotify|apprise|webhook`, `config` JSON, `enabled`, `last_error` nullable, `created_at` y `updated_at`), creada por una migración generada con drizzle-kit.

## R2
El sistema DEBE validar la config con un esquema zod discriminado por `type`: ntfy `{ serverUrl, topic, token? }`, gotify `{ serverUrl, token }`, apprise `{ serverUrl, key, tag? }` y webhook `{ url, token? }`, donde las URL son `http`/`https`.

## R3
SI el cuerpo de `POST` o `PATCH /api/notification-channels…` no cumple el esquema (tipo desconocido, campo obligatorio ausente, URL no `http(s)`) ENTONCES el sistema DEBE responder 400 `application/problem+json` sin guardar nada.

## API

## R4
CUANDO el usuario hace `GET /api/notification-channels`, el sistema DEBE devolver sus canales ordenados por fecha de creación ascendente.

## R5
CUANDO el usuario hace `POST /api/notification-channels` con un cuerpo válido, el sistema DEBE crear el canal (activo por defecto, `lastError: null`) y responder 201 con él.

## R6
CUANDO el usuario hace `PATCH /api/notification-channels/:id` sobre un canal suyo, el sistema DEBE actualizar `enabled` y/o `config` y responder 200, conservando el token guardado si el cuerpo no trae `token`.

## R7
SI el `type` del cuerpo de `PATCH /api/notification-channels/:id` no coincide con el del canal ENTONCES el sistema DEBE responder 400 `application/problem+json` sin modificarlo.

## R8
CUANDO el usuario hace `DELETE /api/notification-channels/:id` sobre un canal suyo, el sistema DEBE borrarlo y responder 204.

## R9
El sistema NO DEBE incluir el token de un canal en ninguna respuesta de `/api/notification-channels`.

## R10
El sistema DEBE indicar en cada canal devuelto si tiene token guardado mediante `hasToken: boolean`.

## R11
SI el canal de `PATCH`, `DELETE` o `POST …/:id/test` no existe o es de otro usuario ENTONCES el sistema DEBE responder 404 `application/problem+json` sin modificarlo ni enviar nada.

## R12
El sistema NO DEBE incluir canales de otros usuarios en `GET /api/notification-channels`.

## R13
SI la petición a cualquier endpoint de `/api/notification-channels` no tiene sesión ENTONCES el sistema DEBE responder 401.

## R14
CUANDO el usuario hace `POST /api/notification-channels/:id/test` y el envío del mensaje de prueba tiene éxito, el sistema DEBE responder 200 `{ ok: true, error: null }`, también si el canal está desactivado.

## R15
SI el envío de `POST /api/notification-channels/:id/test` falla ENTONCES el sistema DEBE responder 200 `{ ok: false, error }` y guardar ese error en `last_error` del canal.

## Implementaciones de canal

## R16
CUANDO se envía un mensaje por ntfy, el sistema DEBE hacer `POST <serverUrl>/` con JSON `{ topic, title, message, click? }` y `Authorization: Bearer <token>` si hay token.

## R17
CUANDO se envía un mensaje por Gotify, el sistema DEBE hacer `POST <serverUrl>/message` con la cabecera `X-Gotify-Key: <token>` y JSON `{ title, message, priority: 5 }` más `extras["client::notification"].click.url` si hay enlace.

## R18
CUANDO se envía un mensaje por Apprise, el sistema DEBE hacer `POST <serverUrl>/notify/<key>` con JSON `{ title, body, tag? }`, con el enlace al final de `body` si lo hay.

## R19
CUANDO se envía un mensaje por webhook, el sistema DEBE hacer `POST <url>` con JSON `{ event, type, title, body, link, createdAt }` y `Authorization: Bearer <token>` si hay token.

## R20
SI el servicio responde con un estado fuera de 2xx ENTONCES el sistema DEBE dar el envío por fallido con el error `HTTP <status>`.

## R21
SI el servicio no responde en `CHANNEL_TIMEOUT_MS` (10 s) ENTONCES el sistema DEBE abortar la petición y dar el envío por fallido con un error de timeout.

## R22
CUANDO se envía una notificación in-app por un canal, el sistema DEBE componer el mensaje con título `<etiqueta del tipo en el idioma del dueño>: <title>`, cuerpo `<body>` y enlace absoluto `BASE_URL + link`.

## R23
CUANDO se envía un mensaje de prueba, el sistema DEBE usar el texto de prueba en el idioma del dueño (`user_settings.locale`, `es` por defecto) con `event: 'test'`.

## Envío desde los jobs

## R24
CUANDO `runReminders` crea notificaciones in-app, el sistema DEBE enviar cada una por todos los canales activos de su dueño y por ningún canal de otro usuario.

## R25
MIENTRAS un canal está desactivado, el sistema NO DEBE enviar notificaciones por él desde los jobs.

## R26
SI una notificación se omite por `dedupe_key` repetido ENTONCES el sistema NO DEBE enviarla por los canales.

## R27
SI el envío por un canal falla durante un job ENTONCES el sistema DEBE guardar el error en `last_error` de ese canal sin impedir la notificación in-app, el envío por los demás canales ni la resolución de `runReminders`.

## R28
CUANDO un envío por un canal (job o prueba) tiene éxito, el sistema DEBE poner `last_error` de ese canal a `null`.

## Web

## R29
MIENTRAS el usuario está en Ajustes, la web DEBE mostrar la sección «Canales de notificación» con cada canal (etiqueta del tipo, resumen de destino, estado activo y último error si lo hay) o un estado vacío.

## R30
CUANDO el usuario añade un canal, la web DEBE abrir un formulario con selector de tipo y los campos de ese tipo, enviar `POST /notification-channels` y mostrar el canal en la lista.

## R31
CUANDO el usuario edita un canal, la web DEBE abrir el formulario con su config (tipo fijo y token vacío) y enviar `PATCH` sin `token` si el campo se deja vacío.

## R32
CUANDO el usuario cambia el control «Activo» de un canal, la web DEBE enviar `PATCH /notification-channels/:id` con `{ type, enabled }`.

## R33
CUANDO el usuario confirma el borrado de un canal, la web DEBE enviar `DELETE /notification-channels/:id` y quitarlo de la lista.

## R34
CUANDO el usuario pulsa «Probar» en un canal, la web DEBE enviar `POST /notification-channels/:id/test` y mostrar un aviso de éxito o de fallo con el error devuelto.

## R35
SI un campo del formulario de canal no es válido ENTONCES la web DEBE marcarlo con `aria-invalid` y mostrar su mensaje sin enviar la petición.

## R36
SI la API responde con error al guardar un canal ENTONCES la web DEBE mostrar un `role="alert"` en el formulario y mantenerlo abierto.

## R37
La web DEBE tener todos los textos de la feature en `es.json` y `en.json`, con las mismas claves y una etiqueta por cada tipo de `NOTIFICATION_CHANNEL_TYPES`.

## Cambios pedidos en Gate 2

## R38
SI una URL de la config (`serverUrl` o `url`) incluye credenciales (`usuario:contraseña@`) ENTONCES el sistema DEBE rechazarla con un error de validación que indique usar el campo token.

## R39
CUANDO el usuario guarda un canal nuevo desde la sección de Ajustes, la web DEBE mostrarlo en la lista sin recargar la página.

## Acceptance → requirements

| Criterio de `feature_list.json` | Requirements |
|---|---|
| Tabla `notification_channels` con migración; config validada con zod discriminado por tipo | R1, R2, R3 |
| `GET\|POST`, `PATCH\|DELETE /:id`, `POST /:id/test`; solo el propietario (404); secretos no en claro | R4–R15 |
| Cada implementación construye la petición correcta y tiene timeout; tests sin red real | R16–R23 |
| Envío por los canales activos al crear la notificación in-app; fallo parcial guarda `last_error` y no impide lo demás | R24–R28 |
| En Ajustes: añadir, editar, activar/desactivar, borrar y probar; se ven el resultado y el último error | R29–R36 |
| Textos en `es.json` y `en.json` | R37 |
| Tests unitarios por canal, integración de endpoints y fallo parcial, componente de la pantalla | R16–R21, R4–R15, R27, R29–R36 (ver `tasks.md`) |
| `pnpm harness --full` en verde | todas (T última) |
