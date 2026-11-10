# Review — #52 mobile-native-calendar-notifications

**Veredicto:** APPROVED

Revisado: `git diff main...HEAD` (solo el spec), `git diff` y los 10 ficheros nuevos sin trackear, leídos enteros. `pnpm harness --full` ejecutado por el reviewer: **verde** (lint, typecheck, test: web 449 · api 368 · shared 119 · mobile 27 · e2e unit 6).

## Trazabilidad requirements ↔ tests

- R1: [x] `apps/web/src/features/schedules/add-to-calendar.test.tsx` › `web: offers Google, Outlook and .ics without loading the native calendar`: afirma los tres textos del menú en orden y `nativeCalendar.loaded === false` (el flag se activa en la factory de `vi.mock`, así que detecta cualquier `import()`).
- R2: [x] `add-to-calendar.test.tsx` › `native: offers the phone calendar instead of the .ics`: menú `['Google Calendar','Outlook','Calendario del teléfono']` y sin «Descargar .ics».
- R3: [x] `add-to-calendar.test.tsx` › `native: adds the schedule event to the phone calendar`: `createDeviceEvent` recibe exactamente el `scheduleCalendarEvent(...)` de shared (título, descripción con el enlace y fecha) y no hay descarga. `lib/native-calendar.test.ts` › `opens the system new-event screen…`: `createEventWithPrompt` se llama una vez con title, description, `isAllDay: true` y los timestamps.
- R4: [x] `native-calendar.test.ts` › `builds all-day options from local midnight to the next local midnight`: timestamps exactos en America/New_York y Europe/Madrid, cambio de hora (23 h) y fin de año.
- R5: [x] `add-to-calendar.test.tsx` › `native: shows an error toast when the phone calendar fails`: texto exacto del toast. `native-calendar.test.ts` › `rejects when the plugin fails`.
- R6: [x] `features/settings/settings-page.test.tsx` › `web: hides the phone notifications card and never loads the native module`. Usa `renderApp` (layout y ajustes), sin la tarjeta y con `native.loaded === false`.
- R7: [x] `device-notifications-sync.test.tsx` › `asks for the permission once on first launch`: una sola petición, aunque haya refetch, y queda la marca en `localStorage`. `does not ask again on later launches`: con la marca, o con el permiso ya decidido, no se pide. `native-notifications.test.ts` cubre el mapeo de `prompt-with-rationale`.
- R8: [x] `device-notifications-sync.test.tsx` › `shows one notification per new notification after a refetch`: una llamada con `[{id: notificationIntId('fresher'), title, body: ''}, {…fresh}]`. `native-notifications.test.ts` › `shows immediate, inexact notifications…`: `isExactNotification: false` y sin `schedule`.
- R9: [x] `device-notifications.test.ts`: `notifies only unread, unseen…` (excluye read, seen y old), `ignores older notifications that slide into the first page` y `notifies a notification tied with the cut-off only once`.
- R10: [x] `device-notifications.test.ts` › `first run stores the current page as seen without notifying`: `next` exacto y bandeja vacía → `since: null`. `device-notifications-sync.test.tsx` › `does not notify the history on first launch`: estado guardado exacto y `showNotifications` sin llamar.
- R11: [x] `device-notifications-sync.test.tsx`: en `shows one notification…`, refetch y remontaje no repiten. `does not show notifications without permission`: el estado se guarda aunque no haya permiso. `ignores errors when showing fails`: no se reintenta en el siguiente poll. `device-notifications.test.ts` › `does not notify the same notification twice across refetches`.
- R12: [x] `device-notifications.test.ts` › `maps a UUID to the same positive int32 id`: estable, en el rango [1, 2³¹−1] y comprobado con 1000 UUID aleatorios.
- R13: [x] `device-notifications.test.ts` › `stores the state per user`: claves `ikrive.deviceNotifications.u1`/`u2` independientes; un valor corrupto da `null`.
- R14: [x] `device-notifications-sync.test.tsx` › `does not show notifications without permission`.
- R15: [x] `device-notifications-sync.test.tsx` › `ignores errors when showing fails`: la bandeja sigue intacta y no aparece `[data-sonner-toast]`.
- R16: [x] `device-notifications-section.test.tsx` › `shows that phone notifications are on` (pasa de «Comprobando…» a «Activadas»). `settings-page.test.tsx` › `native: shows the phone notifications card`.
- R17: [x] `device-notifications-section.test.tsx` › `asks for the permission from the button and shows the new state`.
- R18: [x] `device-notifications-section.test.tsx` › `explains how to enable them in Android settings when denied`: texto de la ruta y sin botón.
- R19: [x] `apps/mobile/test/config.test.mjs` › `declares the web's Capacitor plugins with the same versions`: el filtro incluye `@ebarooni/`, los dos plugins son obligatorios y la igualdad es exacta. Comprobado a mano: `8.3.1` / `8.10.0` en ambos `package.json`, el lockfile y las rutas de `capacitor.settings.gradle`.
- R20: [x] `config.test.mjs` › `removes the exact alarm permission and declares no calendar permissions`: `xmlns:tools`, `SCHEDULE_EXACT_ALARM` con `tools:node="remove"` y sin `READ_/WRITE_CALENDAR`. Contrastado con los manifests de los tarballs: local-notifications declara `SCHEDULE_EXACT_ALARM` y el de calendar está vacío.
- R21: [x] `apps/web/src/i18n/locales.test.ts` (mismas claves en es/en). Las 9 claves nuevas están en los dos ficheros.
- R22: [x] `apps/mobile/test/docs.test.mjs` › `documents the phone calendar and local notifications` (sin «notificaciones del sistema» ni «calendario nativo»).
- R23: [x] mismo test: «app abierta», «canales», ntfy/Gotify/Apprise/webhook.

