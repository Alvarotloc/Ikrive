# Requirements — disabled-user-public-access

> Feature 45 (fase 7). Surge de la revisión de #37 `admin-users-api`: desactivar una cuenta borra sus sesiones e impide el login, pero lo que funciona por token o en segundo plano sigue sirviendo al usuario. Solo `apps/api`; sin cambios en BD, shared ni web.
> **Desactivado** = usuario con `user.disabled_at` no nulo (#37). **Reactivar** = `POST /api/admin/users/:id/enable`. **Feed** = `GET /api/calendar/<token>.ics`. **Informe público** = `GET /api/public/reports/<token>`. **404 de token inexistente** = la respuesta actual con un token bien formado cuyo selector no existe (`application/problem+json`, mismo `title`/`detail`). Inventario completo de accesos y tareas en `design.md`.

## Feed iCal

## R1
MIENTRAS el dueño de un feed está desactivado, el sistema DEBE responder al feed con su token válido exactamente el mismo 404 (estado, cabeceras de tipo y cuerpo) que con un token inexistente.

## R2
CUANDO se reactiva al dueño de un feed que no se regeneró ni se desactivó, el sistema DEBE volver a servir el feed con el mismo token (200 `text/calendar`).

## Enlaces públicos del informe de venta

## R3
MIENTRAS el dueño del vehículo de un enlace público está desactivado, el sistema DEBE responder al informe público con su token válido exactamente el mismo 404 que con un token inexistente, sin generar el PDF.

## R4
CUANDO se reactiva al dueño, el sistema DEBE volver a servir el PDF de cada enlace que no esté revocado ni caducado con el mismo token.

## R5
SI un enlace caduca o se revoca mientras su dueño está desactivado ENTONCES el sistema DEBE seguir respondiendo 404 a ese enlace tras reactivar al dueño.

## Tokens y cachés

## R6
CUANDO se desactiva o se reactiva una cuenta, el sistema NO DEBE modificar sus filas de `calendar_feeds` ni de `report_shares` (selector, hash del verificador, `expires_at`, `revoked_at`).

## R7
El sistema DEBE enviar `cache-control: private, no-store` también en las respuestas 404 del feed y del informe público, cualquiera que sea el motivo del 404.

## Tareas en segundo plano

## R8
MIENTRAS un usuario está desactivado, el job `reminders` NO DEBE crear notificaciones in-app de sus mantenimientos ni contarlos en `evaluated`, y DEBE seguir notificando a los usuarios activos en la misma ejecución.

## R9
MIENTRAS un usuario está desactivado, el job `odometer-nudge` NO DEBE crear su notificación semanal ni contarlo en `evaluated`, y DEBE seguir avisando a los usuarios activos en la misma ejecución.

## R10
CUANDO se reactiva a un usuario, la siguiente ejecución de `reminders` DEBE crear las notificaciones de sus mantenimientos pendientes o vencidos como para cualquier usuario activo.

## R11
CUANDO se reactiva a un usuario, la siguiente ejecución de `odometer-nudge` en su día y hora de aviso DEBE crear su notificación como para cualquier usuario activo.

## R12
SI el dispatcher recibe notificaciones de un usuario desactivado ENTONCES el sistema NO DEBE enviarlas por ninguno de sus canales ni modificar su `last_error`.

## Acceptance → requirements

| Criterio de `feature_list.json` | Requirements |
|---|---|
| Mientras el dueño está desactivado, el feed iCal y los enlaces públicos de informe responden 404 (igual que un token inexistente, sin revelar el motivo) | R1, R3, R7 |
| Al reactivar la cuenta, el feed y los enlaces que no estuvieran revocados ni caducados vuelven a funcionar con el mismo token | R2, R4, R5, R6 |
| Se revisa si existe algún otro acceso por token o tarea en segundo plano (recordatorios, notificaciones push) que deba omitir a los usuarios desactivados y se aplica el mismo criterio | R8, R9, R10, R11, R12 (inventario en `design.md`) |
| Tests de integración cubren feed y enlaces con el dueño desactivado y reactivado | R1–R7 (tests en `tasks.md`) |
| pnpm harness --full pasa en verde | última task de `tasks.md` |
