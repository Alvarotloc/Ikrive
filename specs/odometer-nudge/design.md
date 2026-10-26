# Design — odometer-nudge

API, `packages/shared` y un retoque en Ajustes (web). Sin endpoint de admin para lanzar jobs ni variable de entorno propia.

## Archivos

| Capa | Archivo | Cambio |
|---|---|---|
| shared | `packages/shared/src/enums.ts` | `NOTIFICATION_TYPES` añade `'odometer_nudge'`. |
| shared | `packages/shared/src/schemas/settings.ts` | `odometerReminderWeekday: z.number().int().min(0).max(6).nullable()`; `DEFAULT_USER_SETTINGS.odometerReminderWeekday` sigue en `0`. |
| db | `apps/api/src/db/schema/settings.ts` | `odometerReminderWeekday: integer().default(0)` (sin `notNull`). |
| db | `apps/api/src/db/migrations/0007_odometer_reminder_optional.sql` + `meta/` | `pnpm --filter @ikrive/api exec drizzle-kit generate --name odometer_reminder_optional`. SQLite recrea `user_settings` copiando las filas (los valores actuales se conservan). La columna `notifications.type` es `text` sin `CHECK`: el tipo nuevo no necesita migración. |
| api | `apps/api/src/lib/dates.ts` | `weekdayOf(date)` (0 = domingo, de un `YYYY-MM-DD`) e `isoWeekOf(date)` (`'2026-W43'`). Puras, en UTC sobre la fecha local ya calculada con `todayIn`. |
| api | `apps/api/src/modules/vehicles/repository.ts` | `listActiveForOdometerNudge()`: una consulta de vehículos activos con `inner join user_settings` donde `odometer_reminder_weekday IS NOT NULL`, `left join odometer_readings` y `max(date)` agrupado por vehículo; devuelve `{ vehicleId, ownerId, name, make, model, createdAt, lastReadingDate, weekday, timezone, reminderHour }`, ordenado por `vehicles.created_at` asc. |
| api | `apps/api/src/jobs/odometer-nudge.job.ts` (nuevo) | `ODOMETER_NUDGE_CRON`, `ODOMETER_NUDGE_DAYS = 7`, `odometerNudgeDedupeKey`, `runOdometerNudge`, `startOdometerNudgeJob`. |
| api | `apps/api/src/server.ts` | Programa el job con el mismo `dispatcher` y `config.REMINDERS_ENABLED`; `stop()` al apagar. |
| api | `apps/api/src/modules/notification-channels/messages.ts` | `TEXTS.*.types.odometer_nudge`: «Registra los km» / «Log your mileage». |
| web | `apps/web/src/routes/_app/settings.tsx` | Opción «No avisar» (`value=""`) en el selector de día; `setValueAs: (v) => (v === '' ? null : Number(v))` en vez de `valueAsNumber`. |
| web | `apps/web/src/i18n/locales/{es,en}.json` | `notifications.types.odometer_nudge` y `settings.odometerReminderOff` («No avisar» / «Don't remind me»). |
| tests | `apps/api/test/odometer-nudge.test.ts` (nuevo), `apps/api/test/settings.test.ts`, `apps/api/src/modules/notification-channels/messages.test.ts`, `apps/web/src/features/settings/settings-page.test.tsx`, `apps/web/src/features/notifications/notification-bell.test.tsx` | Ver `tasks.md`. |

## Job

```ts
export const ODOMETER_NUDGE_CRON = '0 * * * *';
export const ODOMETER_NUDGE_DAYS = 7;
export function odometerNudgeDedupeKey(userId: string, today: string): string; // `odometer_nudge:${userId}:${isoWeekOf(today)}`
export function runOdometerNudge(opts: { db: Db; now?: Date; dispatcher: NotificationDispatcher }):
  Promise<{ evaluated: number; created: number }>;
export function startOdometerNudgeJob(opts: { enabled: boolean; run: () => Promise<unknown>; logger: FastifyBaseLogger }):
  Cron | null; // mismo patrón que startRemindersJob: protect: true, catch → logger.error
```

`runOdometerNudge`:

1. `listActiveForOdometerNudge()` y agrupar por `ownerId` (las filas de un usuario comparten ajustes).
2. Por usuario: `today = todayIn(timezone, now)`; seguir solo si `weekdayOf(today) === weekday` y `hourIn(timezone, now) >= reminderHour` (cuenta en `evaluated`).
3. Pendientes: `(lastReadingDate ?? todayIn(timezone, createdAt)) <= addDays(today, -ODOMETER_NUDGE_DAYS)`.
4. Si hay alguno, una fila `{ userId, vehicleId: null, type: 'odometer_nudge', title: nombres.join(', '), body: null, link: '/odometer', dedupeKey, createdAt: now }`.
5. `notifications.createMany(rows)` (ignora claves repetidas) y `dispatcher.dispatch(created)`: las in-app se guardan antes de cualquier envío, como en `runReminders`.

El título lleva datos del usuario (nombres), no texto traducido; la etiqueta del tipo la pone la web (`notifications.types.*`) y el canal (`«Registra los km: Golf, Clio»`, cuerpo = título por `toChannelMessage`).

## Contrato HTTP

Sin endpoints nuevos. `GET`/`PATCH /api/settings` aceptan y devuelven `odometerReminderWeekday: null`; un valor fuera de `0`–`6` o no entero sigue siendo 400 `application/problem+json`.

## UI

Solo el selector de Ajustes gana la primera opción «No avisar». La campana no cambia: muestra la etiqueta del tipo, el título (vehículos) y navega a `/odometer`, página que ya existe.

## Alternativas descartadas

- **Dedupe por fecha local** (`odometer_nudge:<userId>:<today>`): si el usuario cambia el día a media semana recibe dos avisos esa semana; el criterio pide «por usuario y semana».
- **Una notificación por vehículo**: el criterio pide una única por usuario; además `vehicleId` queda `null` porque son varios.
- **Interpretar «sin día configurado» solo como «sin fila de ajustes»**: las filas se crean al registrarse con `0`, así que nadie quedaría fuera; hace falta un valor explícito (`null`).
- **Meter el aviso dentro de `runReminders`**: mezcla dos reglas distintas y el criterio pide un job propio invocable aparte.

## Decisiones a validar (Gate 1)

1. **`null` = «No avisar»** en `odometerReminderWeekday`; los usuarios nuevos y los existentes siguen con su valor (domingo por defecto), es decir, el aviso está activo salvo que se desactive.
2. **Hora del aviso**: se reutiliza `reminderHour` (por defecto 8:00) y la recuperación en ejecuciones posteriores del mismo día, igual que los recordatorios; no hay hora propia.
3. **Mismo interruptor** `REMINDERS_ENABLED` para ambos jobs, sin variable nueva.
4. **Vehículo sin lecturas**: cuenta desde su fecha de alta, así que un vehículo creado sin km aparece a los 7 días.
5. **Semana ISO** (lunes a domingo) para la deduplicación.
6. **Título = lista de vehículos** («Golf, Clio»), sin cuerpo.

## Riesgos

- La migración recrea `user_settings` (SQLite no cambia `NOT NULL` en sitio); se revisa que el SQL generado copia todas las columnas, incluida `reminder_hour`.
- `zodResolver` con `null` en el `<select>`: el test de componente cubre que se envía `null` y no `NaN`.

## Fuera de alcance

- Endpoint o script de admin para lanzar jobs a mano.
- Hora o canal específicos para el aviso de km.
- Avisar por vehículo o con umbral configurable.
