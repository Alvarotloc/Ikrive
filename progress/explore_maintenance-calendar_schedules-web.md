# Explore: maintenance-calendar — schedules & web

Paths relative to repo root.

## 1. Cálculo de «next due» (shared, lo llama la API)
- `packages/shared/src/domain/schedules.ts`
  - `computeScheduleDue(rule: ScheduleRule, readings: readonly OdometerPoint[], today: string): ScheduleDue` (L72-110).
  - `ScheduleRule = {intervalMonths|null, intervalDistance|null, warnDays, warnDistance, lastDoneDate, lastDoneOdometer|null}`.
  - `ScheduleDue = {nextDueDate: string|null, nextDueDateEstimated: boolean, nextDueOdometer: number|null, status}`.
- Cálculo:
  - `dateByMonths = addMonths(lastDoneDate, intervalMonths)` (`addMonths` L22, recorta a fin de mes).
  - `nextDueOdometer = lastDoneOdometer + intervalDistance`.
  - `estimatedDate = addDays(latest.date, ceil(max(0, nextDueOdometer - latest.value) / avg))`.
  - `avg = averageDailyDistance(readings, today)` (L34): lecturas de los últimos 90 días, ≥2 que abarquen ≥30 días, media > 0; si no, null.
  - `nextDueDate` = la más temprana; `nextDueDateEstimated` = true si gana la estimación.
  - `status` solo mira `dateByMonths` y la última lectura, nunca la estimación.
- Regla solo-km sin datos para estimar → `nextDueDate = null` (`nextDueOdometer` puede existir si hay `lastDoneOdometer`). La web muestra `schedules.noData` solo si ambos son null.
- Fechas `YYYY-MM-DD` sin zona; `today` en la zona del usuario.
- La API lo usa en `apps/api/src/modules/schedules/service.ts` `toDto` (L22-34) con `today = todayIn(settings.timezone)` (L51-54); también `apps/api/src/jobs/reminders.job.ts:90`.
- La web no recalcula; lee el DTO.

## 2. Respuesta de la API
- `GET /api/vehicles/:id/schedules` → `MaintenanceSchedule[]` (`packages/shared/src/schemas/schedules.ts` L48-66, `maintenanceScheduleSchema`).
- Campos: `id, vehicleId, title, category, intervalMonths|null, intervalDistance|null, warnDays, warnDistance, lastDoneDate, lastDoneOdometer|null, nextDueDate|null, nextDueDateEstimated, nextDueOdometer|null, status ('ok'|'due_soon'|'overdue'), createdAt, updatedAt`.
- El DTO no trae el nombre del vehículo (la página del vehículo sí lo tiene).
- Query web: `schedulesQuery(vehicleId)` en `apps/web/src/features/schedules/queries.ts` L10.

## 3. Web
- Reglas: `apps/web/src/features/schedules/schedules-section.tsx`.
  - `SchedulesSection` (L26) montado en `apps/web/src/routes/_app/vehicles/$vehicleId/index.tsx:162` con `vehicle: Pick<Vehicle,'id'|'status'>` → habrá que ampliarlo para pasar el nombre.
  - `ScheduleRow` (L82-142), celda de acciones L128-139: botón editar (`Button variant="ghost" size="icon" className="size-9"`) + `DeleteScheduleDialog`. Ahí iría «Añadir al calendario».
  - Texto de vencimiento L103-111. Orden: `sortSchedules` en `features/schedules/schedules.ts`.
- UI en `apps/web/src/components/ui/`: badge, button, card, dialog (incl. AlertDialog), input, label, popover, select, textarea.
  - **No hay DropdownMenu**; `radix-ui` ^1.8.1 instalado → se puede añadir `dropdown-menu.tsx` al estilo de `popover.tsx` (Portal, `rounded-xl border bg-card shadow-float`).
  - Iconos `lucide-react`, toasts `sonner`.
  - No hay aún Blob/`createObjectURL`/`download=`: la descarga .ics sería la primera.
- i18n: `apps/web/src/i18n/locales/es.json` y `en.json`, anidado por feature (`…, schedules, notifications, notificationChannels`). Claves nuevas bajo `schedules.*`. Plurales `_one`/`_other`, interpolación `{{x}}`. Setup `apps/web/src/i18n/index.ts` (fallback es). `apps/web/src/i18n/locales.test.ts` falla si es/en no tienen las mismas claves. Categorías en `maintenance.categories.<cat>`.
- Tests de componente: ejemplo `apps/web/src/features/schedules/schedules-section.test.tsx` (factory `schedule(overrides)`, `renderWithProviders` + `mockApi` de `apps/web/src/test/render.tsx`, i18n en español, devuelve `userEvent`).

## 4. Organización de shared
- Lógica pura en `packages/shared/src/domain/*.ts` con test al lado (`schedules.ts`/`.test.ts`). Zod en `packages/shared/src/schemas/*.ts`.
- Re-export en `packages/shared/src/index.ts` (`export * from './domain/schedules'`) → añadir `domain/calendar.ts`.
- vitest; única dependencia zod. Ejemplo `packages/shared/src/domain/schedules.test.ts` (`today = '2026-06-30'`, factory `rule(overrides)`).

## 5. URL pública
- `BASE_URL` solo en la API: `apps/api/src/config.ts:14` (`z.url().default('http://localhost:3000')`), documentada en `.env.example`.
- Usos: `apps/api/src/auth.ts:16`, dispatcher (`apps/api/src/app.ts:104`, `server.ts:14`), `apps/api/src/modules/notification-channels/messages.ts:38` (`new URL(row.link, baseUrl)`; los recordatorios guardan `/vehicles/${vehicleId}` en `reminders.job.ts:98`).
- La web no tiene base URL (sin `VITE_*`; proxy dev `/api` → localhost:3000).
- `GET /api/config` (`clientConfigSchema` en `packages/shared/src/schemas/common.ts` L47; ruta `apps/api/src/modules/client-config/routes.ts`) solo devuelve `maxUploadMb`.
- Ruta front: `/vehicles/$vehicleId`.
- Opciones: `window.location.origin + '/vehicles/' + id` (mismo origen) o añadir `baseUrl` a `clientConfigSchema`. En cualquier caso, la función de shared recibe la base URL por parámetro.
