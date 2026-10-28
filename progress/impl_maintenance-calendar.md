# Implementación — maintenance-calendar (#19)

Rama `feat/maintenance-calendar`, sin commits (los hace el leader tras Gate 2). T1–T21 marcadas en `specs/maintenance-calendar/tasks.md`.

## Cambios por archivo

### packages/shared
- `src/domain/calendar.ts` (nuevo): `CalendarEvent`, `ScheduleEventInput`, `CALENDAR_EVENT_TEXTS` (es/en, decisión 1 aprobada), `scheduleCalendarEvent`, `googleCalendarUrl`, `outlookCalendarUrl`, `toICalendar` (CRLF, escapado TEXT, plegado a 75 octetos por code point, `DTSTAMP` UTC, `DTEND` +1 día con `addDays`).
- `src/domain/calendar.test.ts` (nuevo): 13 tests (T2–T4).
- `src/schemas/calendar.ts` (nuevo): `calendarFeedSchema`, `calendarFeedSecretSchema`.
- `src/index.ts`: exporta ambos.

### apps/api
- `src/db/schema/calendar.ts` (nuevo) + `schema/index.ts`: tabla `calendar_feeds` (`userId` PK/FK cascade, `selector` con índice único `calendar_feeds_selector_idx`, `verifierHash`, `createdAt`).
- `src/db/migrations/0008_calendar_feeds.sql` + `meta/0008_snapshot.json` + `_journal.json`: generados con `pnpm db:generate --name calendar_feeds`.
- `src/lib/tokens.ts` (nuevo): `generateFeedToken`, `parseFeedToken`, `hashVerifier`, `verifierMatches` (`crypto.timingSafeEqual` sobre el import por defecto, con comprobación previa de longitud).
- `src/modules/schedules/repository.ts`: `listForOwnerActiveVehicles(ownerId)`.
- `src/modules/calendar/{repository,service,routes}.ts` (nuevos): repo `find/findBySelector/upsert/delete`; servicio `status/enable/disable/feed`; plugins `calendarFeedSettingsRoutes` (con `app.authenticate`) y `calendarFeedRoutes` (público, `GET /calendar/:file`, `text/calendar; charset=utf-8`, `cache-control: private, no-store`, 404 `Calendar feed not found` para cualquier fallo).
- `src/app.ts`: composición de `createCalendarService` y registro de los dos plugins bajo `/api`.
- `test/calendar-tokens.test.ts` (nuevo, 5 tests) y `test/calendar.test.ts` (nuevo, 13 tests).

### apps/web
- `src/components/ui/dropdown-menu.tsx` (nuevo): envoltorio Radix (`Portal`, `rounded-xl border bg-card shadow-float`, items `min-h-11`).
- `src/features/calendar/actions.ts` (nuevo): `downloadIcs(filename, text)`.
- `src/features/schedules/add-to-calendar.tsx` (nuevo) + `.test.tsx` (4 tests): `AddToCalendarMenu`.
- `src/features/schedules/schedules-section.tsx`: prop `vehicle` ampliada (`id | status | name | make | model`), `ScheduleRow` recibe el vehículo y muestra `AddToCalendarMenu` antes de editar.
- `src/features/calendar-feed/{queries.ts, calendar-feed-section.tsx, calendar-feed-section.test.tsx}` (nuevos, 4 tests).
- `src/lib/query-keys.ts`: `calendarFeed`.
- `src/routes/_app/settings.tsx`: `ensureQueryData(calendarFeedQuery)` + `<Suspense><CalendarFeedSection/></Suspense>` tras los canales.
- `src/i18n/locales/{es,en}.json`: `schedules.calendar.*` y `calendarFeed.*` (mismas claves).
- Tests existentes ajustados: `schedules-section.test.tsx` y `maintenance/maintenance-form.test.tsx` (prop `vehicle`), `settings/settings-page.test.tsx` y `settings/use-user-locale.test.tsx` (`GET /settings/calendar-feed` en el `mockApi`).

## Trazabilidad

