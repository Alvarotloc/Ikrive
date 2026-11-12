# Design — web-data-layer

Dos partes independientes en una feature: **A** (reglas → `packages/shared`, la API las usa) y **B** (interfaz `DataSource` en la web, una implementación HTTP). Ninguna cambia peticiones, respuestas, BD ni UI; los tests existentes son la red (R26).

## Tamaño y posible división

Es grande pero mecánico: A ≈ 6 módulos puros pequeños (10–40 líneas cada uno) + sus tests y ~10 ficheros de la API que pasan a llamarlos; B ≈ 3 ficheros nuevos y 13 `queries.ts` + `client-config.ts` + `api-files.ts` con cambios de una línea por operación. A y B no se tocan entre sí, así que las tasks están ordenadas A → B y se pueden revisar por separado. Si en Gate 1 se prefiere, se divide en `shared-business-rules` (R1–R19) y `web-data-source` (R20–R27) sin reescribir nada (ver «Decisiones a validar»).

## A. Reglas en `packages/shared`

### Archivos

| Capa | Archivo | Cambio |
|---|---|---|
| shared | `src/domain/dates.ts` (nuevo) + test | `todayIn`, `hourIn`, `weekdayOf`, `isoWeekOf` movidos tal cual de `apps/api/src/lib/dates.ts` (R1) |
| shared | `src/domain/odometer-writes.ts` (nuevo) + test | `validateOdometerWrite`, `odometerConflictMessage`, `ReadingChange`, `maintenanceReadingChange`, `fuelReadingChange`, `canDeleteOdometerReading`, `initialOdometerReading` (R2–R7) |
| shared | `src/domain/schedules.ts` + test | `scheduleLastDoneUpdate`, `scheduleDefaults`, `hasIntervalAfterUpdate` (R8–R10) |
| shared | `src/domain/fuel.ts` + test | `editedFuelPrices` (R11), movido de `fuel-logs/service.ts` › `editedPrices` |
| shared | `src/domain/vehicles.ts` (nuevo) + test | `vehicleStatus`, `archivedAtAfterUpdate` (R12, R13) |
| shared | `src/domain/reminders.ts` (nuevo) + test | `NotificationDraft`, `reminderDedupeKey`, `isReminderTime`, `scheduleReminderNotification`, `ODOMETER_NUDGE_DAYS`, `odometerNudgeDedupeKey`, `isOdometerNudgeTime`, `odometerNudgeNotification` (R14–R17) |
| shared | `src/index.ts` | re-exporta los módulos nuevos |
| api | `src/lib/dates.ts` | se borra; los 9 importadores de `src/` y los 6 tests pasan a `@ikrive/shared` (solo cambia el import) |
| api | `modules/{vehicles,maintenance,fuel-logs}/service.ts` | `validate` → `validateOdometerWrite` + mapeo a `BadRequestError`/`ConflictError`; deciders de lectura; `statusOf`, `archivedAt`, `source !== 'manual'` y lectura inicial → shared (R18) |
| api | `modules/{maintenance,fuel-logs}/repository.ts` | `ReadingChange` se importa de shared (el de fuel es el subconjunto `keep`/`upsert`) |
| api | `modules/schedules/service.ts`, `modules/maintenance/service.ts` › `scheduleLastDone` | `scheduleDefaults`, `hasIntervalAfterUpdate`, `scheduleLastDoneUpdate`; la comprobación «el programado es de este vehículo» sigue en la API (consulta) |
| api | `jobs/reminders.job.ts`, `jobs/odometer-nudge.job.ts` | el bucle construye filas con `{ ...draft, userId, createdAt: now }`; re-exportan `isReminderTime`, `reminderDedupeKey`, `ODOMETER_NUDGE_DAYS`, `odometerNudgeDedupeKey` para no tocar los imports de sus tests (R19) |

Sin cambios de BD ni de contrato HTTP. Los textos de error de la API no cambian: el «future date» sigue siendo por entidad (`The maintenance date…`, `The fuel log date…`, `The reading date…`) y el de conflicto sale de `odometerConflictMessage`, idéntico al actual.

### Tipos y firmas

