# Review — #67 mobile-local-reminders

**Veredicto:** APPROVED

## Trazabilidad requirements ↔ tests

- R1: [x] `apps/web/src/lib/data-source/local/local-notifications.test.ts` › `stores due soon and overdue reminders with the shared drafts`. Compara las filas guardadas con `scheduleReminderNotification(...)` para `today` en Madrid (`type`, `title`, `body`, `link`, `vehicleId`, `dedupeKey`, `userId`, `createdAt`), comprueba que un plan `ok` no genera nada y que las `dedupeKey` son las esperadas. `local-mode.test.tsx` › `shows the bell with the local reminders on start`: la campana muestra 1 sin leer con título y vehículo, sin `fetch`.
- R2: [x] `does nothing before the reminder hour`: 0 a las 12:00 con `reminderHour` 13, también en domingo (aviso de km). Después, 1 desde las 13:00. `uses the user's time zone and reminder hour`: New York 06:00 da 0 y 07:00 da 1; «today» es el de la zona del usuario.
- R3: [x] `skips archived and sold vehicles`: solo el activo, en planes y en el título del aviso de km.
- R4: [x] `stores the odometer nudge on the weekday from the reminder hour`: antes de la hora da 0. Desde la hora, la fila es igual a `odometerNudgeNotification` con `lastReadingDate` = la última lectura (o la de alta si no tiene). Cubre el umbral de 7 frente a 6 días, en Madrid frente a UTC, y comprueba la `dedupeKey` por semana ISO.
- R5: [x] `does not nudge on other days or without a weekday`: con `null`, 7 días seguidos dan 0 y la tabla queda vacía.
- R6: [x] `never stores the same reminder twice`: la segunda ejecución da 0, y también tras marcarlas leídas; siguen siendo 2 filas.
- R7: [x] `local-notifications.test.ts` › `notifications` › `list runs through the serial queue`: la secuencia de sentencias de dos `list()` concurrentes es igual a la de dos seguidas, y hay 1 sola fila. En el código, `list()` hace `generateLocalReminders` y la lectura dentro del mismo método, y `serialized(queue, …)` envuelve el método entero (`index.ts:66`), así que es una sola operación de la cola.
- R8: [x] `list generates and returns the newest page with totals`: 21 → 20, `total` 21, `unreadCount` 20, orden y DTO exactos, `notificationListSchema.parse`. `orders notifications of the same time by id`: el desempate es `id` desc.
- R9: [x] `markRead keeps the first read time`: `notificationSchema.parse`, `readAt` = NOW; una segunda llamada otro día devuelve lo mismo. `local-mode.test.tsx` › `the bell marks one and all as read in local mode` lo comprueba en la base local.
- R10: [x] `markRead of a missing notification is a 404`: Problem exacto con `detail: 'Notification not found'`.
- R11: [x] `markAllRead marks every unread notification`: la ya leída conserva su `readAt` y las demás pasan a NOW. También en `the bell marks one and all as read in local mode`.
- R12: [x] `local-mode.test.tsx` › `shows the bell with the local reminders on start` (botón «Notificaciones, 1 sin leer»).
- R13: [x] `native-app-state.test.ts` › `calls the listener on every resume and removes it` (`addListener('resume')`, 2 llamadas, `remove`). `local-reminders-refresh.test.tsx` › `invalidates the notifications on resume` (se vuelve a pedir: 2 peticiones). `local-mode.test.tsx` › `generates reminders when the app comes back to the foreground` (de 0 a 1 tras `resume` pasada la hora).
- R14: [x] `removes the listener on unmount` y `removes the listener when unmounted before subscribing` (con la puerta `gate`, `stop` se llama después de suscribirse).
- R15: [x] `server mode and web never listen for resume`: web y servidor nativo; `loaded` sigue en `false` y `onAppResume` no se llama.
- R16: [x] `native-only.test.ts` › `sends the app state module to assets/native/`, más la regex de `pwa/config.ts`.
- R17: [x] `shows new local reminders as phone notifications`: en la primera ejecución no se muestra nada. En la segunda, `showNotifications` con `title`, `body` y `extra: { userId: 'local', notificationId, link }`.
- R18: [x] `tapping a phone notification marks it as read and opens its link`: el `DataSource` local está olvidado y `httpDataSource` instalado. Navega a `/vehicles/<id>` y `readAt` queda fijado. El implementer afirma que falla sin `activateLocalDataSource()`.
- R19: [x] `settings show reminder preferences and save them`: valores 3/20 visibles; se guardan 5/7 y se leen del `DataSource`.
- R20: [x] El mismo test abre la ayuda y ve el texto local.
- R21: [x] `settings show device notifications and hide channels and calendar feed`: la tarjeta tiene la descripción local y el estado «Activadas», y no aparecen «Canales de notificación» ni «Calendario».
- R22: [x] `i18n/locales.test.ts` (mismas claves; comillas inglesas). Las dos claves están en `es.json` y `en.json`.