| R | Archivo › test |
|---|---|
| R1 | `packages/shared/src/domain/calendar.test.ts` › builds an all-day event on the next due date |
| R2 | `calendar.test.ts` (shared) › titles the event with the schedule and the vehicle |
| R3 | `calendar.test.ts` (shared) › describes the due odometer in the locale and unit |
| R4 | `calendar.test.ts` (shared) › links the vehicle page |
| R5 | `calendar.test.ts` (shared) › returns null without a next due date |
| R6 | `calendar.test.ts` (shared) › derives the uid from the schedule id |
| R7 | `calendar.test.ts` (shared) › builds the Google Calendar link |
| R8 | `calendar.test.ts` (shared) › builds the Outlook link |
| R9 | `calendar.test.ts` (shared) › serializes RFC 5545 iCalendar · escapes text values · folds lines at 75 octets · serializes an empty calendar |
| R10 | `apps/web/src/features/schedules/add-to-calendar.test.tsx` › offers Google, Outlook and .ics |
| R11 | `add-to-calendar.test.tsx` › links Google and Outlook in a new tab |
| R12 | `add-to-calendar.test.tsx` › downloads an .ics file |
| R13 | `add-to-calendar.test.tsx` › explains why a schedule without date cannot be added |
| R14 | `apps/api/test/calendar.test.ts` › reports a disabled feed · enables the feed |
| R15 | `apps/api/test/calendar.test.ts` › enables the feed |
| R16 | `apps/api/test/calendar.test.ts` › returns 404 after regenerating |
| R17 | `apps/api/test/calendar.test.ts` › disables the feed · returns 404 after disabling |
| R18 | `apps/api/test/calendar.test.ts` › requires a session |
| R19 | `apps/api/test/calendar.test.ts` › stores only the selector and the verifier hash; `apps/api/test/calendar-tokens.test.ts` › generates 80-char hex tokens · matches only the right verifier |
| R20 | `calendar-tokens.test.ts` › compares in constant time · returns false for a hash of another length |
| R21 | `apps/api/test/calendar.test.ts` › serves the feed without a session |
| R22 | `apps/api/test/calendar.test.ts` › includes one event per dated schedule of active vehicles |
| R23 | `apps/api/test/calendar.test.ts` › keeps the uid when a schedule changes |
| R24 | `apps/api/test/calendar.test.ts` › returns 404 for an unknown token · returns 404 after regenerating · returns 404 after disabling · returns 404 without the .ics suffix or with a malformed token |
| R25 | `apps/api/test/calendar.test.ts` › uses the owner's settings |
| R26 | `apps/web/src/features/calendar-feed/calendar-feed-section.test.tsx` › explains the feed and offers to enable it · disables after confirming |
| R27 | `calendar-feed-section.test.tsx` › explains the feed and offers to enable it |
| R28 | `calendar-feed-section.test.tsx` › shows the URL with a copy button after enabling |
| R29 | `calendar-feed-section.test.tsx` › regenerates after confirming |
| R30 | `calendar-feed-section.test.tsx` › disables after confirming |
| R31 | `apps/web/src/i18n/locales.test.ts` (mismas claves es/en; en verde) |

## Revisión visual (T20)

Instancia aislada (API + SPA compilada en el puerto 3100, `DATA_DIR` temporal) con playwright-core contra `/usr/bin/google-chrome`. Capturas en `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/c60f2cba-08fa-4d62-b469-da2b80882f99/scratchpad/shots/`:

- Menú de la regla: `schedule-menu-light.png`, `schedule-menu-dark.png`, `schedule-menu-mobile.png`
- Regla sin fecha (explicación): `schedule-nodate-light.png`, `schedule-nodate-dark.png`, `schedule-nodate-mobile.png`
- Ajustes, feed desactivado: `feed-disabled-light.png`
- Diálogo de regenerar: `feed-regenerate-dialog-dark.png`, `feed-regenerate-dialog-mobile.png`
- URL + Copiar tras activar/regenerar: `feed-url-light.png`, `feed-url-dark.png`, `feed-url-mobile.png`

## `pnpm harness --full`

```
[OK]    21 features: 20 done, 0 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #19 maintenance-calendar (in_progress)
[OK]    Rama actual: feat/maintenance-calendar
[OK]    pnpm lint
[OK]    pnpm typecheck
[OK]    pnpm test      (shared 7 files · api 21 files / 171 tests · web 25 files / 183 tests)
[OK]    Arnés en verde.
```

