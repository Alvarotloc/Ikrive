# Design — mobile-local-reminders

Solo `apps/web` y docs. Sin cambios en la API, la BD (la tabla `notifications` ya está en la SQLite local por la migración 0005), `packages/shared` ni dependencias (`@capacitor/app` 8.1.2 ya está desde #74).

## Decisiones principales

1. **Dónde se calcula.** En el `DataSource` local: nuevo `local/notifications.ts` con `generateLocalReminders(db, now)` y la fábrica `localNotifications(db, now?)`. `list()` llama primero a `generateLocalReminders` y después lee la página. Como `notifications` se registra con `serialized(queue, …)`, generación + lectura son **una sola operación de la cola serie** (R7): no hace falta exponer la cola fuera de `createLocalDataSource`.
2. **Qué lo dispara.** Toda petición de la lista:
   - **Arranque:** la campana (ahora visible en local) y `DeviceNotificationsSync` montan `notificationsQuery` al entrar en `/_app`.
   - **Vuelta a primer plano:** `LocalRemindersRefresh` escucha `App.addListener('resume')` de `@capacitor/app` y hace `invalidateQueries(queryKeys.notifications.all)`. No se fía de `visibilitychange` (React Query) porque el WebView de Android no lo garantiza al reanudarse.
   - **Con la app abierta:** el `refetchInterval` de 60 s ya existente. Así un aviso que pasa su `reminderHour` con la app abierta llega como en el servidor (primera revisión desde esa hora).
   La dedupe por `dedupeKey` (índice único) hace idempotentes las llamadas repetidas.
3. **Mismas reglas que los jobs.** Se usan `isReminderTime`, `scheduleReminderNotification`, `isOdometerNudgeTime` y `odometerNudgeNotification` de `@ikrive/shared`, con los ajustes del usuario local. Por eso los campos `reminderHour` y `odometerReminderWeekday` se muestran en Ajustes en local (R19), con una ayuda propia (R20).
4. **Notificaciones nativas.** Se reutiliza `DeviceNotificationsSync` tal cual montándolo también en local (`userId = 'local'`, estado `ikrive.deviceNotifications.local`); la tarjeta `DeviceNotificationsSection` se muestra en local con otra descripción.
5. **Toque.** `NotificationTapHandler` ya funciona con `markRead` del `DataSource`; solo hay que esperar a que el `DataSource` local esté instalado antes de leer `me` (en un arranque en frío por el toque, el handler de la raíz puede correr antes que el `beforeLoad` de `/_app`).

## Archivos

| Capa | Archivo | Cambio |
|---|---|---|
| DataSource local | `apps/web/src/lib/data-source/local/notifications.ts` (nuevo) | `generateLocalReminders`, `localNotifications` (abajo). |
| DataSource local | `apps/web/src/lib/data-source/local/index.ts` | `notifications: serialized(queue, localNotifications(db))`; JSDoc sin «notifications» en lo que rechaza. |
| Nativo | `apps/web/src/lib/native-app-state.ts` (nuevo) | `onAppResume(listener): Promise<() => Promise<void>>` con `App.addListener('resume', …)`. |
| PWA | `apps/web/src/features/pwa/config.ts` | `app-state` en la regex de `NATIVE_ONLY_MODULES`. |
| Web | `apps/web/src/features/notifications/local-reminders-refresh.tsx` (nuevo) | `LocalRemindersRefresh`: patrón de `BackButtonHandler` (`import()`, `active`/`stop`, errores ignorados); en `resume` invalida `queryKeys.notifications.all`. |
| Web | `apps/web/src/routes/_app.tsx` | `{isNativeApp() && <DeviceNotificationsSync userId={me.id} />}` en ambos modos; `{isNativeApp() && isLocalMode() && <LocalRemindersRefresh />}`. |
| Web | `apps/web/src/features/navigation/app-navigation.tsx` | Quitar `!isLocalMode()` de la campana (sidebar y cabecera móvil) y el comentario de #67. |
| Web | `apps/web/src/features/notifications/notification-tap-handler.tsx` | Antes de `fetchQuery(meQuery)`: `if (isLocalMode()) await activateLocalDataSource()` (idempotente, de `features/mobile/local-mode.ts`). |
| Web | `apps/web/src/features/notifications/device-notifications-section.tsx` | Descripción `deviceNotifications.descriptionLocal` si `isLocalMode()`. |
| Web | `apps/web/src/routes/_app/settings.tsx` | Mostrar `odometerReminderWeekday` y `reminderHour` también en local; `InfoPopover` de la hora con `settings.reminderHourInfoLocal` en local; `{isNativeApp() && <DeviceNotificationsSection />}` fuera del bloque `!local` (canales y feed iCal siguen dentro). Quitar el comentario de #67. |
| i18n | `apps/web/src/i18n/locales/{es,en}.json` | `settings.reminderHourInfoLocal`, `deviceNotifications.descriptionLocal`. |
| Docs | `docs/mobile.md`, `docs/PLAN.md` | Recordatorios en local, cuándo se revisan, sin canales; estado de #67. |

### `local/notifications.ts`

```ts
/** Stores the reminders and odometer nudge due at `now` (same rules as the server jobs); returns the new ones. */
export async function generateLocalReminders(db: LocalDb, now: Date): Promise<number>;
export function localNotifications(db: LocalDb, now?: () => Date): DataSource['notifications'];
```

`generateLocalReminders`, sin transacción (una sola sentencia de escritura):

1. `settingsRow` (exportarlo de `local/settings.ts`): `timezone`, `reminderHour`, `odometerReminderWeekday`. `today = todayIn(timezone, now)`.
2. Si `isReminderTime(settings, now)`: planes de `maintenance_schedules` con su vehículo (`innerJoin vehicles`, `ownerId = LOCAL_USER_ID`, `soldAt` y `archivedAt` nulos; columnas con alias, sin homónimas — ver riesgo de orden de columnas de #54). Por vehículo, `listReadings(db, vehicleId)` (todas: `computeScheduleDue` ya filtra la ventana de 90 días, el resultado es el mismo que con la consulta acotada del job). `scheduleReminderNotification(...)` por plan.
3. Si `isOdometerNudgeTime({ timezone, reminderHour, weekday: odometerReminderWeekday }, now)`: vehículos activos con `lastReadingDate = max(odometer_readings.date)` y `createdAt` → `odometerNudgeNotification({ userId: LOCAL_USER_ID, today, timezone, vehicles })`.
4. `insert(notifications).values(rows con userId LOCAL_USER_ID, createdAt now).onConflictDoNothing({ target: notifications.dedupeKey }).returning()` si hay filas.

`list()`: `generateLocalReminders(db, now())` y después lo mismo que `listByUser`/`countByUser`/`countUnread` del repositorio de la API con `limit 20, offset 0`; `toDto` igual que `service.ts` (oculta `userId`, `vehicleId`, `dedupeKey`). `markRead(id)`: `notFound('Notification not found')` si no existe; `update … set readAt where id and readAt is null`; devuelve la fila. `markAllRead()`: `update … where userId and readAt is null`.

Sin cambios de contrato HTTP: el modo servidor sigue igual.

## UI

Reutiliza `NotificationBell`, `DeviceNotificationsSection` y los `FormField` existentes: mismos estados vacío/carga/error, modo oscuro y móvil. Sin componentes nuevos visibles.

Textos nuevos (es):
- `settings.reminderHourInfoLocal`: «La app revisa los recordatorios al abrirla, al volver a ella y cada minuto mientras está abierta. Cada aviso llega una sola vez, en la primera revisión a partir de esta hora en tu zona horaria. Con la app cerrada no se revisan.»
- `deviceNotifications.descriptionLocal`: «Los avisos nuevos salen como notificaciones de Android al abrir la app o volver a ella.»

## Alternativas descartadas

- **Hook que llama a una función local fuera del `DataSource`** (p. ej. en el `beforeLoad` de `/_app` y en `resume`): tendría que exponer la cola serie fuera de `createLocalDataSource` y duplicar el disparo; generando dentro de `list()` cualquier lector de la bandeja la ve al día.
- **Método nuevo `DataSource.notifications.refresh()`**: obliga a un no-op en `http.ts` y a otra query/mutación solo para el modo local.
- **Programar notificaciones futuras con `LocalNotifications.schedule({ at })`** para avisar con la app cerrada: requiere `SCHEDULE_EXACT_ALARM` (quitado en #52) o avisos inexactos, y recalcular la agenda en cada cambio de datos. Fuera del alcance decidido en `docs/PLAN.md`.
- **Mover la orquestación de los jobs a `packages/shared`**: para un único usuario local se reduce a dos `if` sobre funciones que ya son compartidas; los jobs de la API no cambian.
- **Mostrar como notificación de Android lo pendiente en la primera ejecución**: rompería la regla de `selectNewNotifications` y el comportamiento de modo servidor (ver decisión 2).

## Decisiones a validar

1. **También se revisa cada 60 s con la app abierta**, no solo al abrir y al volver (es el `refetchInterval` de la campana). Más cercano a los jobs horarios que solo abrir/volver.
2. **Primera ejecución silenciosa**, igual que en modo servidor: lo que ya está pendiente al instalar esta versión (o al entrar en local por primera vez) aparece en la campana pero no como notificación de Android. A partir de ahí, cada aviso nuevo sí.
3. **Ajustes en local**: vuelven el día del aviso de km y la hora (sustituye a R34 de `mobile-local-core`; su test `settings hide reminder preferences` se reemplaza). Canales y feed iCal siguen ocultos.
4. **El listener de `resume` solo se monta en modo local**: en modo servidor el comportamiento no cambia.
5. **«Añadir al calendario» en local queda fuera de alcance.** El enlace `https://localhost/vehicles/<id>` de la descripción del evento (`add-to-calendar.tsx`, `getServerUrl() ?? origin`) no tiene que ver con los recordatorios ni con el `acceptance` de #67. Propuesta: una feature `sdd: false` aparte (p. ej. omitir la línea «Ficha del vehículo» y la `URL` cuando `config.localBaseUrl`).

## Tamaño

Cabe en una feature (≈ 150 líneas de lógica local + cambios pequeños de UI + tests). Si se prefiere partir: **(a)** bandeja y generación locales + campana + campos de Ajustes (R1–R12, R19, R20) y **(b)** lo nativo: `resume`, `DeviceNotificationsSync`, tarjeta de permiso y toque (R13–R18, R21). (a) ya es útil sola (se generan al abrir la app).

## Riesgos

- **Sin la app abierta no hay avisos**: si el usuario no abre la app el día del aviso de km, esa semana no hay aviso (como un servidor apagado todo ese día). Los de planes sí llegan al abrirla otro día (su clave es por periodo). Documentado en `docs/mobile.md`.
- **`resume` en Android**: solo se prueba con el plugin simulado; la checklist manual del `implementer` (abrir la app con un plan vencido, mandarla al fondo, cambiar la hora/día del aviso, volver, ver la notificación, tocarla) la ejecuta el humano con la APK de depuración antes de Gate 2.
- **Arranque en frío por un toque**: lo cubre esperar `activateLocalDataSource()`; si la base no abre, el toque se ignora (best effort, como hoy).
- **Coste de `list()`**: unas pocas consultas por minuto sobre la SQLite local; despreciable con los volúmenes de un particular.

## Fuera de alcance

Canales de notificación y feed iCal en local; notificaciones con la app cerrada; «Añadir al calendario» en local (decisión 5); cambios en los jobs o en la API.
