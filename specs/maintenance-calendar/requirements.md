# Requirements — maintenance-calendar

> Feature 19 (fase 4). Lleva los próximos mantenimientos al calendario del usuario sin calendario propio: una acción «Añadir al calendario» por regla (Google, Outlook y `.ics`) y un feed iCal personal con token. Reutiliza `computeScheduleDue` y el DTO `MaintenanceSchedule` (#13, #14).
> «Regla con fecha» = regla cuyo `nextDueDate` (real o estimada) no es `null`. «Evento de la regla» = el que construyen las funciones puras de `packages/shared/src/domain/calendar.ts`. «Enlace a la ficha» = `<base>/vehicles/<vehicleId>` (en la web, `window.location.origin`; en el feed, `BASE_URL`). «Vehículo activo» = ni vendido ni archivado.

## Evento (funciones puras en `packages/shared`)

## R1
CUANDO se construye el evento de una regla con fecha, el sistema DEBE devolver un evento de día completo cuya fecha es `nextDueDate`, sea real o estimada.

## R2
CUANDO se construye el evento de una regla con fecha, el sistema DEBE usar como título `<título de la regla> · <nombre del vehículo>`.

## R3
CUANDO la regla tiene `nextDueOdometer`, el sistema DEBE incluir en la descripción del evento los km de vencimiento formateados en el idioma y la unidad de distancia indicados.

## R4
CUANDO se construye el evento de una regla con fecha, el sistema DEBE incluir el enlace a la ficha del vehículo en la descripción y en la propiedad `url` del evento.

## R5
SI la regla no tiene `nextDueDate` ENTONCES el sistema DEBE devolver `null` en lugar de un evento.

## R6
El sistema DEBE asignar a cada evento un UID derivado únicamente del id de la regla (`schedule-<id>@ikrive`).

## R7
CUANDO se pide el enlace de Google Calendar de un evento, el sistema DEBE devolver una URL `https://calendar.google.com/calendar/render?action=TEMPLATE` con `text`, `details` y `dates=<AAAAMMDD>/<AAAAMMDD del día siguiente>`.

## R8
CUANDO se pide el enlace de Outlook de un evento, el sistema DEBE devolver una URL `https://outlook.live.com/calendar/0/action/compose` con `subject`, `body`, `startdt`, `enddt` (día siguiente) y `allday=true`.

## R9
CUANDO se serializa una lista de eventos a iCalendar, el sistema DEBE producir un `VCALENDAR` conforme a RFC 5545: líneas terminadas en CRLF, plegadas a 75 octetos, texto escapado (`\`, `;`, `,`, saltos de línea), `VERSION`, `PRODID` y por evento `UID`, `DTSTAMP` en UTC, `DTSTART;VALUE=DATE` y `DTEND;VALUE=DATE` del día siguiente.

## Acción «Añadir al calendario» (web)

## R10
El sistema DEBE mostrar en cada regla de la ficha del vehículo una acción «Añadir al calendario» con tres opciones: Google Calendar, Outlook y descargar `.ics`.

## R11
CUANDO el usuario elige Google Calendar u Outlook, el sistema DEBE abrir en una pestaña nueva el enlace correspondiente del evento de la regla.

## R12
CUANDO el usuario elige descargar `.ics`, el sistema DEBE descargar un fichero `.ics` con el iCalendar del evento de la regla.

## R13
SI la regla no tiene `nextDueDate` ENTONCES el sistema DEBE mostrar la acción desactivada y, al pulsarla, una explicación de que falta una fecha (solo km y sin datos suficientes para estimarla).

## Gestión del feed (API)

## R14
CUANDO un usuario hace `GET /api/settings/calendar-feed`, el sistema DEBE responder 200 con `{ enabled, createdAt }` de su feed.

## R15
CUANDO un usuario hace `POST /api/settings/calendar-feed`, el sistema DEBE generar un token nuevo y responder 200 con `{ enabled: true, createdAt, url }`, donde `url` es `<BASE_URL>/api/calendar/<token>.ics`.

## R16
CUANDO un usuario con feed activo hace `POST /api/settings/calendar-feed`, el sistema DEBE invalidar el token anterior, de modo que su URL responda 404.

## R17
CUANDO un usuario hace `DELETE /api/settings/calendar-feed`, el sistema DEBE desactivar su feed y responder 204, de modo que su URL responda 404.

## R18
SI una petición a `/api/settings/calendar-feed` no tiene sesión ENTONCES el sistema DEBE responder 401 `application/problem+json`.

## R19
El sistema DEBE guardar del token solo el selector y el hash SHA-256 del verificador, nunca el token en claro.

## R20
CUANDO se valida un token del feed, el sistema DEBE comparar el hash del verificador con `crypto.timingSafeEqual`.

## Feed iCal (API)

## R21
CUANDO se hace `GET /api/calendar/<token>.ics` con un token válido, el sistema DEBE responder 200 `text/calendar; charset=utf-8` sin requerir sesión.

## R22
CUANDO se sirve el feed, el sistema DEBE incluir exactamente un evento por cada regla con fecha de los vehículos activos del dueño del token.

## R23
CUANDO una regla cambia entre dos peticiones al feed, el sistema DEBE mantener el mismo UID en su evento.

## R24
SI el token del feed no existe, está desactivado, fue regenerado o la ruta no termina en `.ics` ENTONCES el sistema DEBE responder 404 `application/problem+json`.

## R25
CUANDO se sirve el feed, el sistema DEBE construir los textos de los eventos con el idioma, la zona horaria («hoy») y la unidad de distancia de los ajustes del dueño.

## Ajustes (web)

## R26
MIENTRAS el feed está desactivado, el sistema DEBE mostrar en Ajustes una sección «Calendario» con un botón para activarlo.

## R27
El sistema DEBE mostrar en la sección «Calendario» un texto que explique que Google Calendar necesita que el servidor sea accesible desde internet y que Apple Calendar, Thunderbird o ICSx5 sirven en red local o VPN.

## R28
CUANDO el usuario activa o regenera el feed, el sistema DEBE mostrar la URL devuelta en un campo de solo lectura con un botón para copiarla.

## R29
CUANDO el usuario confirma «Regenerar» en el diálogo que avisa de que la URL anterior dejará de funcionar, el sistema DEBE enviar `POST /settings/calendar-feed`.

## R30
CUANDO el usuario confirma «Desactivar», el sistema DEBE enviar `DELETE /settings/calendar-feed` y volver al estado desactivado.

## R31
El sistema DEBE definir todos los textos nuevos de la interfaz en `es.json` y `en.json` con las mismas claves.

## Trazabilidad acceptance → requirements

| Acceptance | Requirements |
|---|---|
| Acción «Añadir al calendario» por regla con Google, Outlook y `.ics` | R10, R11, R12, R7, R8 |
| Evento de día completo, título regla + vehículo, km, enlace; sin fecha → desactivada y explica por qué | R1, R2, R3, R4, R5, R13 |
| Construcción del evento, enlaces e `.ics` RFC 5545 como funciones puras en shared con tests | R1–R9 |
| Feed en Ajustes: activar, copiar, regenerar, desactivar; texto sobre Google | R14, R15, R16, R17, R26, R27, R28, R29, R30 |
| `GET /api/calendar/:token.ics` sin sesión, `text/calendar`, un evento por regla con fecha de vehículos activos, UID estable, 404 | R21, R22, R23, R24, R25, R6 |
| Token hasheado y comparado en tiempo constante | R19, R20 |
| Textos en es.json y en.json | R31 |
| Tests de integración del feed y test de componente de la acción | R16, R17, R21–R24, R10–R13 (ver `tasks.md`) |
| `pnpm harness --full` en verde | Última task |