Los avisos `Not implemented: Window's scrollTo()` de jsdom ya salían antes (los emite también `notification-bell.test.tsx`, que no se ha tocado).

## Desviaciones y notas

1. **Sin `URL`/`TextEncoder` en `packages/shared`.** El paquete no tiene tipos DOM ni Node (misma restricción que documenta `schemas/notification-channels.ts`). El enlace a la ficha se construye con el origen de `baseUrl` (`scheme://host[:port]` + `/vehicles/<id>`, igual que `new URL('/vehicles/id', base)`), los enlaces de Google/Outlook con `encodeURIComponent`, y los octetos UTF-8 se cuentan por code point. Por eso los tests de shared (T3) parsean el enlace con un helper propio en vez de con `URL`; el test de componente (T16) sí usa `URL`.
2. **Tests existentes tocados fuera de la lista de `design.md`:** `maintenance/maintenance-form.test.tsx` (renderiza `SchedulesSection`, necesita la prop `vehicle` ampliada) y `settings/use-user-locale.test.tsx` (renderiza la página de Ajustes, necesita el mock de `GET /settings/calendar-feed`). Solo datos de prueba, sin cambiar lo que afirman.
3. **Migración nombrada** `0008_calendar_feeds.sql` (`pnpm db:generate --name calendar_feeds`) para seguir el patrón de nombres de las anteriores.
4. Textos: `CALENDAR_EVENT_TEXTS` es «Vence a los 15.000 km» / «Due at 15,000 mi», «Fecha estimada a partir de los kilómetros recorridos» / «Date estimated from the distance driven», «Ficha del vehículo» / «Vehicle page». Nombre del `.ics` descargado: slug del título del evento (p. ej. `cambio-de-aceite-renault-clio.ics`). «Activo desde» se muestra con fecha y hora en la zona del usuario (`format.dateTime`).
5. **Aviso para el humano:** su `pnpm dev` (lanzado a las 11:46 desde este repo) se recargó solo con `tsx watch`, así que la migración `0008_calendar_feeds` ya está aplicada en su BD de desarrollo (`./data`). Es una tabla nueva, sin tocar datos existentes. Las capturas se hicieron en una instancia aparte con BD temporal; no se tocó su BD ni sus procesos.

## Cambios de Gate 2

Pedidos por el humano sobre los avisos 2, 3 y 4 del reviewer (T22–T24 en `tasks.md`).

### Archivos

- `apps/api/src/lib/logging.ts` (nuevo): `redactUrl` (cualquier URL cuya ruta, ya decodificada, empiece por `/api/calendar/` — con querystring, fragmento, token malformado, subrutas o `%63alendar` — se registra como `/api/calendar/***.ics`; el resto no cambia), `serializeRequest` (el serializador `req` por defecto de Fastify con la URL oculta) y `loggerOptions(level, stream?)`.
- `apps/api/src/app.ts`: el logger usa `loggerOptions`; `AppDeps.logStream` opcional. Con `NODE_ENV=test` el logger sigue apagado salvo que se pase `logStream`.
- `apps/api/test/helpers.ts`: `createTestApp(env, { logStream })`.
- `apps/api/test/logging.test.ts` (nuevo): unitarios de `redactUrl` y test de integración que captura la salida real de pino (POST de gestión, GET del feed con querystring, token malformado → 404, subruta → 404) y comprueba que ni el token, ni el token sin su primer carácter, ni el selector aparecen, y que las tres peticiones al feed se registran como `/api/calendar/***.ics`.
- `apps/api/test/calendar.test.ts`: `computes today in the owner's time zone`. Reloj fijado (`vi.useFakeTimers({ toFake: ['Date'] })`) en `2026-06-15T18:00:00Z` (16 de junio en Auckland). Lecturas 17/3 (10.000), 2/4 (11.000) y 1/6 (17.000); regla cada 10.000 km desde 10.000. Con `Pacific/Auckland` la lectura del 17/3 cae fuera de la ventana de 90 días → 100 km/día → `DTSTART 20260701`; tras cambiar a `UTC` entra → 7.000/76 → `DTSTART 20260704`.
- `packages/shared/src/domain/calendar.ts`: `escapeText` sustituye `\r\n|\r|\n` por `\n` escapado.
- `packages/shared/src/domain/calendar.test.ts`: `escapes a lone carriage return` y `escapes mixed line breaks in the title, the vehicle name and the description` (sin CR/LF sueltos fuera de los CRLF de fin de línea; `SUMMARY`/`DESCRIPTION` exactos).

