# Review — #19 maintenance-calendar

**Veredicto:** APPROVED

Revisado sobre `feat/maintenance-calendar`: `git diff main...HEAD` (solo el commit del spec), `git diff` y los archivos sin trackear (`git status --porcelain`), leídos enteros. `pnpm harness --full` ejecutado por el reviewer: verde (api 21 ficheros / 171 tests, web 25 / 183, shared en verde, lint y typecheck OK).

## Trazabilidad requirements ↔ tests

- R1: [x] `packages/shared/src/domain/calendar.test.ts:56` › `builds an all-day event on the next due date` (fecha real y estimada → `date` exacto; día completo lo confirman `DTSTART/DTEND;VALUE=DATE` en `:149`)
- R2: [x] `calendar.test.ts:61` › `titles the event…` (`'Cambio de aceite · Clio'`); también en API `apps/api/test/calendar.test.ts:237` (`SUMMARY:Aceite · Clio`)
- R3: [x] `calendar.test.ts:65` › `describes the due odometer…` (es `Vence a los 15.000 km`, en `Due at 15,000 mi`, ausente sin `nextDueOdometer`)
- R4: [x] `calendar.test.ts:84` › `links the vehicle page` (`url` y última línea de la descripción; base con `/` final y con puerto)
- R5: [x] `calendar.test.ts:95` › `returns null without a next due date`
- R6: [x] `calendar.test.ts:99` › `derives the uid from the schedule id` (mismo UID al cambiar título/fecha, otro con otro id)
- R7: [x] `calendar.test.ts:109` › `builds the Google Calendar link` (base exacta, `toEqual` de todos los parámetros, fin de año y fin de febrero)
- R8: [x] `calendar.test.ts:123` › `builds the Outlook link` (base exacta, `toEqual` de los 5 parámetros, fin de mes)
- R9: [x] `calendar.test.ts:149/174/181/192` › serialización completa línea a línea con CRLF final y sin LF sueltos, `DTSTAMP:20261026T090503Z`, `DTEND` +1 día; escapado de `\ ; , \n`; plegado ≤75 octetos con acentos y emoji y round-trip; calendario vacío exacto
- R10: [x] `apps/web/src/features/schedules/add-to-calendar.test.tsx:40` › tres `menuitem` con sus textos
- R11: [x] `add-to-calendar.test.tsx:50` › `target="_blank"`, `rel`, host y parámetros de Google y Outlook
- R12: [x] `add-to-calendar.test.tsx:81` › Blob `text/calendar` con `BEGIN:VCALENDAR`, UID y `DTSTART`; `<a download="cambio-de-aceite-renault-clio.ics">` pulsado
- R13: [x] `add-to-calendar.test.tsx:114` › `aria-disabled="true"`, explicación visible al pulsar, sin `menuitem`
- R14: [x] `apps/api/test/calendar.test.ts:129` y `:136` › `{ enabled: false, createdAt: null }` y, tras activar, `{ enabled: true, createdAt }` igual al del POST
- R15: [x] `calendar.test.ts:136` › 200, `url` `^http://localhost:3000/api/calendar/[0-9a-f]{80}\.ics$`, `createdAt` ISO
- R16: [x] `calendar.test.ts:300` › URL anterior → 404 problem+json, nueva → 200
- R17: [x] `calendar.test.ts:165` y `:311` › 204, fila borrada, estado desactivado, idempotente, URL → 404
- R18: [x] `calendar.test.ts:178` › GET/POST/DELETE sin cookie → 401 `application/problem+json`
- R19: [x] `calendar.test.ts:148` › la fila guarda el selector y `sha256(verifier)`; ni token ni verificador en la fila
- R20: [x] `apps/api/test/calendar-tokens.test.ts:48` › `vi.spyOn(crypto, 'timingSafeEqual')` llamado una vez por validación (acierto y fallo); `:39` longitud distinta → `false` sin lanzar
- R21: [x] `calendar.test.ts:189` › sin sesión: 200, `content-type` exacto `text/calendar; charset=utf-8`, `cache-control: private, no-store`
- R22: [x] `calendar.test.ts:201` › exactamente 2 `BEGIN:VEVENT`; regla solo km sin datos, vehículo archivado, vendido y regla de otro usuario ausentes
- R23: [x] `calendar.test.ts:245` › mismo UID tras el PATCH, `DTSTART` cambia de `20270115` a `20260715`
- R24: [x] `calendar.test.ts:295–338` › token desconocido, regenerado, desactivado, sin `.ics`, `.ical`, longitud corta, mayúsculas, verificador incorrecto y `.ics` vacío → 404 problem+json con el mismo `detail`
- R25: [x] `calendar.test.ts:268` › `locale: 'en'`, `distanceUnit: 'mi'` → `DESCRIPTION:Due at 15\,000 mi\nVehicle page: …` (ver aviso 3 sobre la zona horaria)
- R26: [x] `apps/web/src/features/calendar-feed/calendar-feed-section.test.tsx:164` y `:220` › sección «Calendario» con «Activar feed»; vuelve tras desactivar
- R27: [x] `calendar-feed-section.test.tsx:164` › texto de Google/internet y Apple/Thunderbird/ICSx5 en red local o VPN
- R28: [x] `calendar-feed-section.test.tsx:176` › POST enviado, `textbox` «URL del feed» `readonly` con la URL, «Copiar» llama a `writeText(URL_1)` y toast
- R29: [x] `calendar-feed-section.test.tsx:199` › diálogo con el aviso, cancelar → 0 POST, confirmar → 1 POST y URL nueva
- R30: [x] `calendar-feed-section.test.tsx:220` › 1 DELETE y vuelve «Activar feed»
- R31: [x] `apps/web/src/i18n/locales.test.ts` (paridad de claves es/en, en verde); claves `schedules.calendar.*` y `calendarFeed.*` presentes en ambos JSON. Los textos del evento en `CALENDAR_EVENT_TEXTS` son la decisión 1 aprobada por el humano.

