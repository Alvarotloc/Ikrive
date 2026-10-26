# Review — #17 odometer-nudge

> Segunda revisión, tras los cambios de Gate 2 (R18–R19, T17–T19). Lo aprobado en la primera revisión (R1–R17) no cambia: el diff nuevo solo toca la web de Ajustes.

**Veredicto:** APPROVED

## Trazabilidad requirements ↔ tests

Salvo que se indique otro archivo, los tests están en `apps/api/test/odometer-nudge.test.ts`.

- R1: [x] `:134` › `notifies stale active vehicles in one notification` y `:161` › `creates nothing without stale vehicles`. Llaman a `runOdometerNudge` sin planificador y comprueban `toEqual({ evaluated, created })`.
- R2: [x] `:71` › `schedules the job hourly when enabled`. Comprueba `getPattern() === '0 * * * *'`, `isRunning()` y que `trigger()` llama a `run` una vez. `protect: true` está en el código (`odometer-nudge.job.ts`). El cableado de `server.ts` no tiene test, igual que en `reminders`.
- R3: [x] `:87` › `does not schedule the job when disabled`. Comprueba que devuelve `null` y que `run` no se llama.
- R4: [x] `:93` › `logs a failing run instead of crashing`. Comprueba `logger.error` con el error concreto.
- R5: [x] `apps/api/test/settings.test.ts:195` › `accepts a null odometer reminder weekday` (usuario nuevo → `0`, PATCH `null` → 200 con el cuerpo completo, GET persiste `null`, vuelta a `3`) y `:223` › `rejects an invalid odometer reminder weekday` (`7`, `1.5` y `-1` → 400 problem+json sin cambios en BD).
- R6: [x] `apps/web/src/features/settings/settings-page.test.tsx:319` › `saves no odometer reminder day`. Comprueba la opción «No avisar» en primer lugar, 8 opciones y que el PATCH lleva `odometerReminderWeekday: null`. Hay además un test que comprueba que un día no se envía como `NaN`.
- R7: [x] `:175` › `only notifies on the user's weekday` y `:188` › `uses the user's time zone for the weekday` (Auckland frente a UTC, comprueba los `userId` exactos). También `weekdayOf` en `:114`.
- R8: [x] `:216` › `skips users without a reminder weekday` (`null` y fila de ajustes borrada; repositorio `[]`, `{0,0}`, sin filas).
- R9: [x] `:228` › `waits for the reminder hour` (08:00 → nada, 09:00 → 1, 19:00 → 0 por la deduplicación).
- R10: [x] `:134`. Comprueba la fila completa con `toEqual`: `type`, `vehicleId: null`, `link: '/odometer'`, título `'Golf, Renault Clio'` (con alias y con «marca modelo»), `body: null` y `dedupeKey`.
- R11: [x] `:242` › `uses a 7-day threshold` (lectura del 18 entra, la del 19 no; decide la última lectura).
- R12: [x] `:258` › `counts vehicles without readings from their creation date` (fecha local de alta en Madrid frente a UTC).
- R13: [x] `:272` › `skips archived and sold vehicles` (título solo `'Activo'`; sin vehículos activos no se evalúa al usuario).
- R14: [x] `:161` (`created: 0`, sin filas).
- R15: [x] `:292` › `does not duplicate the notification in the same week` (incluye el cambio de día dentro de la semana W43), `:309` › `notifies again the next week` (claves W43/W44) y `isoWeekOf` en `:120`, con casos de cambio de año.
- R16: [x] `:322` › `sends new notifications through the owner's channels` (cuerpo exacto del webhook, canal desactivado excluido, `en`/`es`) y `:358` › `does not resend deduplicated notifications`.
- R17: [x] `apps/api/src/modules/notification-channels/messages.test.ts:57` › `formats an odometer nudge` (es/en) y `apps/web/src/features/notifications/notification-bell.test.tsx:277` › `shows the odometer nudge label` (etiqueta «Registra los km», título y navegación a `/odometer`). Las claves están en `es.json` y `en.json`.
- R18: [x] `apps/web/src/features/settings/settings-page.test.tsx:79` › `explains the reminder hour`. Busca el botón por su nombre accesible traducido, lo pulsa y comprueba que el `dialog` contiene «La app revisa los recordatorios cada hora en punto.» y «Si el servidor estaba apagado a esa hora». Las opciones `HH:00` siguen cubiertas por `:34` › `saves the reminder hour`. El texto completo en `es.json`/`en.json` cubre las tres ideas de R18.
- R19: [x] `settings-page.test.tsx:91` › `explains the odometer reminder day`. Mismo patrón; comprueba «7 días o más sin lectura de kilómetros» y ««No avisar»». El texto cubre el día, la hora, «una vez», los vehículos activos y la desactivación.

## Tasks
- T1..T19: [x]

## Checkpoints
- C1: [x] El arnés está en verde, hay una sola feature activa y la rama es `feat/odometer-nudge`.
- C2: [x] El spec está completo y en EARS, y la tabla de acceptance está cubierta. Todas las tasks están `[x]` y cada R tiene un test que he leído.
- C3: [x] El diff se limita a los archivos que lista `design.md` (más `progress/`) y, para Gate 2, a lo que pide T17: `components/info-popover.tsx` (nuevo), `settings.tsx`, los locales y la prop opcional `labelAction` de `form-field.tsx` (ver Avisos).
- C4: [x] No hay endpoints nuevos. Las settings se siguen validando con el esquema compartido. El esquema de BD está en `db/schema/` y la migración 0007 está generada (recrea `user_settings` copiando las 8 columnas). i18n en ambos idiomas.
- C5: [x] Sin `any`, sin `@ts-ignore` y sin `console.log`. Las fechas son `YYYY-MM-DD` (`todayIn`, `addDays`). No hay ficheros subidos.
- C6: [x] He ejecutado `pnpm harness --full` en verde (shared 35, api 142, web 175, en la segunda revisión). Los tests usan SQLite en memoria y solo simulan `fetch`. Hay capturas en claro, oscuro y móvil de Ajustes, de la campana y de los dos popovers (abiertos con `tap()` en móvil). Existen en el scratchpad y he revisado la de móvil: el popover cabe en la pantalla.
- C7: [x] `impl_odometer-nudge.md` está completo y `current.md` está al día. La feature no cierra la fase 4 (quedan #18 y #19).

## Hallazgos
Ninguno bloqueante.

## Avisos para el humano (no bloquean)
- `docs/PLAN.md:118` menciona `odometerReminderWeekday` sin decir que ahora admite `null` («No avisar»). Conviene anotarlo al cerrar la feature.
- Las capturas están en el scratchpad de la sesión (efímeras), no en el repo.
- Ningún test de componente comprueba que, con un ajuste `null` cargado, el selector muestre «No avisar» al abrir Ajustes. Solo se verificó en las capturas.
- `apps/api/src/db/schema/settings.ts:18` usa el literal `default(0)` en vez de `DEFAULT_USER_SETTINGS`. Está justificado por el tipo nullable y hay un comentario que lo explica.

- Gate 2: `design.md` no se actualizó con los cambios de Gate 2. No lista `apps/web/src/components/info-popover.tsx` ni el cambio en `apps/web/src/components/form-field.tsx`. T17 sí pide el componente reutilizable, y `labelAction` es opcional: los demás `FormField` no cambian su HTML. Se hizo igual que en `notification-channels` (solo se tocaron requirements y tasks), así que no bloquea.
- `InfoPopover` pone `aria-label` también en `PopoverContent`. El `dialog` recibe así el mismo nombre que el botón. Es correcto, solo lo menciono.

## Cambios requeridos
Ninguno.
