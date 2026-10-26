# Design — maintenance-calendar

Toca `packages/shared` (dominio puro), API (tabla nueva, módulo `calendar`), web (acción en la regla y sección en Ajustes) e i18n.

## Archivos

| Capa | Archivo | Cambio |
|---|---|---|
| shared | `packages/shared/src/domain/calendar.ts` (nuevo) + `index.ts` | `scheduleCalendarEvent`, `googleCalendarUrl`, `outlookCalendarUrl`, `toICalendar`, `CALENDAR_EVENT_TEXTS` (ver Firmas). Sin dependencias nuevas. |
| shared | `packages/shared/src/domain/calendar.test.ts` (nuevo) | Unitarios R1–R9. |
| shared | `packages/shared/src/schemas/calendar.ts` (nuevo) + `index.ts` | `calendarFeedSchema = { enabled: boolean, createdAt: string \| null }`, `calendarFeedSecretSchema = calendarFeedSchema.extend({ enabled: z.literal(true), createdAt: z.string(), url: z.url() })`. |
| api | `apps/api/src/db/schema/calendar.ts` (nuevo) + `schema/index.ts` | Tabla `calendar_feeds` (abajo). `pnpm db:generate` → `0008_*.sql`. |
| api | `apps/api/src/lib/tokens.ts` (nuevo) | `generateFeedToken()`, `parseFeedToken(token)`, `hashVerifier(verifier)`, `verifierMatches(verifier, hash)` con `timingSafeEqual`. |
| api | `apps/api/src/modules/schedules/repository.ts` | `listForOwnerActiveVehicles(ownerId)`: como `listForActiveVehicles` pero filtrado por dueño y sin el join de ajustes (devuelve `vehicleName/Make/Model`). |
| api | `apps/api/src/modules/calendar/{repository,service,routes}.ts` (nuevos) | Repo: `find(userId)`, `findBySelector(selector)`, `upsert(userId, { selector, verifierHash })`, `delete(userId)`. Servicio: `status`, `enable` (activar = regenerar), `disable`, `feed(token, now)`. Rutas: dos plugins, `calendarFeedSettingsRoutes` (con `app.authenticate`) y `calendarFeedRoutes` (público). |
| api | `apps/api/src/app.ts` | Composición: `createCalendarService({ repo, schedules: schedulesRepo, vehicles: vehiclesRepo, settings: settingsService, baseUrl: config.BASE_URL })`; registra ambos plugins bajo `/api`. |
| api | `apps/api/test/calendar.test.ts`, `apps/api/test/calendar-tokens.test.ts` (nuevos) | Integración del feed y de la gestión; unitarios de `lib/tokens.ts`. |
| web | `apps/web/src/components/ui/dropdown-menu.tsx` (nuevo) | Envoltorio de `DropdownMenu` de `radix-ui` al estilo de `popover.tsx` (Portal, `rounded-xl border bg-card shadow-float`, items de 44 px). |
| web | `apps/web/src/features/calendar/actions.ts` (nuevo) | `downloadIcs(filename, text)`: Blob `text/calendar` + `URL.createObjectURL` + `<a download>`. Única pieza «de navegador»: la app Capacitor la sustituirá por el calendario nativo. |
| web | `apps/web/src/features/schedules/add-to-calendar.tsx` (nuevo) + `.test.tsx` | `AddToCalendarMenu({ schedule, vehicle })`. |
| web | `apps/web/src/features/schedules/schedules-section.tsx` | `vehicle: Pick<Vehicle, 'id' \| 'status' \| 'name' \| 'make' \| 'model'>`; `AddToCalendarMenu` en la celda de acciones de `ScheduleRow`, antes de editar. `$vehicleId/index.tsx` ya pasa el `Vehicle` completo. |
| web | `apps/web/src/features/calendar-feed/{queries.ts, calendar-feed-section.tsx, calendar-feed-section.test.tsx}` (nuevos) | `calendarFeedQuery`, `useEnableCalendarFeed`, `useDisableCalendarFeed`; la sección de Ajustes. |
| web | `apps/web/src/routes/_app/settings.tsx`, `lib/query-keys.ts` | `queryKeys.calendarFeed = ['calendar-feed']`; `ensureQueryData(calendarFeedQuery)` en el loader; `<Suspense><CalendarFeedSection/></Suspense>` tras los canales. |
| web | `apps/web/src/features/settings/settings-page.test.tsx` | Añade `'GET /settings/calendar-feed'` al `mockApi`. |
| i18n | `apps/web/src/i18n/locales/{es,en}.json` | `schedules.calendar.*` (acción) y `calendarFeed.*` (Ajustes). |

## Base de datos

```ts
export const calendarFeeds = sqliteTable('calendar_feeds', {
  userId: text().primaryKey().references(() => user.id, { onDelete: 'cascade' }),
  selector: text().notNull(),       // índice único calendar_feeds_selector_idx
  verifierHash: text().notNull(),   // sha256 hex del verificador
  createdAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
});
```

