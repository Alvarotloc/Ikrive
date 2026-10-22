# Design — in-app-notifications

API, `packages/shared` y web. Sin canales push (ntfy, Gotify…), sin `odometer-nudge.job` y sin endpoint de admin para lanzar jobs: son features posteriores de la fase 4.

## Archivos

| Capa | Archivo | Cambio |
|---|---|---|
| shared | `packages/shared/src/enums.ts` | `NOTIFICATION_TYPES = ['schedule_due_soon','schedule_overdue']` + tipo `NotificationType`. |
| shared | `packages/shared/src/schemas/settings.ts` (+ test existente si lo hay) | `reminderHour: z.number().int().min(0).max(23)` en `userSettingsSchema`; `DEFAULT_USER_SETTINGS.reminderHour = 8`. `updateUserSettingsSchema` lo hereda (partial). |
| shared | `packages/shared/src/schemas/notifications.ts` (nuevo) + `.test.ts` | `notificationSchema`, `notificationListQuerySchema`, `notificationListSchema`; exportado en `src/index.ts`. |
| db | `apps/api/src/db/schema/notifications.ts` (nuevo) + `schema/index.ts` | Tabla `notifications`. |
| db | `apps/api/src/db/schema/settings.ts` | `reminderHour: integer().notNull().default(DEFAULT_USER_SETTINGS.reminderHour)`. |
| db | `apps/api/src/db/migrations/0005_notifications.sql` + `meta/` | `pnpm --filter @ikrive/api exec drizzle-kit generate --name notifications`: `CREATE TABLE notifications` + `ALTER TABLE user_settings ADD reminder_hour integer DEFAULT 8 NOT NULL`. |
| api | `apps/api/src/lib/dates.ts` | `hourIn(timeZone, now)`: hora local 0–23 (`Intl.DateTimeFormat`, `hourCycle: 'h23'`; zona inválida → UTC, como `todayIn`). |
| api | `apps/api/package.json` | Dependencia `croner`. |
| api | `apps/api/src/config.ts` | `REMINDERS_ENABLED: booleanString.default(true)`. |
| api | `apps/api/src/modules/notifications/{repository,service,routes}.ts` (nuevos) | Bandeja: listar, marcar leída, marcar todas; `createMany` idempotente para el job. |
| api | `apps/api/src/modules/vehicles/repository.ts` | Exportar `activeVehicleFilter` (el actual `statusFilter.active`) y añadir `listRecentReadingsByVehicles(ids, since)`. |
| api | `apps/api/src/modules/schedules/repository.ts` | `listForActiveVehicles()`: reglas + `ownerId`, nombre del vehículo, `timezone` y `reminderHour` del dueño (join con `vehicles` y left join con `user_settings`). |
| api | `apps/api/src/jobs/reminders.job.ts` (nuevo) | `runReminders`, `reminderDedupeKey`, `startRemindersJob`, `REMINDERS_CRON`. |
| api | `apps/api/src/app.ts` | Cablear el módulo `notifications` y registrar sus rutas. |
| api | `apps/api/src/server.ts` | Arrancar el job tras `buildApp` y pararlo en el handler de señales antes de `app.close()`. |
| test | `apps/api/test/notifications.test.ts`, `apps/api/test/reminders.test.ts` (nuevos), `apps/api/test/settings.test.ts` | Integración de endpoints, del job y de `reminderHour`. |
| web | `apps/web/src/components/ui/popover.tsx` (nuevo) | Wrapper de `Popover` de `radix-ui` al estilo de `dialog.tsx`. |
| web | `apps/web/src/features/notifications/{queries.ts,notification-bell.tsx,notification-bell.test.tsx}` (nuevos) | Query, mutaciones y campana con panel. |
| web | `apps/web/src/lib/query-keys.ts` | `notifications: { all, list }`. |
| web | `apps/web/src/lib/format.ts` | `dateTime(iso)` en `useFormat` (fecha y hora en la zona del usuario). |
| web | `apps/web/src/routes/_app.tsx` | `<NotificationBell />` junto al botón de cerrar sesión. |
| web | `apps/web/src/features/settings/use-user-locale.test.tsx` | Añadir `GET /notifications` a los mocks de `renderApp`. |
| web | `apps/web/src/routes/_app/settings.tsx` | `FormField` `reminderHour` con `Select` (`valueAsNumber`) de 24 opciones `HH:00` y texto de ayuda. |
| web | `apps/web/src/features/settings/settings-page.test.tsx` (nuevo) | Test de la página con la app completa en memoria (mismo patrón que `use-user-locale.test.tsx`). |
| i18n | `apps/web/src/i18n/locales/{es,en}.json` | Bloque `notifications`; `settings.reminderHour` y `settings.reminderHourHint`. |
| docs | `README.md`, `.env.example`, `docs/PLAN.md` | Variable `REMINDERS_ENABLED`; `TZ` ya no fija la hora de los recordatorios (la elige cada usuario); carpeta `jobs/` en la estructura. |