## Tasks
- T1..T20: [x]

## Checkpoints
- C1: [x] arnés con código 0; una sola feature activa (#52 `in_progress`); rama `feat/mobile-native-calendar-notifications`.
- C2: [x] spec completo en EARS con tabla acceptance → R; tasks `[x]`; cada R tiene un test abierto y leído (ver arriba).
- C3: [x] el diff se ciñe a la tabla «Archivos» de `design.md`. Hay dos ajustes menores justificados en `impl`: el texto de la viñeta «Ficheros» de `docs/mobile.md` y el efecto que depende de `[data, userId]`. Sin refactors ajenos.
- C4: [x] no toca API ni BD (N/A). Web: dominio en `features/notifications/` y `features/calendar/`; los plugins, en `lib/` como `native-files` (#55); datos con `notificationsQuery`, que ya existía; textos en es/en; `Card`/`Button` de marca. La lógica pura de deduplicación vive en la web y no en `packages/shared` porque es estado del dispositivo; tiene tests unitarios.
- C5: [x] sin `any`, `@ts-ignore`, `console.log` ni TODOs. `event.date` `YYYY-MM-DD` → medianoche local con `new Date(y, m-1, d+days)`: correcto con cambio de hora y cambio de mes o año. Sin ficheros subidos.
- C6: [x] `pnpm harness --full` en verde (ejecutado por el reviewer). Los tests afirman resultados concretos, solo mockean los plugins o módulos nativos y `fetch` (`mockApi`), y no hay BD. Hay capturas en claro, oscuro y móvil en `impl`; revisada `settings-prompt-mobile.png`.
- C7: [x] `impl_…md` con ficheros, mapa R → test, salida del arnés y checklist manual; `progress/current.md` al día. `docs/PLAN.md` no cambia: la fase 8 no se cierra, quedan #53 y #54.

## Puntos revisados a petición del leader

- **Primer arranque:** con `state === null` no se notifica nada y `since` pasa a ser el `createdAt` máximo de la página. Con la bandeja vacía queda `since: null` y se notifica el siguiente aviso, que es lo correcto.
- **Corte:** `createdAt >= since`, y `since` nunca retrocede (`latest` parte del `since` anterior). Los empates de milisegundo los cubre `seen`. Los avisos antiguos que suben a la primera página no se notifican (hay test).
- **StrictMode:** el `ref` evita pedir el permiso dos veces en el mismo montaje (React conserva los refs en el doble efecto). El efecto de datos hace carga, selección y guardado de forma síncrona, así que en la segunda ejecución la carga ya devuelve el estado guardado y `notify` sale vacío.
- **Estado por usuario:** la clave lleva el `userId` y el efecto depende de `[data, userId]`. `useLogout` y `use-change-server` llaman a `queryClient.clear()`, así que en el flujo normal no quedan datos de otra cuenta en caché.
- **Web sin módulos nativos:** solo los cargan `import()` dinámicos dentro de componentes que se renderizan con `isNativeApp()`, o tras comprobarlo. `isNativeApp()` es un flag de build (`import.meta.env.MODE`). `device-notifications-section.tsx` importa de `lib/native-notifications` solo el tipo, que se borra al compilar. Los tests de R1 y R6 lo comprueban con el flag `loaded`.
- **Versiones y gradle:** idénticas y exactas en las dos apps; `capacitor.settings.gradle` y `app/capacitor.build.gradle` regenerados apuntan a `local-notifications@8.3.1` y `capacitor-calendar@8.10.0` sobre `core@8.6.0`.
- **Manifest:** `xmlns:tools` y `tools:node="remove"` sobre `SCHEDULE_EXACT_ALARM` es la vía estándar del manifest merger. `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED` y `WAKE_LOCK` siguen viniendo del plugin, como prevé el diseño.
- **Día completo:** `CreateEventWithPromptInput.kt` pasa `startDate`/`endDate` sin transformar a `EXTRA_EVENT_BEGIN_TIME`/`END_TIME` (`getCalendarFromTimestamp` solo hace `timeInMillis = ts`), así que la medianoche local llega tal cual. A diferencia de `createEvent`, este camino no normaliza a UTC.

## Hallazgos

Ninguno bloqueante.

## Avisos para el humano (no bloquean)

1. **Día completo en Google Calendar (riesgo del diseño):** con el intent `ACTION_INSERT`, algunas versiones de Google Calendar interpretan `END_TIME` = siguiente medianoche como fin inclusivo y muestran el evento en dos días. Hay que comprobarlo en el punto 7 de la checklist manual de la APK; el plan B del diseño es `endDate = startDate`.
2. **Caché obsoleta de otra cuenta (caso límite, ya existía):** si la sesión caduca sin pasar por `useLogout` y otra cuenta inicia sesión antes del `gcTime` (5 min), `notificationsQuery` puede servir un momento la página de la cuenta anterior. Hasta ahora eso solo afectaba a la campana. Con esta feature se procesaría con el `userId` nuevo, lo que podría dejar avisos de la cuenta anterior como notificaciones del sistema o fijar un corte ajeno. Es poco probable y no lo cubre ningún R; se arreglaría con una clave de query por usuario o con `clear()` al iniciar sesión, como seguimiento aparte.
3. **Sin test explícito de StrictMode:** `renderWithProviders` no envuelve en `<StrictMode>`. El razonamiento de arriba lo cubre y en producción no hay doble efecto, pero ningún test lo ejercita.
4. **Capturas en el scratchpad de la sesión** (`/tmp/claude-1000/…/scratchpad/shots/`): son efímeras. Conviene revisarlas antes de que se borren.
5. **Sin APK local** (falta JDK 21): la compilación Android (Gradle/Kotlin del plugin de calendario con Capacitor 8.6) solo se valida en el job `android` de CI. La checklist manual del `impl` va antes de Gate 2.
6. Desviaciones del `impl` aceptadas: el efecto depende de `[data, userId]` (con structural sharing el resultado es equivalente); el botón de ajustes también llama a `markPermissionAsked()`, coherente con la decisión 4; y `showNotifications([])` no llama al plugin.

## Cambios requeridos

Ninguno.