Una fila por usuario; «desactivado» = sin fila. Regenerar = `upsert` que sustituye selector, hash y `createdAt` (el token anterior deja de existir). Borrar el usuario borra el feed. No va en `user_settings` para que el secreto no se cuele en `userSettingsSchema`.

## Token

Patrón selector/verificador: `token = selector (16 hex, 8 bytes) + verifier (64 hex, 32 bytes)` = 80 caracteres hex, sin separadores (así no hay puntos que confundan el `.ics`).

1. `parseFeedToken` exige `/^[0-9a-f]{80}$/`; si no, `null` → 404.
2. `findBySelector(selector)` (el selector no es secreto por sí solo).
3. `verifierMatches(verifier, row.verifierHash)`: `timingSafeEqual(sha256(verifier), Buffer.from(hash, 'hex'))`, con comprobación previa de longitud (devuelve `false`, no lanza).

## Contrato HTTP

| Método y ruta | Sesión | Respuestas |
|---|---|---|
| `GET /api/settings/calendar-feed` | sí | 200 `{ enabled: false, createdAt: null }` o `{ enabled: true, createdAt: "<ISO>" }`; 401 |
| `POST /api/settings/calendar-feed` (sin cuerpo) | sí | 200 `{ enabled: true, createdAt, url: "<BASE_URL>/api/calendar/<token>.ics" }`; 401 |
| `DELETE /api/settings/calendar-feed` | sí | 204 (también si ya estaba desactivado); 401 |
| `GET /api/calendar/:file` | no | 200 `text/calendar; charset=utf-8`, `cache-control: private, no-store`, cuerpo `toICalendar(...)`; 404 problem+json si `file` no termina en `.ics`, el token no parsea, no hay fila o el verificador no coincide (mismo `detail` en todos: `Calendar feed not found`) |

Se usa `:file` y se quita el sufijo `.ics` a mano en vez de `/:token.ics`: no depende de cómo `find-my-way` trate un punto tras un parámetro. La ruta pública entra en el rate limit global de `/api/*` (300/min); con 320 bits de token no hace falta uno propio.

## Feed: servicio

`feed(token, now)`:
1. Valida el token (arriba) → `userId`.
2. `settings.get(userId)` → `locale`, `timezone`, `distanceUnit`; `today = todayIn(timezone, now)`.
3. `schedules.listForOwnerActiveVehicles(userId)`; lecturas con `vehicles.listRecentReadingsByVehicles(ids, addDays(today, -AVERAGE_WINDOW_DAYS))` agrupadas por vehículo (como `reminders.job.ts`).
4. Por regla: `computeScheduleDue` → `scheduleCalendarEvent({ ..., baseUrl: BASE_URL, locale, distanceUnit })`; descarta los `null`.
5. `toICalendar(events, { now, name: 'Ikrive' })`.

## Firmas (shared)

```ts
export interface CalendarEvent { uid: string; date: string /* YYYY-MM-DD */; title: string; description: string; url: string }

export interface ScheduleEventInput {
  schedule: Pick<MaintenanceSchedule, 'id' | 'title' | 'nextDueDate' | 'nextDueDateEstimated' | 'nextDueOdometer'>;
  vehicle: { id: string; name: string }; // nombre ya resuelto (alias o marca + modelo)
  baseUrl: string;
  locale: Locale;
  distanceUnit: DistanceUnit;
}

export const CALENDAR_EVENT_TEXTS: Record<Locale, { dueAt: (distance: string) => string; estimated: string; vehiclePage: string }>;
export function scheduleCalendarEvent(input: ScheduleEventInput): CalendarEvent | null;
export function googleCalendarUrl(event: CalendarEvent): string;
export function outlookCalendarUrl(event: CalendarEvent): string;
export function toICalendar(events: readonly CalendarEvent[], options: { now: Date; name?: string }): string;
```

- Título: `${schedule.title} · ${vehicle.name}`. Descripción (líneas separadas por `\n`): `dueAt("15.000 km")` si hay `nextDueOdometer` (formato `Intl.NumberFormat(locale, { maximumFractionDigits: 0 })` + unidad, igual que `useFormat`), `estimated` si `nextDueDateEstimated`, y `${vehiclePage}: ${url}`.
- `url`: `new URL('/vehicles/' + vehicle.id, baseUrl).href`.
- iCalendar: `BEGIN:VCALENDAR`, `VERSION:2.0`, `PRODID:-//Ikrive//Ikrive//EN`, `CALSCALE:GREGORIAN`, `METHOD:PUBLISH`, `X-WR-CALNAME`; por evento `UID`, `DTSTAMP:<now UTC AAAAMMDDTHHMMSSZ>`, `DTSTART;VALUE=DATE`, `DTEND;VALUE=DATE` (+1 día con `addDays`), `SUMMARY`, `DESCRIPTION`, `URL`. Plegado por octetos UTF-8 sin partir caracteres multibyte. Sin eventos sigue siendo un `VCALENDAR` válido.