## Tasks

- T1..T14: [x]

## Checkpoints

- C1: [x] `pnpm harness` en verde · una sola feature activa (#67 `in_progress`) · la rama es `feat/mobile-local-reminders`.
- C2: [x] Están los 3 ficheros del spec, en EARS y con la tabla de acceptance · las tasks están `[x]` · cada R tiene su test, abierto y leído.
- C3: [x] El diff se limita a los archivos de `design.md`, docs y `progress/`. No hay cambios en la API, la BD, `packages/shared` ni dependencias.
- C4: [x] No hay API nueva. El dominio va en `lib/data-source/local/` y `features/notifications/`, como en las features locales previas. Los datos usan el `notificationsQuery` existente, los textos están en es/en y los componentes son los existentes. La lógica pura sigue en `@ikrive/shared`, sin duplicarla.
- C5: [x] No hay `any`, `@ts-ignore` ni `console.log`. Las fechas son `YYYY-MM-DD` (`todayIn`, `max(date)`).
- C6: [x] `pnpm harness --full` en verde (web 598, api 370, shared 177, db 3, e2e 6). Los tests usan SQLite en memoria real (`createMemorySqlite`). Sin capturas, con justificación: el modo local no arranca en navegador. Es el mismo criterio aceptado en #66; la revisión visual pasa a la checklist del dispositivo.
- C7: [x] `impl_mobile-local-reminders.md` incluye los archivos, el mapa R→test, la salida y la checklist · `current.md` está al día · `PLAN.md` está actualizado.

## Paridad con los jobs del servidor (revisado expresamente)

- **Hora y día:** se usan las mismas funciones `isReminderTime` / `isOdometerNudgeTime` / `todayIn` con `timezone`, `reminderHour` y `odometerReminderWeekday` del usuario local.
- **Vehículos activos:** el filtro `soldAt IS NULL AND archivedAt IS NULL` es el mismo que `activeVehicleFilter` (más `ownerId = local`).
- **Lecturas:** el job carga las lecturas de los últimos 90 días **más la de la fecha máxima** (`listRecentReadingsByVehicles`). En local se cargan todas. `computeScheduleDue` solo usa `latestOdometerReading`, que es igual en ambos casos porque el job incluye la última, y `averageDailyDistance`, que filtra la ventana de 90 días. El resultado es idéntico.
- **Aviso de km:** se calcula `max(odometer_readings.date)` con `leftJoin` y `groupBy(vehicles.id)`, y `createdAt` del vehículo, igual que `listActiveForOdometerNudge`.
- **Dedupe:** un único `insert … onConflictDoNothing({ target: dedupeKey })`, como `createMany`. Las claves salen de las mismas funciones compartidas.

## Desviaciones declaradas

1. **Toque en frío desde `/welcome`:** aceptable. Lo que hay que demostrar es que el handler de la raíz corre sin el `DataSource` local instalado. El test lo fuerza (`forgetLocalDataSource()` + `setDataSource(httpDataSource)` + la aserción `dataSource() === httpDataSource`) y el handler funciona igual en cualquier ruta. El caso real (antes del `beforeLoad` de `/_app`) comparte la promesa idempotente de `activateLocalDataSource`, así que no hay doble apertura.
2. **Petición de permiso también en local:** aceptable y coherente con el design (decisión 4: «se reutiliza `DeviceNotificationsSync` tal cual»). El flag `ikrive.notificationPermissionAsked` es por dispositivo, así que no se pide dos veces aunque se use antes el modo servidor. Está documentado en `docs/mobile.md` y en la checklist.

## Hallazgos

Ninguno bloqueante.

## Avisos para el humano (no bloquean)

- **Usuario sin fila de ajustes:** `generateLocalReminders` llama a `settingsRow`, que crea la fila con los valores por defecto (`odometerReminderWeekday: 0`). El job del servidor, en cambio, excluye del aviso de km a los usuarios sin fila. En la práctica no cambia nada, porque `/_app` ya carga `settingsQuery` y crea la fila antes de que la campana pida la lista.
- **Texto que no aplica en local:** la viñeta «Solo con la app abierta» de `docs/mobile.md` (sección «Calendario y notificaciones») sigue recomendando añadir un canal para recibir avisos con la app cerrada, cosa que no existe en local. La viñeta de «En este teléfono» sí dice «No hay canales», pero se podría matizar aquí.
- **Campana en R12:** el test comprueba una sola campana (la del layout que pinta jsdom). El cambio en el código cubre la barra lateral y la cabecera móvil, pero solo una de las dos queda verificada por test.
- **Pruebas en el dispositivo:** `resume`, el arranque en frío por un toque y la parte visual solo se prueban con plugins simulados. Antes de Gate 2 hay que pasar la checklist de `progress/impl_mobile-local-reminders.md` con la APK de depuración.

## Cambios requeridos

Ninguno.

---

## Re-revisión (2026-11-17): arreglo del aviso de km tras la prueba en el dispositivo

**Veredicto:** APPROVED

### Qué se ha revisado

- `apps/web/src/lib/data-source/local/notifications.ts:102`: `max(odometerReadings.date).as('last_reading_date')`. Es el cambio mínimo y correcto: la columna deja de llamarse `max("odometer_readings"."date")`, que el plugin de Android no encuentra en el cursor. El tipo y el `mapWith` de `max` se mantienen. La regresión de valor queda cubierta por R4 (`stores the odometer nudge…`), que compara la fila con `odometerNudgeNotification` usando la `lastReadingDate` esperada.
- `apps/web/src/test/memory-sqlite.ts`: la guarda `unreadableColumnsError` se aplica a toda sentencia lectora (`statement.reader`) antes de leer filas. Usa `statement.columns()`, que da los nombres reales de SQLite, y lanza si alguno contiene `.`. Solo cambia un helper de test: no hay cambios en producción ni en el alcance funcional. Como es el motor de todos los tests del `DataSource` local, cualquier consulta local que pase por un test queda comprobada.
- `apps/web/src/test/memory-sqlite.test.ts`: verifica el resultado concreto en los dos sentidos. Con alias y `count(*)`, las filas vuelven como arrays con los valores exactos. Con `max("t"."b")` sin alias, se rechaza con el mensaje exacto.
- `local-notifications.test.ts:250` › `aliases the last reading date of the odometer nudge for the device plugin`: comprueba que se genera 1 aviso y que el SQL contiene `max("odometer_readings"."date") as "last_reading_date"`. Además, con la guarda activa, los 4 tests del aviso de km fallarían sin el alias. La regresión queda cubierta dos veces.
- `apps/web/src/lib/native-sqlite.ts`: el JSDoc documenta la restricción, el porqué y la guarda. Ubicación adecuada, porque es documentación para desarrolladores.
- Otros agregados del `DataSource` local: `notifications.ts:143` (`count()`) y `maintenance.ts:148` (`total(${maintenanceRecords.cost})` en una select de una sola tabla, que drizzle emite sin calificar). Los dos se ejercitan en tests con la guarda activa y pasan. No hay más `max/min/sum/sql` en columnas seleccionadas (`grep`).

### Trazabilidad

- R4 (aviso de km en `list()`): [x] `local-notifications.test.ts` › `aliases the last reading date of the odometer nudge for the device plugin`, junto con los tests previos de R3–R6, que ahora pasan por la guarda.
- Guarda del motor de tests: [x] `memory-sqlite.test.ts` › `rejects a column the device plugin cannot read, as the plugin does`.
- Los demás R1–R22: sin cambios respecto a la revisión anterior.

### Checkpoints

- C1: [x] · C2: [x] · C3: [x] El arreglo toca solo `local/notifications.ts`, los helpers y tests de `apps/web/src/test/`, el JSDoc y `progress/`. · C4: [x] · C5: [x] Sin `any`, `@ts-ignore` ni `console.log`. · C6: [x] `pnpm harness --full` en verde, ejecutado por el reviewer (web 91 ficheros / 601 tests, api 38 / 370, db 3). · C7: [x] `impl_mobile-local-reminders.md` documenta el fallo, los cambios, la trazabilidad y la salida.

### Avisos para el humano (no bloquean)

- La guarda solo cubre los nombres con `.`. Los nombres de columna duplicados (que colapsan en una clave en el plugin) siguen documentados en `toArray`, sin comprobación automática.
- La guarda no detecta las consultas que ningún test ejercita. Hoy no hay ninguna con agregados sin alias.
- Antes de Gate 2 hay que repetir el paso 6 de la checklist del dispositivo (aviso de km) con la APK nueva.

### Cambios requeridos

Ninguno.