## Tasks
- T1..T21: [x]

## Checkpoints
- C1: [x] `pnpm harness` OK · una sola feature activa (#19 `in_progress`) · rama `feat/maintenance-calendar`
- C2: [x] tres archivos del spec · EARS con tabla de acceptance completa · T1–T21 `[x]` · cada R abierto y leído (arriba)
- C3: [x] el diff se ciñe a `design.md`. Fuera de la lista solo `maintenance-form.test.tsx` y `use-user-locale.test.tsx`, justificados en el informe (datos de prueba por la prop `vehicle` ampliada y el nuevo `GET` del loader; no cambian lo que afirman)
- C4: [x] módulo `calendar/{repository,service,routes}.ts` cableado en `app.ts`, respuestas validadas con `calendarFeedSchema`/`calendarFeedSecretSchema` · propiedad: feed solo del dueño del token (otro usuario ausente, token ajeno/erróneo → 404) y gestión siempre sobre `currentUser` · `NotFoundError` (RFC 7807) · tabla en `db/schema/calendar.ts` + `0008_calendar_feeds.sql` + snapshot + journal · web en `features/calendar*`, `queryOptions`, `Card`/`AlertDialog`/`Popover` reutilizados · dominio puro en shared con 13 unitarios
- C5: [x] sin `any`/`@ts-ignore`/`console.log`/TODOs · fechas `YYYY-MM-DD` (`addDays`) y km sin convertir · no hay subidas de ficheros
- C6: [x] `pnpm harness --full` verde · tests con SQLite en memoria vía `createTestApp`, solo se simulan `fetch`, `URL.createObjectURL` y `click` del ancla (APIs del navegador) · 12 capturas en claro, oscuro y móvil (revisadas `schedule-menu-mobile.png` y `feed-url-dark.png`)
- C7: [x] `progress/impl_maintenance-calendar.md` completo · `progress/current.md` describe la sesión · `docs/PLAN.md`: ver aviso 1 (la tabla de fases se actualiza en el commit de cierre, como en features anteriores)

## Revisión de los puntos pedidos

- **Tokens.** 8 B de selector + 32 B de verificador de `randomBytes`; solo se guarda `sha256(verifier)` (hex) con índice único en el selector; `verifierMatches` compara digests de 32 B con `crypto.timingSafeEqual` tras comprobar longitud (no lanza con hash corrupto). Malformado, selector inexistente y verificador erróneo dan el mismo 404 con el mismo `detail`. Regenerar sustituye selector y hash en el `upsert` (el antiguo deja de existir); borrar el usuario borra el feed por cascada. El plugin de gestión añade `app.authenticate` encapsulado y no afecta a la ruta pública (comprobado por el test sin sesión).
- **RFC 5545.** CRLF en todas las líneas y al final; plegado por octetos UTF-8 iterando por code point (no puede partir pares sustitutos ni secuencias multibyte), continuación con espacio contado en los 75; escapado TEXT de `\` primero y luego `; ,` y `\n`/`\r\n`; `URL` (tipo URI) sin escapar, correcto; `DTSTAMP` UTC `AAAAMMDDTHHMMSSZ`; `DTEND` exclusivo +1 día.
- **Desviaciones.** `originOf` por regex reproduce lo que `new URL('/vehicles/<id>', base)` conserva (origen, sin ruta de `BASE_URL`), con test de barra final y puerto; los query strings con `encodeURIComponent` son válidos (espacio → `%20`, `·` y saltos codificados) y el test de componente los parsea con el `URL` real del navegador; el conteo de octetos por code point es exacto para UTF-8. Aceptables y justificadas por la ausencia de tipos DOM/Node en shared.

## Hallazgos

Ninguno bloqueante.

## Avisos para el humano (no bloquean)

1. **Fase 4 completa.** #19 es la última feature de la fase 4 en `feature_list.json` y en `docs/PLAN.md`. En el commit de cierre, el leader debe marcar «4. Reglas y alertas» como ✅ en la tabla de estado y añadir ✅ al título `### Fase 4` (como en la fase 3).
2. **Token en los logs.** La URL del feed lleva el secreto en la ruta, y el logger de Fastify (`LOG_LEVEL` distinto de `test`) registra `req.url` en cada petición. Quien tenga acceso a los logs del contenedor puede leer tokens válidos. Es lo habitual en las URLs con capacidad y el spec no lo cubre; se puede mitigar más adelante con un serializador de `req` que oculte `/api/calendar/*`.
3. **R25 y la zona horaria.** El test comprueba idioma y unidad, pero no que «hoy» salga de `timezone`. Esa parte solo cambia la fecha estimada y necesitaría relojes falsos. El código la usa (`todayIn(timezone, now)`, `service.ts`), así que es una laguna del test, no un error.
4. **`\r` suelto.** `escapeText` convierte `\n` y `\r\n` en `\n`, pero no un `\r` aislado. Si un título llegara con un CR suelto, rompería la línea en el `.ics`. Es poco probable porque los títulos vienen de inputs de una sola línea.
5. El test `folds lines at 75 octets` comprueba que no aparece `�`, pero eso nunca puede ocurrir en un string de JS. La garantía real la dan el límite de octetos y el round-trip, y esas comprobaciones sí son concretas.
6. Según el informe, la migración `0008_calendar_feeds` ya está aplicada en la BD de desarrollo del humano (`./data`) porque `tsx watch` se recargó. Es una tabla nueva y no afecta a los datos existentes.

## Cambios requeridos

Ninguno.

---

# Re-revisión Gate 2 — T22–T24

**Veredicto:** APPROVED

## Tasks
- T22: [x] · T23: [x] · T24: [x] (T1–T21 siguen `[x]`)

## Trazabilidad añadida
- R21/R24 (logs): [x] `apps/api/test/logging.test.ts` › `hides any calendar feed path` (querystring, fragmento, sin `.ics`, token malformado, `%63alendar`, percent-encoding inválido) · `keeps other urls` · `never log the calendar feed token` (salida real de pino: ni el token, ni `token.slice(1)`, ni el selector; exactamente 3 `req.url` redactadas y la URL de gestión intacta).
- R25: [x] `apps/api/test/calendar.test.ts:241` › `computes today in the owner's time zone`. Es significativo: el mismo feed da `20260701` con `Pacific/Auckland` y `20260704` con `UTC`; si el servicio usara UTC siempre, la primera aserción fallaría. Reloj falso solo para `Date` y `afterEach(vi.useRealTimers)`.
- R9: [x] `packages/shared/src/domain/calendar.test.ts:181` y `:189` › CR suelto, CRLF, LF y `\n\r` en título, nombre de vehículo y descripción; comprueba que no queda CR/LF fuera de los CRLF de fin de línea y los valores exactos de `SUMMARY`/`DESCRIPTION`.

## Comprobaciones
- `escapeText` (`calendar.ts:109-110`): escapa `\ ; ,` primero y luego `\r\n|\r|\n` → `\n`; orden correcto, sin doble escapado.
- `serializeRequest` reproduce los campos del serializador `req` por defecto de Fastify; producción mantiene `level` y gana solo el serializador. En `test` el logger sigue apagado salvo `logStream`.
- Otros campos: «request completed» solo lleva `res.statusCode`; `errors.ts:34` registra `err` solo en ≥500 y ningún error del feed incluye la URL; el `setNotFoundHandler` mete la URL en el cuerpo de la respuesta, no en el log.
- Sonda propia (script fuera del repo, `buildApp` con `logStream`, métodos GET/HEAD/POST/OPTIONS): sin fuga en `/api/calendar/<t>.ics/`, `;x`, `%ZZ` en ruta o querystring (400), `/api/./calendar/…`, `/api/calendar/../calendar/…`, `/api/calendar%2F…`.
- `pnpm harness --full`: verde (api 22 files / 175 tests, web 25 / 183, shared 50).
- Alcance: solo `lib/logging.ts`, `app.ts` (logger + `logStream`), `test/helpers.ts`, `test/logging.test.ts`, `test/calendar.test.ts`, `calendar.ts` y su test. Sin regresiones.

## Checkpoints
- C1–C7: [x] (sin cambios respecto a la revisión anterior; los nuevos tests afirman resultados concretos).

## Avisos para el humano (no bloquean)
1. **Rutas no canónicas siguen registrando el token.** La sonda muestra que `//api/calendar/<token>.ics`, `/api//calendar/<token>.ics` y `/API/calendar/<token>.ics` (cualquier método) acaban en 404 y su `req.url` se registra en claro, porque `redactUrl` compara el prefijo exacto y sensible a mayúsculas (`logging.ts:27`). La app nunca genera esas URLs (`service.ts:58` usa `new URL('/api/…', baseUrl)`), así que solo pasa si un cliente o un proxy reescribe mal la ruta; además el proxy inverso registraría el token de todos modos. Si se quiere un «nunca» estricto: normalizar antes de comparar (colapsar `/+`, minúsculas) o redactar cualquier secuencia de ≥16 hex en `req.url`.
2. **Otros caracteres de control.** `escapeText` resuelve todos los saltos CR/LF, pero `\v`, `\f` u otros C0 siguen pasando y no son `TSAFE-CHAR` en RFC 5545. No rompen el troceo de líneas en los parsers habituales; la validación propuesta en la nota 2 del implementer (`\p{Cc}` en título/nombre) lo cerraría en otra feature.

---

# Re-revisión T25–T26

**Veredicto:** APPROVED

## Tasks
- T25: [x] · T26: [x] (T1–T24 siguen `[x]`)

## Trazabilidad añadida
- R21/R24: [x] `apps/api/test/logging.test.ts` › `hides any calendar feed path` (añade `//api/…`, `/api//…`, `///…?x=1`, `/API/…`, `/Api/Calendar/…ICS`, `%2F` y `%2F%2F`; afirma igualdad exacta con `REDACTED_CALENDAR_FEED_URL`) · `keeps other urls` (UUIDs con y sin querystring, 31 hex, `/api/calendar` sin barra) · `hides long hex runs anywhere in the url` (ruta, querystring en mayúsculas, dos rachas, token con un hex de cada dos codificado → `/api/other/***`).
- R9: [x] `packages/shared/src/domain/calendar.test.ts:189` › `drops control characters other than tab` (`\v`, `\f`, `\0`, DEL, ESC y C1 U+0085 en título y descripción; comprueba que no queda ningún `Cc` salvo TAB fuera de los CRLF y los valores exactos `SUMMARY:AceiteClio` y `DESCRIPTION:a\tbcd\ne`).

## Comprobaciones
- **Variantes de la redacción.** `normalizedPath` (`logging.ts:28-31`) decodifica, colapsa `/+` y pasa a minúsculas antes de comparar el prefijo. Lo probé con un script fuera del repo: `/api/./calendar/<t>`, `/api/calendar%2f<t>` y `/api/%2563alendar/<t>` (doble codificación) no filtran el token, porque la regla hex lo recoge. Tampoco filtran `/api/calendarx/<t>` ni un token con hex codificados intercalados.
- **URLs normales.** La regla hex exige 32 o más dígitos hex seguidos, y la app no genera URLs así: los UUID llevan guiones, los hash de assets tienen 8 caracteres y las fechas y los ids no llegan. Si no hay ninguna racha, `redactUrl` devuelve la URL original sin decodificar (`caf%C3%A9`, `a%20b%2Fc` y `%E0%A4%A`, que es malformado, quedan intactos). Solo devuelve la forma decodificada cuando esa forma revela una racha, y en ese caso conviene hacerlo.
- **Caracteres de control frente a saltos y plegado.** `escapeText` (`calendar.ts:112-116`) primero escapa `\ ; ,`, luego convierte `\r\n|\r|\n` en el literal `\n` y después elimina `[^\P{Cc}\t]`. El literal `\n` no contiene caracteres de control, así que el borrado no lo toca. Como el CR/LF ya se ha convertido antes, un `\r` suelto no se pierde: queda como `\n`. `foldLine` se aplica después, sobre la línea completa (`calendar.ts:175`), así que los CRLF y el espacio de continuación que añade el plegado nunca pasan por `escapeText`. Los tests de saltos mixtos y de plegado a 75 octetos siguen en verde.
- `pnpm harness --full`: verde (api 22 ficheros / 176 tests, web 25 / 183, shared 51).
- Alcance: solo `apps/api/src/lib/logging.ts`, su test, `calendar.ts` y su test.

## Checkpoints
- C1–C7: [x] (sin cambios respecto a la re-revisión anterior).

## Avisos para el humano (no bloquean)
- Ninguno nuevo. Los avisos 1 y 2 de la re-revisión anterior quedan resueltos.

## Cambios requeridos
Ninguno.
