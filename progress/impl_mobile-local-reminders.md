# Implementación — mobile-local-reminders (#67)

Rama `feat/mobile-local-reminders`. Sin commits (los hace el leader tras Gate 2). Sin cambios en la API, la BD, `packages/shared` ni dependencias.

## Cambios por archivo

| Archivo | Cambio |
|---|---|
| `apps/web/src/lib/data-source/local/settings.ts` | `settingsRow` exportado. |
| `apps/web/src/lib/data-source/local/notifications.ts` (nuevo) | `generateLocalReminders(db, now)`: lee `timezone`/`reminderHour`/`odometerReminderWeekday` del usuario local; si `isReminderTime`, planes de vehículos activos (`innerJoin vehicles`, `ownerId = local`, `soldAt`/`archivedAt` nulos; columnas elegidas una a una, sin homónimas) + `listReadings` por vehículo → `scheduleReminderNotification`; si `isOdometerNudgeTime`, vehículos activos con `max(odometer_readings.date)` → `odometerNudgeNotification`; un solo `insert … onConflictDoNothing(dedupeKey).returning()`; devuelve el nº de nuevas. `localNotifications(db, now)`: `list` (genera y luego página de 20, `createdAt desc, id desc`, `total`, `unreadCount`), `markRead` (404 `Notification not found`, `readAt` solo si nulo), `markAllRead`; `toDto` como el `service.ts` de la API. |
| `apps/web/src/lib/data-source/local/index.ts` | `notifications: serialized(queue, localNotifications(db))`; JSDoc actualizado. |
| `apps/web/src/lib/native-app-state.ts` (nuevo) | `onAppResume(listener)` sobre `App.addListener('resume')`. |
| `apps/web/src/features/pwa/config.ts` | `app-state` en `NATIVE_ONLY_MODULES`. |
| `apps/web/src/features/notifications/local-reminders-refresh.tsx` (nuevo) | `LocalRemindersRefresh` (patrón de `BackButtonHandler`): en `resume` invalida `queryKeys.notifications.all`. |
| `apps/web/src/routes/_app.tsx` | `DeviceNotificationsSync` con `isNativeApp()` en ambos modos; `LocalRemindersRefresh` con `isNativeApp() && isLocalMode()`. |
| `apps/web/src/features/navigation/app-navigation.tsx` | Campana visible también en local (sidebar y cabecera móvil). |
| `apps/web/src/features/notifications/notification-tap-handler.tsx` | `if (isLocalMode()) await activateLocalDataSource()` antes de `fetchQuery(meQuery)`. |
| `apps/web/src/features/notifications/device-notifications-section.tsx` | Descripción `deviceNotifications.descriptionLocal` en local. |
| `apps/web/src/routes/_app/settings.tsx` | Día del aviso de km y hora visibles en ambos modos; ayuda `settings.reminderHourInfoLocal` en local; `DeviceNotificationsSection` con `isNativeApp()` fuera del bloque `!local` (canales y feed iCal siguen ocultos en local). |
| `apps/web/src/i18n/locales/{es,en}.json` | `settings.reminderHourInfoLocal`, `deviceNotifications.descriptionLocal` (textos de `design.md`; en inglés sin comillas). |
| `docs/mobile.md` | Viñeta «Recordatorios y aviso de km» en «En este teléfono» (cuándo se revisan, sin canales, nada con la app cerrada, primera ejecución silenciosa); quitados «recordatorios» y «la campana» de lo que falta; permiso también en local; limitaciones. |
| `docs/PLAN.md` | Estado de #67 en la lista de la etapa 2. |
| Tests | `local/local-notifications.test.ts` (nuevo), `local/local-data-source.test.ts` (fuera las 3 operaciones de `notifications` del 501), `lib/native-app-state.test.ts` (nuevo), `features/pwa/native-only.test.ts`, `features/notifications/local-reminders-refresh.test.tsx` (nuevo), `features/mobile/local-mode.test.tsx` (sustituidos `hides the bell and users and shows switch mode`, `settings hide channels, calendar feed and device notifications`, `settings hide reminder preferences` y `does not sync device notifications`; mock de `native-notifications` con `onNotificationTap` y mock de `native-app-state`). |

