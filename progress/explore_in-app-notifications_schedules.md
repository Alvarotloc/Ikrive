# Exploración: evaluación de reglas de mantenimiento (para `in-app-notifications`)

## 1. Esquema de BD

- **`maintenance_schedules`** — `apps/api/src/db/schema/maintenance.ts:15-41`
  - `id`, `vehicleId` (FK vehicles, cascade), `title`, `category`, `intervalMonths` (nullable), `intervalDistance` (nullable, unidad del usuario), `warnDays`, `warnDistance` (notNull), `lastDoneDate` (`YYYY-MM-DD`, notNull), `lastDoneOdometer` (nullable), `createdAt`, `updatedAt`.
  - Índice `maintenance_schedules_vehicle_id_idx`. **No hay columna de estado**: next due / status se calculan al leer (comentario l.10-14).
  - `lastDoneDate/Odometer` se actualizan al crear/editar un registro de mantenimiento enlazado (`apps/api/src/modules/maintenance/service.ts:80-90`, solo si la fecha >= lastDoneDate). Esto cambia el "periodo" de la regla.
- **`vehicles`** — `apps/api/src/db/schema/vehicles.ts:10-44`: `ownerId` (FK `user.id`, cascade), `soldAt` (text, nullable), `archivedAt` (timestamp_ms, nullable). Índice `vehicles_owner_id_idx`.
  - **Activo = `soldAt IS NULL AND archivedAt IS NULL`**. El filtro ya existe como `statusFilter.active` en `apps/api/src/modules/vehicles/repository.ts:11-15` (no exportado). Estado derivado también en `vehicles/service.ts:29`.
- **`odometer_readings`** — `vehicles.ts:46-61`: `vehicleId`, `date`, `value`, `source`. Índice `(vehicle_id, date)`. El odómetro actual NO se guarda en el vehículo: es la lectura más reciente.
- **`user`** — `apps/api/src/db/schema/auth.ts:16-24` (`id`, `name`, `email`, `role`). Sin flag de baneo/desactivado.
- **`user_settings`** — `apps/api/src/db/schema/settings.ts`: `timezone` (IANA), `locale`, `distanceUnit`… Necesario para el "hoy" de cada usuario. Puede no existir fila (usuarios antiguos): `SettingsService.get()` hace upsert con defaults (`modules/settings/service.ts:11-14`).
- Última migración: `apps/api/src/db/migrations/0004_maintenance_schedules.sql` → la nueva será `0005_*`.

## 2. Cálculo del estado (puro y reutilizable)

`packages/shared/src/domain/schedules.ts` (exportado desde `@ikrive/shared`, `packages/shared/src/index.ts`):

```ts
export interface ScheduleRule { intervalMonths: number|null; intervalDistance: number|null; warnDays: number;
  warnDistance: number; lastDoneDate: string; lastDoneOdometer: number|null }           // l.49-56
export interface ScheduleDue { nextDueDate: string|null; nextDueDateEstimated: boolean;
  nextDueOdometer: number|null; status: ScheduleStatus }                                // l.58-65
export function computeScheduleDue(rule: ScheduleRule, readings: readonly OdometerPoint[], today: string): ScheduleDue  // l.71-106
```

- **Pura**, sin I/O ni `Date.now()`: `today` es parámetro (`YYYY-MM-DD`). Se puede llamar desde un job sin petición HTTP. Una fila de `maintenance_schedules` satisface `ScheduleRule` directamente (el service le pasa `row`).
- `readings`: `OdometerPoint {date, value}` (`domain/odometer.ts:1-4`); hace falta la lista completa de lecturas (o al menos los últimos 90 días + la última) porque calcula `latestOdometerReading` y `averageDailyDistance` (ventana 90 días, min 30 días de span) para la fecha estimada.
- Reglas del estado (l.93-103): `overdue` si `today >= addMonths(lastDoneDate, intervalMonths)` o `latest.value >= lastDoneOdometer + intervalDistance`; `due_soon` si `today >= dateByMonths - warnDays` o `latest.value >= nextDueOdometer - warnDistance`; si no `ok`. La fecha estimada NO influye en el estado (decisión en `docs/PLAN.md:164`).
- `ScheduleStatus = 'ok' | 'due_soon' | 'overdue'` — `packages/shared/src/enums.ts:44-46`.
- "Hoy" del usuario: `todayIn(timeZone, now = new Date())` en `apps/api/src/lib/dates.ts:2` (inyectable `now` → útil para tests del job).
- Uso actual: `apps/api/src/modules/schedules/service.ts:66-78` (`toDto`) y `context()` l.96-99 (`todayIn(settings.get(userId).timezone)` + `vehicles.listReadings(vehicleId)`). El service exige `userId` y ownership → no conviene para el job; usar repos + `computeScheduleDue` directamente.
- Tests unitarios existentes: `packages/shared/src/domain/schedules.test.ts` (l.92-180, casos due_soon/overdue).

## 3. Listar reglas de vehículos activos de TODOS los usuarios

Repos existentes (todos por vehículo/usuario, ninguno global):
- `createSchedulesRepository(db)` — `apps/api/src/modules/schedules/repository.ts:8-42`: `listByVehicle`, `find`, `create`, `update`, `delete`.
- `createVehiclesRepository(db)` — `apps/api/src/modules/vehicles/repository.ts:17-98`: `listByOwner(ownerId, status)`, `findOwned`, `listReadings(vehicleId)` (desc), `latestReading(vehicleId)`…

