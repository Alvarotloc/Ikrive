# Exploración: calendario nativo en la app Android (#52)

## 1. Cómo funciona hoy «Añadir al calendario» en la web

**Componente.** `AddToCalendarMenu` está en `apps/web/src/features/schedules/add-to-calendar.tsx:49`. Se pinta una vez por regla en `apps/web/src/features/schedules/schedules-section.tsx:132`.
- Construye el evento con `scheduleCalendarEvent({ schedule, vehicle, baseUrl: getServerUrl() ?? window.location.origin, locale, distanceUnit })` (`add-to-calendar.tsx:53-60`).
- Si la regla no tiene `nextDueDate`, el evento sale `null`. Entonces el botón queda «deshabilitado» a la vista (`aria-disabled`) y abre un `Popover` con `schedules.calendar.noDate` (`:74-83`).
- Si hay evento, abre un `DropdownMenu` con tres opciones:
  - Google: `<a href={googleCalendarUrl(event)} target="_blank">` (`:90`).
  - Outlook: `<a href={outlookCalendarUrl(event)} target="_blank">` (`:96`).
  - `.ics`: `downloadIcs(`${slug(event.title)}.ics`, toICalendar([event], { now: new Date() }))`. Si falla, muestra el toast `common.fileError` (`:101-106`). La función `slug` está en `:32-38`.

**Funciones puras de la fase 4** (`packages/shared/src/domain/calendar.ts`):
- `CalendarEvent { uid, date: 'YYYY-MM-DD', title, description, url }` (`:6-13`). Todos los eventos son de día completo.
- `ScheduleEventInput` (`:15`).
- `CALENDAR_EVENT_TEXTS` (`:32`): los textos es/en viven aquí, no en el i18n de la web, porque el feed de la API debe generar el mismo evento.
- `scheduleCalendarEvent()` (`:49-68`): `uid = schedule-<id>@ikrive`; `title = "<regla> · <vehículo>"`; `description` con km de vencimiento, aviso de «fecha estimada» y enlace a la ficha del vehículo.
- `googleCalendarUrl` (`:85`) y `outlookCalendarUrl` (`:95`). El fin del evento es exclusivo, `addDays(date, 1)`.
- `toICalendar(events, { now, name? })` (`:151`): VCALENDAR RFC 5545 con CRLF, plegado y escapado; `DTSTART;VALUE=DATE` y `DTEND` = día siguiente.
- Tests en `packages/shared/src/domain/calendar.test.ts`.