## Base de datos

```ts
export const notifications = sqliteTable('notifications', {
  id: id(),
  userId: text().notNull().references(() => user.id, { onDelete: 'cascade' }),
  vehicleId: text().references(() => vehicles.id, { onDelete: 'cascade' }), // nullable: futuros tipos sin vehículo
  type: text({ enum: NOTIFICATION_TYPES }).notNull(),
  title: text().notNull(),
  body: text(),                                  // nullable
  link: text(),                                  // nullable, ruta interna de la SPA
  dedupeKey: text().notNull(),
  readAt: integer({ mode: 'timestamp_ms' }),     // nullable
  createdAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
}, (t) => [
  index('notifications_user_id_created_at_idx').on(t.userId, t.createdAt),
  uniqueIndex('notifications_dedupe_key_idx').on(t.dedupeKey),
  index('notifications_vehicle_id_idx').on(t.vehicleId),
]);
```

`vehicle_id` en cascada (R33): borrar un vehículo borra sus avisos con la FK de SQLite (`foreign_keys = ON`, ya activo), sin código en el servicio de vehículos. `user_settings` gana `reminder_hour` (R29); `SettingsService.get()` ya hace upsert con defaults, así que los usuarios sin fila reciben 8.

`createMany(rows)` usa `.onConflictDoNothing({ target: notifications.dedupeKey })` y devuelve las filas insertadas (`.returning().all()`), así el job cuenta `created` sin consultas extra.

## Job (`apps/api/src/jobs/reminders.job.ts`)

```ts
export const REMINDERS_CRON = '0 * * * *';
export function isReminderTime(owner: { timezone: string; reminderHour: number }, now: Date): boolean; // hourIn(tz, now) >= reminderHour
export function reminderDedupeKey(scheduleId: string, status: 'due_soon' | 'overdue',
  rule: { lastDoneDate: string; lastDoneOdometer: number | null }): string;
export function runReminders(deps: { db: Db; now?: Date }): { evaluated: number; created: number };
export function startRemindersJob(deps: { enabled: boolean; run: () => unknown; logger: FastifyBaseLogger }): Cron | null;
```

1. `schedules.listForActiveVehicles()` (una consulta; `timezone`/`reminderHour` null → `DEFAULT_USER_SETTINGS`).
2. Filtrar en memoria las reglas cuyo dueño cumple `isReminderTime(owner, now)` (R28); si no queda ninguna, devolver `{ evaluated: 0, created: 0 }` sin más consultas.
3. `since = addDays(min(todayIn(tz, now)), -AVERAGE_WINDOW_DAYS)` sobre los dueños filtrados y `vehicles.listRecentReadingsByVehicles(ids, since)` (R34): una consulta, agrupada en memoria, sin N+1:
   ```sql
   SELECT … FROM odometer_readings r
   WHERE r.vehicle_id IN (…) AND (r.date >= :since
     OR r.date = (SELECT max(date) FROM odometer_readings WHERE vehicle_id = r.vehicle_id))
   ```
   Ambas ramas usan el índice `(vehicle_id, date)`. Incluye todas las lecturas de la fecha máxima (`latestOdometerReading` desempata por valor). Como `averageDailyDistance` filtra `date >= today - 90` y el estado solo usa la última lectura, el resultado es idéntico al del historial completo; usar el `today` mínimo solo añade lecturas que el filtro ignora.
