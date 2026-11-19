# Implementación: #77 local-calendar-link

Feature `"sdd": false`: guiada por `description` y `acceptance` de `feature_list.json` (sin spec).

## Cambios por archivo

- `packages/shared/src/domain/calendar.ts`
  - `ScheduleEventInput.baseUrl: string | null`. Con `null` (no hay web a la que enlazar: modo local de la app nativa) el evento no lleva la línea «Ficha del vehículo» / «Vehicle page» ni `url`.
  - `CalendarEvent.url` pasa a opcional (`url?: string`); con `baseUrl` string el evento es idéntico al de antes.
  - `toICalendar` solo emite `URL:` si el evento tiene `url`.
  - El feed de la API (`apps/api/src/modules/calendar/service.ts`) sigue pasando su `BASE_URL` (string): no cambia.
- `apps/web/src/features/schedules/add-to-calendar.tsx`
  - `baseUrl: isLocalMode() ? null : (getServerUrl() ?? window.location.origin)`, usando `isLocalMode()` de `lib/app-mode.ts` (mecanismo existente: app nativa + `ikrive.mode = local`).
- `packages/shared/src/domain/calendar.test.ts`: tests de `baseUrl: null` y de iCal sin `URL:`.
- `apps/web/src/features/schedules/add-to-calendar.test.tsx`: tests del modo local (Google/Outlook y calendario del teléfono).

## Trazabilidad

| Acceptance | Test |
|---|---|
| A1 Modo local: evento sin «Ficha del vehículo» ni URL (nativo) | `apps/web/src/features/schedules/add-to-calendar.test.tsx` › `local mode: the phone calendar event has no vehicle page link`; › `local mode: Google and Outlook events have no vehicle page link` |
| A1 Modo local: iCal sin línea ni URL | `packages/shared/src/domain/calendar.test.ts` › `scheduleCalendarEvent` › `omits the vehicle page without a base URL (local mode)`; › `toICalendar` › `omits URL for an event without a vehicle page` |
| A2 Servidor y web sin cambios | `add-to-calendar.test.tsx` › `links Google and Outlook in a new tab` (web, origin), › `server mode: links the event to the server`, › `native: adds the schedule event to the phone calendar` (sin modificar); `calendar.test.ts` › `links the vehicle page`, › `serializes RFC 5545 iCalendar` (sin modificar) |
| A3 Tests de ambos modos | los anteriores |
| A4 Harness verde | ver abajo |

## `pnpm harness --full`

```
[OK]    80 features: 77 done, 2 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #77 local-calendar-link (in_progress)
[OK]    Rama actual: feat/local-calendar-link
[OK]    pnpm lint
[OK]    pnpm typecheck
[OK]    pnpm test      (shared 187, web 664, api 373, db 3: todos en verde)
[OK]    Arnés en verde.
```

## Desviaciones / notas

- En la app nativa (y por tanto en modo local, que solo existe en ella) el menú no ofrece «Descargar .ics», sino «Calendario del teléfono»; el «iCal descargado» del acceptance no es alcanzable hoy en modo local desde este menú. Aun así `toICalendar` omite `URL:` para eventos sin `url`, cubierto por test en shared.
- En modo local también se quita el enlace de Google Calendar y Outlook (comparten el mismo evento); era el mismo problema (enlace a `https://localhost`).
- Sin UI nueva: no se han sacado capturas.
- No se ha tocado la nota de `specs/mobile-local-core/design.md` ni `feature_list.json`. Sin commit.