**Cómo se produce el fichero.**
- `apps/web/src/features/calendar/actions.ts:8`: `downloadIcs(filename, text)` llama a `downloadBlob(filename, new Blob([text], { type: 'text/calendar;charset=utf-8' }))`.
- El comentario de `actions.ts:1-4` ya prevé que la app nativa sustituya este fichero por el calendario del dispositivo «sin tocar el resto».
- En la web descarga con `<a download>` (`lib/download.ts:19-28`). En la app abre hoy la hoja de compartir mediante `native-files.saveFile` (#55).
- El feed iCal con token está aparte: `apps/web/src/features/calendar-feed/calendar-feed-section.tsx`.

**Tests.** `apps/web/src/features/schedules/add-to-calendar.test.tsx` hace `vi.mock('@/lib/native-files', …)` (`:10`) y prueba la vía nativa con `vi.stubEnv('MODE', 'native')` (`:143`, `:165`).

## 2. Detección de plataforma nativa y patrón a seguir

**Detección.** No se usa `Capacitor.isNativePlatform()`, sino un flag de build: `apps/web/src/lib/platform.ts:6`, `isNativeApp = () => import.meta.env.MODE === 'native'`. Lo activa `vite build --mode native --outDir dist-native` (`build:native`), que también desactiva la PWA (`apps/web/vite.config.ts:9-25`). Se lee en cada llamada, así que los tests cambian de vía con `vi.stubEnv('MODE', 'native')`. Decisión 4 de #51 (`specs/mobile-shell-android/design.md:98,110`), reafirmada en #55 (`specs/mobile-native-files/design.md:17,82`).

**Costura de #55.** Todo pasa por `apps/web/src/lib/download.ts`: `downloadBlob` (`:14-29`) y `openBlob` (`:36-51`) son `async`; si `isNativeApp()`, hacen `await import('./native-files')`; si no, camino web sin `await` antes del `click()` para no perder el gesto del usuario.

**Módulo nativo.** `apps/web/src/lib/native-files.ts` es el único sitio que importa plugins (`@capacitor/filesystem`, `@capacitor/share`, `@capacitor-community/file-opener`, `:63-65`). Escribe en `Directory.Cache` sin pedir permisos; `saveFile` usa `Share.share` y trata la cancelación como éxito; `openFile` usa `FileOpener.open`. Los textos salen de `i18n` importado de `@/i18n`. El resto de errores se propaga y el llamador muestra un toast.

**Nombres de chunk.** Sin `manualChunks` ni nombres en `vite.config.ts`; el chunk nativo puede aparecer en `dist/` aunque la web nunca lo pide (ver #60).

**Tests y mocks.** `native-files.test.ts:4-10`: `vi.hoisted` + `vi.mock` de cada plugin. `download.test.ts:8-11`: `vi.mock('./native-files')` con un flag `loaded` para comprobar que la web no carga el módulo nativo. Sin emulador: pruebas manuales con la APK debug del job `android` de CI.

**Patrón para una feature nativa nueva:** módulo `lib/native-<x>.ts` (o `features/calendar/native-calendar.ts`) único que importa el plugin; cargarlo con `await import()` dentro de `if (isNativeApp())`; bifurcar en `features/calendar/actions.ts`; mockear plugin y módulo nativo en los tests.

## 3. Capacitor, plugins y proyecto Android

- Capacitor **8.6.0** (`@capacitor/core`, `@capacitor/android`, `@capacitor/cli` dev).
- Plugins (misma versión exacta en `apps/web/package.json` y `apps/mobile/package.json`, R14 de #55): `@capacitor/filesystem` 8.1.5, `@capacitor/share` 8.0.3, `@capacitor-community/file-opener` 8.0.1.
- No hay plugin de calendario ni de notificaciones locales. Candidatos a verificar con Capacitor 8: `@capacitor/local-notifications` (oficial, 8.x); calendario comunitario (p. ej. `@ebarooni/capacitor-calendar`) o un intent `ACTION_INSERT` propio.
- `apps/mobile/capacitor.config.json`: `appId com.ikrive.app`, `webDir ../web/dist-native`, `androidScheme https`, `allowMixedContent`.
- Proyecto Android versionado en `apps/mobile/android/`; `capacitor.settings.gradle` lo regenera `cap sync android`. `variables.gradle`: `minSdk 24`, `compile/targetSdk 36`.
- `AndroidManifest.xml`: solo `INTERNET` (`:43`), `usesCleartextTraffic="true"`, `FileProvider`. Sin `POST_NOTIFICATIONS`, `READ/WRITE_CALENDAR`, `SCHEDULE_EXACT_ALARM` ni receivers.
- La bandeja ya hace polling: `apps/web/src/features/notifications/queries.ts:10`, `refetchInterval: 60_000`.

## 4. Decisiones que condicionan la feature

- `docs/PLAN.md` fase 4 (`:172-175`): evento con funciones puras en `packages/shared`, separadas de la acción para que la app use el calendario nativo.
- Fase 8 (`:205-226`): APK sin Play Store, solo Android; etapa 1 «Mi servidor» (siempre hay servidor, `baseUrl = getServerUrl()`); #52 usa las funciones de la fase 4. Pendiente de etapa 2 (`:231`): modo local sin jobs; las notificaciones locales de #52 se basan en los avisos de la bandeja del servidor.
- #51: detección por flag de build; sin `CapacitorHttp`; `apps/mobile` sin scripts `build`/`typecheck`; job `android` de CI con `cap sync` + `assembleDebug`; enlaces `_blank` al navegador del sistema; `localStorage` (sin `@capacitor/preferences`); iOS fuera.
- #55: solo cambia la costura; plugins en web y mobile con la misma versión exacta y `cap sync android`; `.ics` en la app por hoja de compartir «hasta que #52 lo sustituya»; toast `common.fileError`; checklist manual de APK en `progress/impl_<feature>.md` antes del Gate 2.
- `docs/mobile.md:58` («Limitaciones conocidas») dice «Sin … notificaciones del sistema ni calendario nativo»; #52 debe actualizarla.