4. Por regla: `computeScheduleDue(rule, readings, todayIn(tz, now))`; si no es `ok`, una fila con `vehicleId`, `type = schedule_<status>`, `title = rule.title`, `body = vehicle.name`, `link = /vehicles/<vehicleId>`, `dedupeKey = reminderDedupeKey(...)`.
5. `notifications.createMany(rows)`.

Como la dedupe es por estado y periodo (no por día), las 24 pasadas diarias crean como mucho un aviso por transición, y si el servidor estaba apagado a la hora elegida, la siguiente pasada del mismo día lo recupera.

`startRemindersJob` devuelve `null` si `!enabled`; si no, `new Cron(REMINDERS_CRON, { protect: true, catch: (e) => logger.error(e) }, run)`. `server.ts` lo llama con `run: () => app.log.info(runReminders({ db }), 'reminders job finished')` y hace `job?.stop()` al recibir la señal. `buildApp` no programa nada: los tests no tienen planificador.

## Contrato HTTP

Todas bajo `app.authenticate` (sin sesión → 401). Notificación inexistente o ajena → `NotFoundError('Notification not found')` (repo filtra por `userId`).

| Método y ruta | Entrada | Éxito | Errores |
|---|---|---|---|
| `GET /api/notifications` | query `limit?`, `offset?` | 200 `NotificationList` | 400 (zod), 401 |
| `PATCH /api/notifications/:id/read` | — | 200 `Notification` | 401, 404 |
| `POST /api/notifications/read-all` | — | 204 | 401 |
| `GET /api/settings` (existente) | — | 200 `UserSettings` con `reminderHour` | 401 |
| `PATCH /api/settings` (existente) | `reminderHour?` entero 0–23 | 200 `UserSettings` | 400 (zod), 401 |

```ts
notificationSchema = z.object({ id, type: z.enum(NOTIFICATION_TYPES), title: z.string(),
  body: z.string().nullable(), link: z.string().nullable(),
  readAt: z.iso.datetime().nullable(), createdAt: z.iso.datetime() });
notificationListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0) });
notificationListSchema = z.object({ items: z.array(notificationSchema),
  total: z.number().int(), unreadCount: z.number().int() });
```

Orden: `createdAt desc, rowid desc`. `dedupeKey` y `userId` no salen en el DTO. `PATCH` usa `readAt = coalesce(read_at, now)`.

## Web

- `notificationsQuery = queryOptions({ queryKey: queryKeys.notifications.list, queryFn: () => api.get<NotificationList>('/notifications'), refetchInterval: 60_000 })`. Primera página (20); `unreadCount` sale de la respuesta, no de la lista.
- `useMarkNotificationRead()` y `useMarkAllNotificationsRead()`: `useMutation` + `invalidateQueries({ queryKey: queryKeys.notifications.all })`.
- `NotificationBell`: `useQuery` normal (no suspense) para que la cabecera nunca se bloquee. Trigger `Button variant="ghost" size="icon"` con `Bell` y `aria-label` `t('notifications.open', { count })`; contador `span` absoluto `bg-destructive` («9+» si > 9). Panel `PopoverContent` (`align="end"`, colisiones de Radix: en escritorio la campana está al pie de la barra lateral) con cabecera (título + «Marcar todas como leídas» si hay no leídas), lista con scroll (`max-h-96`), estados cargando / vacío / error (`role="alert"`).
- Cada fila es un `<button>`: etiqueta del tipo (`notifications.types.<type>`, `label-caps`), `title` en negrita si no está leída + punto menta, `body` en `text-muted-foreground` y `format.dateTime(createdAt)`. Al pulsar: `mutate` si `readAt === null`, cerrar el popover y `navigate({ href: link })` (el `link` es un string sin tipar; `href` evita castear `to`).
- Solo tokens semánticos (`bg-card`, `border`, `text-muted-foreground`…): modo oscuro sin `dark:`. En móvil la campana es un icono más en la barra superior.
- **Ajustes:** desplegable «Hora de los recordatorios» tras «Día del recordatorio de odómetro», con opciones `00:00`…`23:00` (texto fijo `HH:00`, igual en ambos idiomas) y un `hint` «Te avisaremos a partir de esta hora en tu zona horaria». Usa el mismo `useForm` + `useUpdateSettings`: no hay mutación nueva.
- Test de componente con un router mínimo en memoria creado en el propio test (`createRootRoute` con la campana + ruta hija `/vehicles/$vehicleId`), `renderWithProviders` y `mockApi`.