```ts
// dates.ts — idénticas a las de la API
export function todayIn(timeZone: string, now?: Date): string;
export function hourIn(timeZone: string, now?: Date): number;
export function weekdayOf(date: string): number;
export function isoWeekOf(date: string): string;

// odometer-writes.ts
export type OdometerWriteError = { kind: 'future_date' } | { kind: 'conflict'; conflict: OdometerPoint };
export function validateOdometerWrite(args: {
  readings: readonly (OdometerPoint & { id: string })[];
  ownReadingId?: string | null;
  date: string; odometer: number | null | undefined; today: string;
}): OdometerWriteError | null;
export const odometerConflictMessage: (conflict: OdometerPoint) => string;
export type ReadingChange = { kind: 'keep' } | { kind: 'remove' } | { kind: 'upsert'; date: string; value: number };
export function maintenanceReadingChange(
  record: { date: string; odometer: number | null },
  input: { date?: string; odometer?: number | null },
): ReadingChange;
export function fuelReadingChange(
  log: { date: string; odometer: number }, input: { date?: string; odometer?: number },
): Extract<ReadingChange, { kind: 'keep' | 'upsert' }>;
export const canDeleteOdometerReading: (reading: { source: OdometerSource }) => boolean;
export function initialOdometerReading(currentOdometer: number | null | undefined, today: string):
  { date: string; value: number; source: 'manual' } | undefined;

// schedules.ts
export function scheduleLastDoneUpdate(
  schedule: { lastDoneDate: string }, record: { date: string; odometer: number | null },
): { date: string; odometer: number | null } | null;
export function scheduleDefaults(
  input: { lastDoneDate?: string; lastDoneOdometer?: number | null },
  vehicle: { purchaseDate: string | null; purchaseOdometer: number | null },
  readings: readonly OdometerPoint[], today: string,
): { lastDoneDate: string; lastDoneOdometer: number | null };
export function hasIntervalAfterUpdate(
  schedule: { intervalMonths: number | null; intervalDistance: number | null },
  input: { intervalMonths?: number | null; intervalDistance?: number | null },
): boolean;

// fuel.ts
export function editedFuelPrices(
  stored: { quantity: number; totalPrice: number },
  input: { quantity?: number; totalPrice?: number; pricePerUnit?: number },
): { totalPrice?: number; pricePerUnit?: number };

// vehicles.ts — genérico en la fecha: la API usa Date, el modo local puede usar ISO strings
export const vehicleStatus: (v: { soldAt: unknown | null; archivedAt: unknown | null }) => VehicleStatus;
export function archivedAtAfterUpdate<T>(current: T | null, archived: boolean | undefined, now: T): T | null | undefined;

// reminders.ts
export interface NotificationDraft {
  vehicleId: string | null; type: NotificationType; title: string;
  body: string | null; link: string; dedupeKey: string;
}
export function isReminderTime(owner: { timezone: string; reminderHour: number }, now: Date): boolean;
export function reminderDedupeKey(scheduleId: string, status: 'due_soon' | 'overdue',
  rule: { lastDoneDate: string; lastDoneOdometer: number | null }): string;
export function scheduleReminderNotification(
  schedule: ScheduleRule & { id: string; title: string },
  vehicle: { id: string; name: string | null; make: string; model: string },
  readings: readonly OdometerPoint[], today: string,
): NotificationDraft | null;
export const ODOMETER_NUDGE_DAYS = 7;
export function odometerNudgeDedupeKey(userId: string, today: string): string;
export function isOdometerNudgeTime(
  owner: { timezone: string; reminderHour: number; weekday: number | null }, now: Date,
): boolean;
export function odometerNudgeNotification(args: {
  userId: string; today: string; timezone: string;
  vehicles: readonly { name: string | null; make: string; model: string;
    lastReadingDate: string | null; createdAt: Date }[];
}): NotificationDraft | null;
```

`scheduleReminderNotification` llama a `computeScheduleDue` (ya en shared). El job sigue cargando datos, filtrando por hora y por vehículo activo/usuario activo con SQL, y guardando/enviando: eso es orquestación con BD y #54 la reimplementa al abrir la app (decisión de PLAN).

## B. Capa de datos de la web

### Archivos