## Trazabilidad

| R | Archivo › test |
|---|---|
| R1 | `local-notifications.test.ts` › `stores due soon and overdue reminders with the shared drafts`; `local-mode.test.tsx` › `shows the bell with the local reminders on start` |
| R2 | `local-notifications.test.ts` › `does nothing before the reminder hour`, `uses the user's time zone and reminder hour` |
| R3 | `local-notifications.test.ts` › `skips archived and sold vehicles` |
| R4 | `local-notifications.test.ts` › `stores the odometer nudge on the weekday from the reminder hour` |
| R5 | `local-notifications.test.ts` › `does not nudge on other days or without a weekday` |
| R6 | `local-notifications.test.ts` › `never stores the same reminder twice` |
| R7 | `local-notifications.test.ts` › `notifications` › `list runs through the serial queue` (comprobado que falla si se quita `serialized`) |
| R8 | `local-notifications.test.ts` › `list generates and returns the newest page with totals`, `orders notifications of the same time by id` |
| R9 | `local-notifications.test.ts` › `markRead keeps the first read time`; `local-mode.test.tsx` › `the bell marks one and all as read in local mode` |
| R10 | `local-notifications.test.ts` › `markRead of a missing notification is a 404` |
| R11 | `local-notifications.test.ts` › `markAllRead marks every unread notification`; `local-mode.test.tsx` › `the bell marks one and all as read in local mode` |
| R12 | `local-mode.test.tsx` › `shows the bell with the local reminders on start` |
| R13 | `native-app-state.test.ts` › `calls the listener on every resume and removes it`; `local-reminders-refresh.test.tsx` › `invalidates the notifications on resume`; `local-mode.test.tsx` › `generates reminders when the app comes back to the foreground` |
| R14 | `local-reminders-refresh.test.tsx` › `removes the listener on unmount`, `removes the listener when unmounted before subscribing` |
| R15 | `local-reminders-refresh.test.tsx` › `server mode and web never listen for resume` |
| R16 | `native-only.test.ts` › `sends the app state module to assets/native/` (y `sends every lib/native-*.ts to assets/native/`) |
| R17 | `local-mode.test.tsx` › `shows new local reminders as phone notifications` |
| R18 | `local-mode.test.tsx` › `tapping a phone notification marks it as read and opens its link` (toque en `/welcome` antes de instalar el `DataSource`; comprobado que falla sin el `activateLocalDataSource()`) |
| R19 | `local-mode.test.tsx` › `settings show reminder preferences and save them` |
| R20 | `local-mode.test.tsx` › `settings show reminder preferences and save them` (abre la ayuda y ve el texto local) |
| R21 | `local-mode.test.tsx` › `settings show device notifications and hide channels and calendar feed` |
| R22 | `i18n/locales.test.ts` › `es and en define the same keys`, `en uses English quotation marks, not Spanish angle quotes` |

## `pnpm harness --full`

```
Checked 507 files … No fixes applied.        (biome)
[OK] pnpm typecheck
e2e test:            Test Files 2 passed  · Tests 6 passed
packages/shared test: Test Files 25 passed · Tests 177 passed
packages/db test:     Test Files 1 passed  · Tests 3 passed
apps/web test:        Test Files 90 passed · Tests 598 passed
apps/api test:        Test Files 38 passed · Tests 370 passed
[OK] pnpm test
── Resumen ── [OK] Arnés en verde.
```

## Desviaciones y notas

