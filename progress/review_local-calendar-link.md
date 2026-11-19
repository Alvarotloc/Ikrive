# Review — #77 local-calendar-link

**Veredicto:** APPROVED

Feature `"sdd": false`: validada contra `description` y `acceptance` de `feature_list.json`, `CONTRIBUTING.md`, `docs/` y `CHECKPOINTS.md`. Diff revisado: `git diff` (sin commits en la rama) + `progress/impl_local-calendar-link.md` sin trackear.

## Trazabilidad acceptance ↔ tests
- A1 (modo local, evento nativo sin «Ficha del vehículo» ni URL): [x] `apps/web/src/features/schedules/add-to-calendar.test.tsx` › `local mode: the phone calendar event has no vehicle page link`. Activa `MODE=native` + `setLocalMode(true)`, pulsa «Calendario del teléfono» y compara con `toEqual` el evento exacto (descripción `Vence a los 135.000 km`, sin `url`).
- A1 (modo local, iCal): [x] `packages/shared/src/domain/calendar.test.ts` › `omits the vehicle page without a base URL (local mode)` (descripción exacta y sin `url`, también con descripción vacía) y › `omits URL for an event without a vehicle page` (sin líneas `URL`, `DESCRIPTION` correcta, `END:VEVENT` en su sitio). Ver aviso 1.
- A1 (Google/Outlook en local): [x] `add-to-calendar.test.tsx` › `local mode: Google and Outlook events have no vehicle page link` (`details` y `body` exactos).
- A2 (servidor y web no cambian): [x] los tests de antes siguen igual y en verde: `links Google and Outlook in a new tab`, `server mode: links the event to the server`, `native: adds the schedule event to the phone calendar`, `calendar.test.ts` › `links the vehicle page` y `serializes RFC 5545 iCalendar`. El feed de la API (`apps/api/src/modules/calendar/service.ts:86`) sigue pasando un `baseUrl` string y su salida no cambia (los 373 tests de la API pasan).
- A3 (tests de ambos modos): [x] los de arriba.
- A4 (harness): [x] `pnpm harness --full` en verde (lo he ejecutado: web 664, api 373, lint y typecheck OK).

## Tasks
- No hay `tasks.md` (feature sin spec). El plan de `progress/current.md` está completo.

## Checkpoints
- C1: [x] el arnés pasa, solo #77 está `in_progress` y la rama es `feat/local-calendar-link`.
- C2: [x] N/A en su forma SDD (`sdd: false`). Cada acceptance tiene un test concreto que he abierto y leído.
- C3: [x] solo cambian `packages/shared/src/domain/calendar.ts` y su test, `add-to-calendar.tsx` y su test, más el estado del arnés (`feature_list.json`: `status`; `progress/current.md`). No hay refactors ajenos.
- C4: [x] la lógica pura está en `packages/shared` con tests unitarios y el componente se queda en `features/schedules/`. No hay textos nuevos de i18n: se reutilizan los textos existentes en es y en.
- C5: [x] no hay `any`, `@ts-ignore` ni `console.log`. La fecha sigue en `YYYY-MM-DD`.
- C6: [x] el harness está en verde y los tests afirman valores exactos. No hay UI nueva, así que no hacen falta capturas.
- C7: [x] `impl_local-calendar-link.md` tiene archivos, trazabilidad y salida de la verificación. `current.md` está al día. `PLAN.md` no necesita cambios.

## Puntos pedidos por el leader
1. **`baseUrl: null` en shared sin tocar la API/feed:** correcto. `url` pasa a opcional en `CalendarEvent`. Con un string, el evento es idéntico al de antes, y lo garantizan los tests sin modificar y el spread condicional. Los otros consumidores siguen funcionando: `toICalendar` omite `URL:`, `googleCalendarUrl`/`outlookCalendarUrl` y `native-calendar.ts` no leen `url`. El typecheck pasa.
2. **«iCal descargado» en modo local:** es cierto que no se puede llegar a él. `isLocalMode()` (`apps/web/src/lib/app-mode.ts`) exige `isNativeApp()`, y `add-to-calendar.tsx` en nativo muestra «Calendario del teléfono» en vez de «Descargar .ics». Hoy no hay ningún camino de UI que descargue un `.ics` en modo local. Basta con cubrirlo en shared: si algún día se añade, `toICalendar` ya omite `URL:` y eso está probado.
3. **Google/Outlook sin enlace en local:** es coherente. Los tres destinos comparten el mismo `CalendarEvent`, y el enlace a `https://localhost/vehicles/<id>` es igual de inútil en Google/Outlook que en el calendario del teléfono. La description de la feature habla de «el evento que genera "Añadir al calendario"» en general.

## Hallazgos
Ninguno bloqueante.

## Avisos para el humano (no bloquean)
- El texto del acceptance menciona un «iCal descargado» que no existe en modo local (ver punto 2). Está cubierto a nivel de shared, pero no hay test de UI porque no hay UI.
- Los tests de modo local solo cubren `es`. El comportamiento no depende del idioma: la línea se omite antes de traducirla.

## Cambios requeridos
Ninguno.