**Falta** una consulta global. Recomendación (en el repo del módulo de notificaciones/reminders o añadida al de schedules):
1. Una query: `maintenance_schedules INNER JOIN vehicles ON vehicles.id = schedules.vehicle_id LEFT JOIN user_settings ON user_settings.user_id = vehicles.owner_id WHERE vehicles.sold_at IS NULL AND vehicles.archived_at IS NULL` → devuelve schedule + `ownerId`, nombre/make/model del vehículo (para el título) + `timezone`/`locale` (fallback `DEFAULT_USER_SETTINGS`).
2. Una query de lecturas: `SELECT vehicle_id, date, value FROM odometer_readings WHERE vehicle_id IN (<ids>)` (opcionalmente acotado a `date >= today-91d` más la última por vehículo; para una instalación self-hosted basta con traerlas todas) y agrupar en memoria por `vehicleId`. Evita N+1.
3. Por regla: `today = todayIn(tz)`, `computeScheduleDue(row, readingsByVehicle.get(vehicleId) ?? [], today)`; si `status !== 'ok'` → insertar notificación con `onConflictDoNothing` sobre `dedupe_key`.
- Exportar/reutilizar `statusFilter.active` (hoy privado en `vehicles/repository.ts:11`) para no duplicar la definición de "activo".
- El job necesita `db` (y logger); hoy el wiring está en `apps/api/src/app.ts:60-91` (composition root) y el arranque en `apps/api/src/server.ts` (sin planificador; no hay croner/cron en el repo aún). `buildApp` sirve también en tests → registrar croner con un flag de config para que en `NODE_ENV=test` no arranque, y exponer `runReminders({db, now})` como función aparte.

## 4. Identificar el "periodo" para la dedupe_key

No hay ID de periodo almacenado; se puede derivar de la regla, porque `lastDoneDate`/`lastDoneOdometer` cambian cuando el mantenimiento se hace (ese es el inicio del nuevo periodo):
- **Recomendado**: `reminder:${scheduleId}:${status}:${lastDoneDate}:${lastDoneOdometer ?? ''}` → una notificación por regla, estado y periodo. Ejecutar dos veces el mismo día (o todos los días mientras sigue `due_soon`) no duplica; al pasar a `overdue` crea otra; al registrar el mantenimiento cambia `lastDone*` y el siguiente periodo vuelve a avisar.
- Alternativa: usar `nextDueDate`/`nextDueOdometer` de `ScheduleDue`, pero `nextDueDate` puede ser la **estimada** (cambia a diario con la media de km) → no estable; si se usa, tomar `addMonths(lastDoneDate, intervalMonths)` y `nextDueOdometer` (estables). Ojo: editar `intervalMonths/Distance` vía PATCH cambiaría la clave con esa alternativa; con `lastDone*` no.
- Evitar incluir la fecha de hoy en la clave (generaría una notificación diaria).
- Opcional: incluir `ownerId` no hace falta (scheduleId es UUID global).

## 5. Helpers de test de la API

- `apps/api/test/helpers.ts`:
  - `createTestApp(env?)` (l.8-21): `loadConfig` con `NODE_ENV=test` + DATA_DIR temporal, `createDb(':memory:')`, `runMigrations`, `buildApp`; devuelve `{ app, db, dataDir }` → `db` permite probar el job directamente contra la misma BD.
  - `signUp(app, email?, name?)` (l.26-35): registra por `/api/auth/sign-up/email`, devuelve `{ response, cookie }` (user id en `response.json().user.id`).
- `apps/api/test/schedules.test.ts:13-68`: patrón de fixtures — `setup(vehicle)` (app + signUp + vehículo), `createVehicle(app, cookie, fields)` (POST `/api/vehicles`), `client(app, cookie, vehicleId)` con `create` (POST schedules), `patch`, `createRecord`, `addReading(date, value)` (POST `/odometer`), etc. `today = () => todayIn('Europe/Madrid')` (zona por defecto). Usa `addDays` de shared para construir fechas relativas, y lee/escribe tablas con `db.select().from(maintenanceSchedules)` (l.101-105).
  - Estos helpers son locales al fichero (no exportados): para el test del job, copiarlos o moverlos a `helpers.ts`.
  - Archivar/vender vehículo: vía PATCH/acciones de `/api/vehicles/:id` (ver `apps/api/test/vehicles.test.ts`) o `db.update(vehicles).set({ archivedAt: new Date() })` directo.
- Test de dos usuarios / autorización: ejemplo en `schedules.test.ts:154` ("hides other users' vehicles and schedules").

## Recomendaciones resumidas
- Reutilizar `computeScheduleDue` + `todayIn`; no pasar por `SchedulesService`.
- Añadir una query global (join schedules+vehicles activos+user_settings) y una de lecturas por lote; exportar el filtro de vehículo activo.
- `dedupe_key` UNIQUE con `scheduleId:status:lastDoneDate:lastDoneOdometer`; insertar con `onConflictDoNothing`.
- Job como función pura-ish `runReminders({ db, now = new Date() })` que devuelve un resumen `{ created }` (útil también para la futura feature de admin jobs), y croner sólo en `server.ts`/plugin con flag de config desactivado en tests.