- **Capturas (docs/verification.md nivel 5): no hechas.** Todos los cambios visibles (campana, tarjeta «Notificaciones del teléfono», campos y ayuda de Ajustes) solo aparecen en modo local, que necesita el plugin SQLite nativo y no arranca con `pnpm dev` en un navegador. En modo servidor la UI no cambia. Los componentes son los existentes (`NotificationBell`, `DeviceNotificationsSection`, `FormField`), sin estilos nuevos. La revisión visual queda en la checklist del dispositivo.
- **Tap en frío (T11):** el test planeaba llamar al listener «antes de montar `/_app`». TanStack Router no pinta la raíz mientras el `beforeLoad` de `/_app` está pendiente, así que el test arranca en `/welcome` (fuera de `/_app`, que en local no redirige) con el `DataSource` local olvidado, toca y comprueba que navega a `/vehicles/<id>` y fija `readAt`. Simula lo mismo: el handler corre sin el `DataSource` local instalado.
- **Test extra** `orders notifications of the same time by id` (R8): desempate por `id` desc.
- En el modo local `DeviceNotificationsSync` también **pide el permiso** la primera vez (comportamiento heredado de modo servidor); se refleja en `docs/mobile.md`.
- `markRead`/`markAllRead` usan el mismo reloj inyectable (`now`) que la generación, para los tests.
- Fuera de alcance (sin tocar): «Añadir al calendario» en local (#77).

## Checklist manual en el dispositivo (APK de depuración, antes de Gate 2)

Preparación: APK de depuración instalada, modo **En este teléfono**, zona horaria de Ajustes = la del móvil.

1. **Plan vencido al abrir.** Crea un vehículo y un plan con «Última vez» hace más de un año (intervalo 12 meses). En Ajustes pon la **hora de los recordatorios** en una hora ya pasada. Cierra la app del todo y ábrela: la campana muestra **1 sin leer** con «Mantenimiento vencido», el título del plan y el vehículo.
2. **Permiso.** La primera vez en local la app pide permiso de notificaciones (Android 13+); concédelo. *Ajustes › Notificaciones del teléfono* aparece con el texto «Los avisos nuevos salen como notificaciones de Android al abrir la app o volver a ella.» y estado «Activadas». No aparecen «Canales de notificación» ni «Calendario».
3. **Primera ejecución silenciosa.** El aviso del paso 1 está en la campana pero **no** sale como notificación de Android (lo pendiente al instalar es historial).
4. **Mandar al fondo y cambiar la hora.** Pon primero la **hora de los recordatorios** en una hora futura (p. ej. 23:00) y guarda; después crea un segundo plan vencido: la campana no muestra el aviso nuevo (ni pasado un minuto). Manda la app al fondo (botón Inicio).
5. **Volver tras cambiar la hora.** Vuelve a la app, cambia la hora a una ya pasada y guarda; manda al fondo y vuelve: el aviso nuevo aparece en la campana y **sale como notificación de Android** (título = plan, texto = vehículo), una sola vez (volver de nuevo no la repite).
6. **Día del aviso de km.** Pon el **día del aviso de km** en hoy y la hora en una ya pasada, con un vehículo sin lecturas desde hace ≥ 7 días (o creado hace ≥ 7 días). Manda al fondo y vuelve: llega «Registra los km» con los nombres de los vehículos, en la campana y como notificación de Android. Con «No avisar» no llega nada.
7. **Tocar la notificación con la app en segundo plano.** Toca la notificación de Android del paso 5: la app se abre en la ficha del vehículo y el aviso queda leído en la campana.
8. **Arranque en frío por un toque.** Genera otro aviso (repite 4–5 con otro plan), **cierra la app del todo** (deslizar en recientes) sin tocar la notificación y luego tócala: la app arranca, abre la ficha del vehículo y lo marca leído (no se queda en el panel).
9. **Marcar todas.** Con varios sin leer, «Marcar todas como leídas» deja la campana a 0 y persiste tras cerrar y abrir.
10. **Modo servidor intacto.** Cambia a «Mi servidor»: campana, notificaciones y Ajustes se comportan como antes (canales y feed iCal visibles; la ayuda de la hora habla de «cada hora en punto»).
11. **Visual.** Revisa la campana y Ajustes en tema claro y oscuro y en vertical.

## Arreglo tras la prueba en el dispositivo (2026-11-17): aviso de km en Android

**Fallo.** `odometerNudge` seleccionaba `lastReadingDate: max(odometerReadings.date)` sin alias. La columna del resultado se llama `max("odometer_readings"."date")`; el plugin en Android busca cada columna por nombre en el cursor y un nombre con `.` no se encuentra (`Query: in selectSQL cursor Couldn't read row 0 column -1`). Como va dentro de `list()`, todo `list()` fallaba en el día/hora del aviso.

**Cambios por archivo**

- `apps/web/src/lib/data-source/local/notifications.ts`: `lastReadingDate: max(odometerReadings.date).as('last_reading_date')`, con comentario. El SQL generado (registrado en el test) contiene `max("odometer_readings"."date") as "last_reading_date"`; el tipo sigue siendo `string | null` (el `mapWith` de `max` se conserva).
- `apps/web/src/test/memory-sqlite.ts` (motor de los tests del DataSource local): antes de leer filas de una sentencia que devuelve filas, comprueba `statement.columns()` y lanza si algún nombre de columna contiene `.` (`unreadableColumnsError`), igual que el plugin en Android.
- `apps/web/src/test/memory-sqlite.test.ts` (nuevo): filas como arrays (con alias y `count(*)` válidos) y rechazo de `max("t"."b")` sin alias.
- `apps/web/src/lib/data-source/local/local-notifications.test.ts`: test de regresión `aliases the last reading date of the odometer nudge for the device plugin`.
- `apps/web/src/lib/native-sqlite.ts`: párrafo en el JSDoc del módulo: las columnas agregadas o calculadas deben llevar alias, por qué, y que el motor de tests lo comprueba. No lo puse en `docs/mobile.md` porque es documentación de usuario.

**Decisión sobre la guarda general.** La guarda va en `createMemorySqlite`, que es el motor de todos los tests del DataSource local (10 ficheros), y no en `deviceCallback`: así cualquier consulta local ejercitada por un test queda comprobada contra la limitación real del plugin sin cambiar código de producción ni ampliar el alcance (solo es un helper de test). Ponerla en `deviceCallback` habría añadido una comprobación en producción que el propio plugin ya hace (falla igual), y sus tests usan un plugin simulado que no genera SQL real. Al activar la guarda, la única consulta del repo que fallaba era la del aviso de km (los otros agregados, `count(*)` y `total("cost")`, no llevan punto en el nombre). Solo cubre la restricción del punto; la de dos columnas con el mismo nombre (que colapsan en una clave) sigue documentada en `toArray`, sin guarda.

**Trazabilidad**

| Requisito | Test |
|---|---|
| R del aviso de km (generación del nudge en `list()` en el dispositivo) | `local/local-notifications.test.ts › generateLocalReminders › aliases the last reading date of the odometer nudge for the device plugin` |
| Guarda del motor de tests | `test/memory-sqlite.test.ts › createMemorySqlite › rejects a column the device plugin cannot read, as the plugin does` |

**Falla sin el arreglo.** Quitando el `.as(...)`: 5 tests de `local-notifications.test.ts` fallan (el nuevo y los 4 que generan el aviso de km: `skips archived and sold vehicles`, `stores the odometer nudge…`, `does not nudge on other days…`, `never stores the same reminder twice`) con `Columns the device plugin cannot read (add an alias): max("odometer_readings"."date")`. Con el arreglo, todos en verde.

**`pnpm harness --full`**

```
apps/web test:        Test Files 91 passed · Tests 601 passed
apps/api test:        Test Files 38 passed · Tests 370 passed
packages/shared 177 · packages/db 3 · apps/mobile 27
[OK] pnpm test
── Resumen ── [OK] Arnés en verde.
```

**Pendiente:** repetir el paso 6 de la checklist en el dispositivo con la APK nueva.