## i18n

`notifications.title`, `notifications.open_one|_other` (`{{count}}`), `notifications.markAllRead`, `notifications.empty`, `notifications.error`, `notifications.loading`, `notifications.types.schedule_due_soon` («Mantenimiento próximo» / «Maintenance due soon»), `notifications.types.schedule_overdue` («Mantenimiento vencido» / «Maintenance overdue»).

## Decisiones a validar

1. **Textos de la notificación sin traducir en el servidor.** `title` y `body` guardan datos del usuario (título de la regla y nombre del vehículo); el texto traducible lo pone la web a partir de `type`. Así todos los textos viven en `es.json`/`en.json` y cambiar de idioma traduce también las notificaciones antiguas. Los canales push (feature futura) tendrán que componer su propio texto.
2. **Dedupe por periodo, no por día:** `schedule:<id>:<status>:<lastDoneDate>:<lastDoneOdometer>`. Un aviso por estado y periodo (uno al pasar a `due_soon`, otro al pasar a `overdue`, y de nuevo tras registrar el mantenimiento). Si el job encuentra la regla ya vencida, crea solo la de `overdue`. Editar los intervalos o umbrales no reavisa.
3. **Job cada hora + `reminderHour` por usuario (Gate 1).** Se aparta de la letra del acceptance («una vez al día»): el planificador corre cada hora y cada usuario recibe sus avisos en la primera pasada a partir de su hora local (por defecto 8:00). `TZ` del proceso deja de influir en los recordatorios: se actualiza su descripción en `README.md`/`.env.example`. No se ejecuta al arrancar; la siguiente pasada en punto recupera lo pendiente.
4. **`REMINDERS_ENABLED` (por defecto `true`)** en vez de `DISABLE_JOBS`: nombre por job, preparado para `odometer-nudge`.
5. **Paginación offset/limit** con `{ items, total, unreadCount }` (primera convención de paginación del proyecto). La campana solo pide la primera página; «cargar más» queda fuera.
6. **`POST read-all` → 204** y **`PATCH :id/read` → 200** con la notificación (idempotente).
7. **Sondeo cada 60 s** del listado mientras la app está abierta.

## Alternativas descartadas

- **Variable de entorno con la hora o el patrón cron:** obliga a tocar Docker/`.env` y es la misma hora para todos; el usuario no técnico la cambia desde Ajustes.
- **Un `Cron` por usuario a su hora:** hay que reprogramar al cambiar ajustes y no recupera avisos perdidos con el servidor apagado.
- **Cargar todo el historial de lecturas:** crece sin límite; la consulta acotada da el mismo resultado.
- **Programar croner dentro de `buildApp`** (hook `onReady`/`onClose`): obligaría a desactivarlo en cada test; en `server.ts` los tests quedan sin planificador gratis y `startRemindersJob` se prueba aparte.
- **Reutilizar `SchedulesService`** para evaluar: exige `userId` y consulta por vehículo (N+1 y propiedad innecesaria en un job global). Se usan los repos + `computeScheduleDue`.
- **`dedupe_key` con la fecha de hoy:** crearía un aviso diario por regla. **Con `nextDueDate`:** puede ser la fecha estimada y cambia cada día.
- **Contador de no leídas derivado en cliente:** falla en cuanto hay más de una página; lo calcula la API.

## Riesgos y fuera de alcance

- El job corre 24 veces al día: cada pasada hace la consulta de reglas aunque nadie esté en hora; es una sola consulta con join, despreciable en SQLite.
- Con varias réplicas de la API (hospedaje futuro), el planificador en proceso correría en cada réplica; el índice único de `dedupe_key` evita duplicados. Coordinarlo queda fuera de alcance.
- Fuera: canales push, `odometer-nudge.job`, lanzar jobs a mano, borrar notificaciones, scroll infinito, aviso por fecha estimada.
