# Requirements — mobile-local-reminders

> Feature 67 (fase 8, etapa 2, parte 4 de 5). Decisión de `docs/PLAN.md`: sin jobs; los recordatorios se calculan al abrir la app o volver a primer plano con las funciones puras de `packages/shared`, se guardan en la bandeja local y se muestran con las notificaciones locales de #52.
> **Modo local** = `isLocalMode()` en la app nativa. **Bandeja local** = la tabla `notifications` de la SQLite del dispositivo (ya existe por la migración 0005). **Ajustes del usuario local** = la fila `user_settings` de `LOCAL_USER_ID` (`timezone`, `reminderHour`, `odometerReminderWeekday`). **Hora local** = la hora en `timezone`. **Vehículo activo** = sin `soldAt` ni `archivedAt`. **Lista** = `dataSource().notifications.list()`.

## A. Generación en el dispositivo

## R1
CUANDO se pide la lista en modo local con la hora local en `reminderHour` o después, el sistema DEBE guardar en la bandeja local, antes de leerla, una notificación por cada plan próximo o vencido de un vehículo activo, con el `type`, `title`, `body`, `link`, `vehicleId` y `dedupeKey` que devuelve `scheduleReminderNotification` para el día de hoy en `timezone`.

## R2
MIENTRAS la hora local es anterior a `reminderHour`, el sistema NO DEBE guardar recordatorios de planes ni aviso de km al pedir la lista.

## R3
El sistema NO DEBE generar recordatorios de planes de vehículos archivados o vendidos ni incluir esos vehículos en el aviso de km.

## R4
CUANDO se pide la lista en modo local en el día `odometerReminderWeekday` (en `timezone`) con la hora local en `reminderHour` o después, el sistema DEBE guardar el aviso de km que devuelve `odometerNudgeNotification` para los vehículos activos (fecha de su última lectura, o de alta si no tienen), si hay alguno pendiente.

## R5
MIENTRAS `odometerReminderWeekday` es `null`, el sistema NO DEBE generar el aviso de km.

## R6
SI ya existe en la bandeja local una notificación con la misma `dedupeKey` (leída o no) ENTONCES el sistema NO DEBE guardar otra.

## R7
El sistema DEBE ejecutar la generación y la lectura de la lista como una sola operación de la cola serie del `DataSource` local, sin intercalar sentencias con otras operaciones.

## B. Bandeja local

## R8
CUANDO se pide la lista en modo local, el sistema DEBE devolver las 20 notificaciones más recientes del usuario local (`createdAt` desc, `id` desc) con `total` y `unreadCount` de toda la bandeja, conforme a `notificationListSchema`.

## R9
CUANDO se marca como leída una notificación local, el sistema DEBE fijar su `readAt` solo si era nulo y devolverla conforme a `notificationSchema`.

## R10
SI se marca como leída una notificación que no existe en la bandeja local ENTONCES el sistema DEBE rechazar con un Problem 404 `Notification not found`.

## R11
CUANDO se marcan todas como leídas en modo local, el sistema DEBE fijar `readAt` en todas las notificaciones locales sin leer.

## R12
MIENTRAS la app está en modo local, la navegación DEBE mostrar la campana de notificaciones (barra lateral y cabecera móvil).

## C. Disparadores

## R13
CUANDO la app nativa en modo local vuelve a primer plano (evento `resume` de `@capacitor/app`), el sistema DEBE invalidar la lista de notificaciones para que se vuelva a pedir.

## R14
CUANDO el manejador de vuelta a primer plano se desmonta, el sistema DEBE quitar su listener del plugin, también si se desmonta antes de terminar de suscribirse.

## R15
MIENTRAS la app no está en modo local o corre como web/PWA, el sistema NO DEBE escuchar la vuelta a primer plano.

## R16
El sistema DEBE emitir el nuevo módulo `lib/native-app-state.ts` en un chunk de `assets/native/`, fuera del precache del service worker.

## D. Notificaciones del teléfono

## R17
MIENTRAS la app nativa está en modo local, el sistema DEBE mostrar como notificación de Android, con `DeviceNotificationsSync` y las mismas reglas que en modo servidor (`selectNewNotifications`, permiso concedido), cada notificación nueva de la bandeja local, con `extra.userId` igual a `LOCAL_USER_ID`.

## R18
CUANDO el usuario toca una notificación de Android en modo local, el sistema DEBE marcarla como leída en la bandeja local y abrir su enlace, también si la app arranca por el toque antes de instalar el `DataSource` local.

## E. Ajustes

## R19
MIENTRAS la app está en modo local, la página de ajustes DEBE mostrar y guardar el día del aviso de km y la hora de los recordatorios (sustituye a R34 de `mobile-local-core`).

## R20
MIENTRAS la app está en modo local, la ayuda de la hora de los recordatorios DEBE explicar que la app los revisa al abrirla, al volver a ella y mientras está abierta (no un servidor cada hora).

## R21
MIENTRAS la app nativa está en modo local, la página de ajustes DEBE mostrar la tarjeta «Notificaciones del teléfono» con una descripción sin canales de notificación, y seguir ocultando los canales y el feed iCal.

## F. Transversal

## R22
El sistema DEBE definir en `es.json` y `en.json` todos los textos nuevos.

## Acceptance → requirements

| Criterio de `feature_list.json` | Requirements |
|---|---|
| En modo local, al abrir la app o volver a primer plano se generan los mismos recordatorios y avisos de km que generarían los jobs del servidor, sin duplicados | R1, R2, R3, R4, R5, R6, R7, R13, R14, R15, R16 |
| La bandeja de notificaciones funciona en modo local (listar, marcar leída, marcar todas) | R8, R9, R10, R11, R12 |
| Las notificaciones nuevas se muestran con las notificaciones locales nativas | R17, R18, R21 |
| Todos los textos están en es.json y en.json | R20, R22 |
| `pnpm harness --full` pasa en verde | R1–R22 (última task) |

R19 sale de `docs/PLAN.md` (mismas reglas que los jobs, que dependen de `reminderHour` y `odometerReminderWeekday`) y de `specs/mobile-local-core/requirements.md` R34 («ocultos hasta #67»).