### Trazabilidad añadida

| Requirement | Test |
|---|---|
| R9 | `calendar.test.ts` (shared) › escapes a lone carriage return · escapes mixed line breaks in the title, the vehicle name and the description |
| R21, R24 | `apps/api/test/logging.test.ts` › hides any calendar feed path · keeps other urls · never log the calendar feed token |
| R25 | `apps/api/test/calendar.test.ts` › computes today in the owner's time zone |

### `pnpm harness --full`

```
[OK]    pnpm lint
[OK]    pnpm typecheck
[OK]    pnpm test      (shared 7 files / 50 tests · api 22 files / 175 tests · web 25 files / 183 tests)
[OK]    Arnés en verde.
```

### Notas

1. **Logs: alcance.** Se oculta `req.url`, que es lo único que Fastify registra de la URL (las líneas «request completed» solo llevan `res.statusCode`). No se ha tocado el serializador `err`: ningún error de la ruta del feed incluye la URL en su mensaje y el 404 de rutas desconocidas lo responde nuestro `setNotFoundHandler`, que no registra nada. Fuera de `apps/api` (proxy inverso delante del contenedor) el token puede seguir apareciendo en sus logs de acceso; eso no depende de la app.
2. **Validación de títulos (no cambiada).** `scheduleFieldsSchema.title` es `z.string().trim().min(1).max(120)` (`packages/shared/src/schemas/schedules.ts`); se podría añadir `.regex(/^[^\p{Cc}]*$/u)` en una línea para rechazar caracteres de control, y lo mismo en el nombre del vehículo. Cambiaría la respuesta a títulos existentes que los tuvieran al editarlos (400), y los datos ya guardados no se ven afectados en lectura. Fuera de alcance; con el escapado actual el `.ics` ya es válido en cualquier caso.

### Re-revisión Gate 2 (T25–T26)

Avisos de la re-revisión cerrados ahora por ser baratos.

- `apps/api/src/lib/logging.ts`: `redactUrl` compara el prefijo `/api/calendar/` sobre la ruta normalizada (decodificada, barras repetidas colapsadas, en minúsculas): `//api/calendar/<t>.ics`, `/api//calendar/<t>.ics`, `/API/calendar/<t>.ics`, `/api%2Fcalendar/…` → `/api/calendar/***.ics`. Defensa en profundidad: en cualquier otra URL, cada racha de 32+ dígitos hex (sin distinguir mayúsculas) se sustituye por `***`; si solo aparece al decodificar (hex codificado con `%xx`), se registra la URL decodificada ya redactada. Las URLs normales (UUIDs con guiones, rachas < 32) no cambian.
- `apps/api/test/logging.test.ts`: variantes nuevas en `hides any calendar feed path`, UUIDs y 31 hex en `keeps other urls`, y test nuevo `hides long hex runs anywhere in the url` (ruta, querystring, varias rachas, token codificado a medias con `%xx`).
- `packages/shared/src/domain/calendar.ts`: `escapeText` elimina `[^\P{Cc}\t]` (todo control salvo HTAB) tras convertir los saltos de línea en `\n` escapado.
- `packages/shared/src/domain/calendar.test.ts`: `drops control characters other than tab` (`\v`, `\f`, `\0`, DEL, ESC, U+0085 eliminados; el tab se conserva; el salto de línea sigue como `\n`).

| Requirement | Test |
|---|---|
| R9 | `calendar.test.ts` (shared) › drops control characters other than tab |
| R21, R24 | `apps/api/test/logging.test.ts` › hides any calendar feed path · keeps other urls · hides long hex runs anywhere in the url |

```
[OK]    pnpm lint
[OK]    pnpm typecheck
[OK]    pnpm test      (shared 51 tests · api 176 tests · web 183 tests)
[OK]    Arnés en verde.
```

Sin desviaciones del spec.