| Capa | Archivo | Cambio |
|---|---|---|
| web | `src/lib/data-source/types.ts` (nuevo) | `DataSource`, `DownloadedFile` (movido de `api-client.ts`, que lo re-exporta) |
| web | `src/lib/data-source/http.ts` (nuevo) | `httpDataSource: DataSource` sobre `api` (las rutas y cuerpos que hoy están en los `queries.ts`); construye el `FormData` con `file` |
| web | `src/lib/data-source/index.ts` (nuevo) | `dataSource()`, `setDataSource()` |
| web | `src/features/*/queries.ts` (13) y `src/lib/client-config.ts` | `queryFn`/`mutationFn` → `dataSource().<dominio>.<op>(…)`; keys, `refetchInterval`, `staleTime` e invalidaciones intactas |
| web | `src/features/auth/queries.ts` | `meQuery` → `dataSource().me()`; el 401 → `null` pasa a `http.ts` |
| web | `src/features/reports/queries.ts` | `useDownloadSaleReport` → `dataSource().saleReport.download(id, options)`; el guardado (`downloadBlob` + nombre por defecto) sigue en el hook |
| web | `src/lib/api-files.ts` | `api.downloadUrl(url)` → `dataSource().files.get(url)` (R25); la rama `isServerMode()` no cambia |

Sin cambios en rutas, componentes, i18n, API, `e2e/` ni Docker.

### Interfaz

```ts
export interface DownloadedFile { blob: Blob; fileName: string | null }

export interface DataSource {
  /** Usuario actual; null sin sesión. */
  me(): Promise<Me | null>;
  config(): Promise<ClientConfig>;
  settings: { get(): Promise<UserSettings>; update(changes: UpdateUserSettings): Promise<UserSettings> };
  vehicles: {
    list(status: VehicleListStatus): Promise<Vehicle[]>; get(id: string): Promise<Vehicle>;
    create(input: CreateVehicleInput): Promise<Vehicle>; update(id: string, changes: UpdateVehicleInput): Promise<Vehicle>;
    remove(id: string): Promise<void>; setPhoto(id: string, file: File): Promise<Vehicle>; removePhoto(id: string): Promise<Vehicle>;
  };
  odometer: { list(vehicleId); add(vehicleId, reading: CreateOdometerReading); remove(vehicleId, readingId) };
  fuelLogs: { list(vehicleId); create(vehicleId, log); update(vehicleId, logId, changes); remove(vehicleId, logId) };
  maintenance: { list(vehicleId); spending(vehicleId); create(vehicleId, record); update(vehicleId, recordId, changes); remove(vehicleId, recordId) };
  attachments: { list(vehicleId, recordId); upload(vehicleId, recordId, file: File); remove(vehicleId, recordId, attachmentId) };
  schedules: { list(vehicleId); create(vehicleId, schedule); update(vehicleId, scheduleId, changes); remove(vehicleId, scheduleId) };
  stats: { get(vehicleId) };
  saleReport: { download(vehicleId: string, options: SaleReportOptions): Promise<DownloadedFile> };
  reportShares: { list(vehicleId); create(vehicleId, body); revoke(vehicleId, shareId) };
  notifications: { list(); markRead(id); markAllRead() };
  notificationChannels: { list(); create(channel); update(id, changes); remove(id); test(id) };
  calendarFeed: { get(); enable(); disable() };
  dataPortability: { import(file: File): Promise<DataImportSummary> };
  adminUsers: { list(); setRole(id, role); disable(id); enable(id); remove(id) };
  /** Fichero de un DTO (`vehicle.photoUrl`, `attachment.url`) por su URL opaca. */
  files: { get(url: string): Promise<DownloadedFile> };
}
// (los tipos de cada operación son los que hoy pasan a api.get<T>/post<T>…; se escriben completos en types.ts)

let current: DataSource = httpDataSource;
export const dataSource = (): DataSource => current;
export function setDataSource(next: DataSource): void;   // #54 y los tests
```

Decisiones de la interfaz:

- **Grano:** una operación por llamada de hoy, agrupadas por dominio. Los `queries.ts` solo cambian el cuerpo de `queryFn`/`mutationFn`; las query keys y las invalidaciones se quedan donde están (las necesita igual el modo local).
- **Se resuelve en cada llamada** (`dataSource()` dentro de `queryFn`), no al importar: así #54 y los tests pueden cambiarla.
- **Ficheros:** las subidas reciben `File` (no `Blob`) porque la API guarda el nombre original del adjunto; `http.ts` construye el `FormData` con la parte `file`, como hoy. Las referencias a ficheros siguen siendo URLs opacas en los DTO (`photoUrl`, `attachment.url`); el modo local podrá emitir las suyas y resolverlas en `files.get`. La rama «mismo origen → `src` directo» de `useApiFileSrc` es una optimización de HTTP y se queda; #54 decidirá su condición.
- **Errores:** el contrato de rechazo es `ApiError` con un `Problem` RFC 7807 (el que ya usan ~10 sitios: 404, 409, 413…). El modo local lanzará el mismo tipo. `ApiError` sigue en `lib/api-client.ts`; no se mueve para no tocar esos sitios.
- **Todo `queries.ts` entra**, también admin, enlaces públicos, feed iCal y canales: así R21 es una regla simple y comprobable. El modo local las ocultará en la UI (PLAN) y su implementación podrá rechazar esas operaciones.

**Fuera de la interfaz (a propósito):** `authClient` (login, registro, logout en `routes/login.tsx`, `routes/register.tsx`, `use-logout.ts`), `lib/server.ts` y el cambio de servidor (`features/mobile/*`, `routes/server.tsx`), `check-server.ts` (`/api/health`) y `getServerUrl()` en `add-to-calendar.tsx`. Son del modo «Mi servidor» y el modo local no los usa (no hay cuenta ni servidor); #54 decidirá cómo se ocultan. Tampoco el export (`EXPORT_URL`, un enlace que el navegador descarga en streaming): cambiarlo a una operación de la interfaz cambiaría el comportamiento en mismo origen; #54 añadirá `dataPortability.export()` cuando genere el zip en cliente.

### Impacto en UI

Ninguno: mismos componentes, textos, estados de carga/error y peticiones.

## Alternativas descartadas

- **Interfaz de transporte genérica (`get/post(path)`) con un «servidor local» que enruta rutas HTTP.** Cambio mínimo en la web, pero obliga al modo local a reimplementar el enrutado y el parseo de rutas y cuerpos de la API, y no da tipos por operación. Descartada.
- **Hooks completos en la interfaz (`useVehicles()`…)**: movería keys e invalidaciones a cada implementación y las duplicaría. Descartada (guía del leader).
- **Mantener `apps/api/src/lib/dates.ts` como re-export de shared**: menos imports tocados, pero deja dos rutas para lo mismo. Se borra.
- **Mover también export/import, `sanitizeFileName` y el esquema local**: es de #54 (inventario #17–#20).

## Riesgos

- **Cambio sutil de reglas al moverlas.** Mitigación: código copiado tal cual, tests unitarios nuevos y los tests de integración de la API sin cambiar aserciones (R26), en especial `maintenance.test.ts`, `fuel-logs.test.ts`, `vehicles.test.ts`, `schedules.test.ts`, `reminders.test.ts` y `odometer-nudge.test.ts`.
- **`Intl` con zonas horarias en el bundle web.** `dates.ts` solo usa `Intl.DateTimeFormat`, disponible en navegador y WebView.
- **Imports circulares** `lib/data-source/http.ts` → `features/reports/sale-report.ts` (`saleReportPath`) → nada de `lib/data-source`: sin ciclo. La dependencia `lib → features` ya existe hoy en `api-client.ts`; no se arregla aquí.

## Decisiones a validar

1. **Una feature o dos.** Propuesta: una, con las tasks A → B. Alternativa: dividir en `shared-business-rules` (R1–R19) y `web-data-source` (R20–R27).
2. **Admin, enlaces públicos, feed iCal y canales dentro de la interfaz**, aunque el modo local los ocultará (regla simple para R21). Auth y cambio de servidor, fuera.
3. **`ApiError`/`Problem` como contrato de error** de cualquier `DataSource`, en lugar de un tipo de error de dominio nuevo.
4. **El export (`EXPORT_URL`) se queda fuera** hasta #54.
5. **Los tests de la API de `lib/dates` solo cambian el import** a `@ikrive/shared` (no se mueven ni se borran); shared añade los suyos.

## Fuera de alcance

Implementación local (#54), ocultar UI en modo local, export/import en cliente, PDF en cliente, `todayIso()` de la web (usa la zona del navegador; no cambia), mover `fileNameFromContentDisposition` fuera de `features/`.