## UI

**Acción por regla** (`AddToCalendarMenu`): botón `ghost` `size="icon"` `size-9` con `CalendarPlus` y `aria-label` «Añadir «<título>» al calendario».
- Con fecha: `DropdownMenu` con tres items. Google y Outlook son `<a href target="_blank" rel="noopener noreferrer">` (`asChild`); «Descargar .ics» llama a `downloadIcs(<título-slug>.ics, toICalendar([event], { now: new Date() }))`. El evento usa `window.location.origin`, `i18n.language` y el `distanceUnit` de los ajustes.
- Sin fecha: el mismo botón con `aria-disabled="true"` y aspecto atenuado abre un `Popover` con `schedules.calendar.noDate` (un `disabled` real no se puede pulsar ni enseña nada en el móvil; mismo motivo que `InfoPopover`).

**Ajustes** (`CalendarFeedSection`, `Card` «Calendario»):
- Descripción fija (R27) con Google / Apple / Thunderbird / ICSx5.
- Desactivado: botón «Activar feed».
- Activo: «Activo desde <fecha>», botones «Regenerar» y «Desactivar», ambos con `AlertDialog` (regenerar avisa de que la URL anterior deja de funcionar).
- Tras `POST` (activar o regenerar): `Input readOnly` con la URL (se selecciona al enfocarlo) + botón «Copiar» (`navigator.clipboard.writeText`, toast «URL copiada»), y aviso de que solo se muestra ahora. La URL vive en el estado del componente; al recargar ya no se puede ver (está hasheada).
- Carga con `Suspense` como los canales; errores de la mutación → toast. Móvil: botones en columna con `flex-wrap`; modo oscuro por tokens.

## Alternativas descartadas

- **Token entero hasheado y búsqueda por hash** (índice único sobre `sha256(token)`): funciona, pero la comparación la hace el índice de SQLite y no en tiempo constante; el criterio lo pide explícito. Con selector/verificador la búsqueda va por un dato no secreto y el secreto se compara con `timingSafeEqual`.
- **Guardar el token en `user_settings`**: el DTO de ajustes se construye quitando `userId`, así que el secreto saldría en `GET /settings`.
- **Popover con tres botones en vez de `DropdownMenu`**: perdería la semántica `menu`/`menuitem` y la navegación con teclado que Radix da gratis.
- **Generar el `.ics` en la API para la descarga por regla**: obligaría a una petición más y no serviría en la futura app sin servidor; el criterio pide hacerlo en el navegador.

## Decisiones a validar (Gate 1)

1. **Textos del evento en `packages/shared` (`CALENDAR_EVENT_TEXTS`, es/en), no en `es.json`/`en.json`.** La API no tiene i18next y el feed necesita los mismos textos que la descarga; una sola fuente pura sirve a web, API y Capacitor. `es.json`/`en.json` llevan todos los textos de la interfaz. Si prefieres el criterio al pie de la letra, la alternativa es que la API lea los JSON de `apps/web` (acopla las apps).
2. **La URL del feed solo se ve al activarlo o regenerarlo** (consecuencia de guardarla hasheada). Después, la sección muestra «Activo desde…» y para recuperarla hay que regenerar.
3. **«Activar» y «Regenerar» son el mismo `POST`**; `DELETE` es idempotente (204 siempre).
4. **URL del feed y enlaces de sus eventos con `BASE_URL`**; los enlaces de la acción por regla con `window.location.origin` (no dependen de configurar `BASE_URL`).
5. **Rutas**: gestión en `/api/settings/calendar-feed`, feed en `/api/calendar/<token>.ics`.
6. **Outlook**: `outlook.live.com` (cuentas personales). Las cuentas de trabajo usan `outlook.office.com`; no se ofrece la segunda opción.
7. **El feed incluye fechas estimadas** (igual que la ficha), marcadas en la descripción.
8. **La acción aparece en todas las reglas**, también en vehículos vendidos o archivados (el feed sí los excluye, como pide el criterio).

## Riesgos

- `navigator.clipboard` solo existe en contexto seguro: en una instalación por `http://` en LAN el botón «Copiar» no funciona. Si no está disponible se oculta y queda el campo seleccionable.
- jsdom no implementa `URL.createObjectURL`: el test de la descarga lo sustituye con `vi.stubGlobal`/`vi.spyOn` (API del navegador, no el componente).
- Algunos clientes cachean el feed horas (Google hasta ~24 h): los cambios no son inmediatos. Fuera de nuestro control.

## Fuera de alcance

- Calendario nativo (Capacitor), recordatorios `VALARM` y zonas horarias en el `.ics` (son eventos de día completo).
- Feed por vehículo o filtros; varios feeds por usuario.
- Mostrar de nuevo la URL del feed sin regenerarla.
