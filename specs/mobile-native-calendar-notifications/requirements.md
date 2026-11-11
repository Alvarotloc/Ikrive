# Requirements — mobile-native-calendar-notifications

Feature #52 (fase 8, etapa 1). En la APK, «Añadir al calendario» de una regla crea el evento en el calendario del teléfono y los avisos nuevos de la bandeja salen como notificaciones locales de Android. En la web todo sigue igual.

«App nativa» = `isNativeApp()` de `lib/platform.ts` (build `--mode native`). «Web» = cualquier otro build. «Aviso» = elemento de `GET /notifications` (`notificationSchema`).

## Calendario

## R1
MIENTRAS se ejecuta la web, el menú «Añadir al calendario» DEBE ofrecer Google Calendar, Outlook y «Descargar .ics» como hoy, sin cargar el módulo nativo `lib/native-calendar.ts`.

## R2
MIENTRAS se ejecuta la app nativa, el menú «Añadir al calendario» DEBE mostrar la opción «Calendario del teléfono» (`schedules.calendar.device`) en lugar de «Descargar .ics».

## R3
CUANDO el usuario elige «Calendario del teléfono», el sistema DEBE abrir la pantalla de nuevo evento del calendario del sistema con el título y la descripción del evento de `scheduleCalendarEvent` de `packages/shared`, de día completo.

## R4
`calendarPromptOptions(event)` DEBE devolver `isAllDay: true`, `startDate` = medianoche local de `event.date` y `endDate` = `startDate` (en milisegundos), para que la app de calendario muestre el evento en un solo día.

## R5
SI abrir el calendario del sistema falla ENTONCES el sistema DEBE mostrar un toast de error `schedules.calendar.deviceError`.

## Notificaciones locales

## R6
MIENTRAS se ejecuta la web, el sistema NO DEBE cargar el módulo nativo `lib/native-notifications.ts` ni mostrar la tarjeta «Notificaciones del teléfono».

## R7
CUANDO la app nativa monta el layout autenticado, el permiso de notificaciones está sin decidir (`prompt`) y el dispositivo no lo ha pedido antes, el sistema DEBE pedir el permiso una vez y recordar en `localStorage` que ya lo pidió.

## R8
CUANDO llega una lista de avisos con avisos nuevos y el permiso está concedido, el sistema DEBE mostrar una notificación local inmediata por cada aviso nuevo, con su `title` y `body`.

## R9
`selectNewNotifications` DEBE considerar nuevo un aviso solo si `readAt` es `null`, su `id` no está entre los vistos y su `createdAt` no es anterior a la marca de corte.

## R10
CUANDO no hay estado de deduplicación guardado para el usuario (primer arranque), el sistema DEBE guardar los avisos actuales como vistos y su `createdAt` máximo como marca de corte sin notificar ninguno.

## R11
CUANDO se procesa una lista de avisos, con o sin permiso, el sistema DEBE guardar el estado nuevo (marca de corte y vistos) antes de mostrar notificaciones, de modo que un refetch, un remontaje o un reinicio no repitan ninguna.

## R12
`notificationIntId(uuid)` DEBE devolver el mismo entero entre 1 y 2³¹−1 para el mismo UUID.

## R13
El sistema DEBE guardar el estado de deduplicación en `localStorage` por id de usuario (`ikrive.deviceNotifications.<userId>`).

## R14
MIENTRAS el permiso de notificaciones no está concedido, el sistema NO DEBE mostrar notificaciones locales.

## R15
SI mostrar una notificación local falla ENTONCES el sistema DEBE ignorar el error sin toast y sin afectar a la bandeja.

## Ajustes

## R16
MIENTRAS se ejecuta la app nativa, la página de ajustes DEBE mostrar la tarjeta «Notificaciones del teléfono» con el estado del permiso (activadas, sin pedir o denegadas).

## R17
MIENTRAS el permiso está sin decidir, la tarjeta DEBE mostrar el botón «Permitir notificaciones», que pide el permiso y pinta el estado resultante.

## R18
MIENTRAS el permiso está denegado, la tarjeta DEBE explicar cómo activarlo en los ajustes de Android (`deviceNotifications.denied`).

## Plataforma, i18n y docs

## R19
`apps/mobile/package.json` DEBE declarar `@capacitor/local-notifications` y `@ebarooni/capacitor-calendar` con la misma versión exacta que `apps/web/package.json`.

## R20
`AndroidManifest.xml` NO DEBE dejar en el APK el permiso `SCHEDULE_EXACT_ALARM` ni declarar permisos de calendario (`READ_CALENDAR`, `WRITE_CALENDAR`).

## R21
El sistema DEBE tener todos los textos nuevos en `es.json` y `en.json`.

## R22
`docs/mobile.md` NO DEBE listar las notificaciones del sistema ni el calendario nativo como limitación conocida.

## R23
`docs/mobile.md` DEBE indicar que las notificaciones locales solo llegan mientras la app está abierta y remitir a los canales de notificación para recibirlas con la app cerrada.

## Acceptance → requirements

| Criterio de `feature_list.json` | Requirements |
|---|---|
| En la app móvil, «Añadir al calendario» de una regla crea el evento en el calendario del teléfono con las funciones de packages/shared de la fase 4; en la web se mantiene el comportamiento actual | R1, R2, R3, R4, R5, R19, R20 |
| La app pide permiso de notificaciones y muestra una notificación local por cada aviso nuevo de la bandeja (sin duplicados) | R7, R8, R9, R10, R11, R12, R13, R19, R20, R23 |
| Sin permiso concedido, la app sigue funcionando y lo indica | R14, R15, R16, R17, R18 |
| Todos los textos están en es.json y en.json | R21 |
| Tests unitarios o de componente cubren la elección entre calendario nativo y web y la deduplicación de notificaciones locales | R1, R2, R6 (elección), R9–R13 (deduplicación) |
| pnpm harness --full pasa en verde | última task de `tasks.md` |
| (fase 8, `docs/mobile.md` «Limitaciones conocidas») | R22, R23 |
