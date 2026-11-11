# Tasks — mobile-native-calendar-notifications

## Dependencias y Android

- [x] T1 — Añadir con versión exacta `@capacitor/local-notifications` `8.3.1` y `@ebarooni/capacitor-calendar` `8.10.0` a `dependencies` de `apps/web/package.json` y `apps/mobile/package.json`; `pnpm install`; `pnpm --filter @ikrive/mobile exec cap sync android` y versionar los `.gradle` regenerados. Cubre: R19.
- [x] T2 — `apps/mobile/android/app/src/main/AndroidManifest.xml`: `xmlns:tools` en `<manifest>` y `<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" tools:node="remove" />`. Cubre: R20.
- [x] T3 — `apps/mobile/test/config.test.mjs`: ampliar `declares the web's Capacitor plugins with the same versions` (filtro que incluya `@ebarooni/` y los dos plugins nuevos en la lista obligatoria) y test nuevo `removes the exact alarm permission and declares no calendar permissions`. Cubre: R19, R20.

## Calendario

- [x] T4 — `apps/web/src/lib/native-calendar.ts`: `calendarPromptOptions` y `createDeviceEvent` según `design.md`. Cubre: R3, R4.
- [x] T5 — `apps/web/src/features/calendar/actions.ts`: `addToDeviceCalendar(event)` con `await import('@/lib/native-calendar')`. `apps/web/src/features/schedules/add-to-calendar.tsx`: en la app, item «Calendario del teléfono» en lugar del `.ics`, con toast `schedules.calendar.deviceError` si falla; en la web, sin cambios. Cubre: R1, R2, R3, R5.
- [x] T6 — Test unitario `apps/web/src/lib/native-calendar.test.ts` (con `vi.mock('@ebarooni/capacitor-calendar')`): `builds all-day options that start and end at the local midnight of the event day`, `opens the system new-event screen with the title and description`, `rejects when the plugin fails`. Cubre: R3, R4.
- [x] T7 — En `apps/web/src/features/schedules/add-to-calendar.test.tsx` (con `vi.mock('@/lib/native-calendar')` y un flag `loaded`): `web: offers Google, Outlook and .ics without loading the native calendar`, `native: offers the phone calendar instead of the .ics`, `native: adds the schedule event to the phone calendar` (afirma el `CalendarEvent` de `scheduleCalendarEvent`), `native: shows an error toast when the phone calendar fails`. Sustituir los tests nativos del `.ics` de #55 que ya no aplican. Cubre: R1, R2, R3, R5.

## Notificaciones: lógica y módulo nativo

- [x] T8 — `apps/web/src/features/notifications/device-notifications.ts`: `selectNewNotifications`, `notificationIntId`, `load/saveDeviceNotificationState`, `wasPermissionAsked`/`markPermissionAsked` según `design.md`. Cubre: R9, R10, R11, R12, R13.
- [x] T9 — Test unitario `apps/web/src/features/notifications/device-notifications.test.ts`: `first run stores the current page as seen without notifying`, `notifies only unread, unseen notifications not older than the cut-off`, `does not notify the same notification twice across refetches`, `ignores older notifications that slide into the first page`, `notifies a notification tied with the cut-off only once`, `maps a UUID to the same positive int32 id`, `stores the state per user`. Cubre: R9, R10, R11, R12, R13.
- [x] T10 — `apps/web/src/lib/native-notifications.ts`: `getNotificationPermission`, `requestNotificationPermission` (`prompt-with-rationale` → `prompt`) y `showNotifications` (sin `schedule`, `isExactNotification: false`). Cubre: R7, R8.
- [x] T11 — Test unitario `apps/web/src/lib/native-notifications.test.ts` (con `vi.mock('@capacitor/local-notifications')`): `maps the plugin permission states`, `requests the permission`, `shows immediate, inexact notifications with title and body`. Cubre: R7, R8.

## Notificaciones: montaje

- [x] T12 — `apps/web/src/features/notifications/device-notifications-sync.tsx` (`DeviceNotificationsSync({ userId })`, `useQuery(notificationsQuery)`, `useEffect` sobre `dataUpdatedAt`; petición de permiso única; errores del plugin ignorados) y montaje en `apps/web/src/routes/_app.tsx` solo si `isNativeApp()`. Cubre: R6, R7, R8, R11, R14, R15.
- [x] T13 — Test de componente `apps/web/src/features/notifications/device-notifications-sync.test.tsx` (con `vi.mock('@/lib/native-notifications')`, `mockApi('GET /notifications')` y refetch con `queryClient.invalidateQueries`): `asks for the permission once on first launch`, `does not ask again on later launches`, `shows one notification per new notification after a refetch`, `does not notify the history on first launch`, `does not show notifications without permission`, `ignores errors when showing fails`. Cubre: R7, R8, R10, R11, R14, R15.

## Ajustes

- [x] T14 — `apps/web/src/features/notifications/device-notifications-section.tsx` y montaje en `apps/web/src/routes/_app/settings.tsx` tras `NotificationChannelsSection`, solo si `isNativeApp()`. Cubre: R6, R16, R17, R18.
- [x] T15 — Test de componente `apps/web/src/features/notifications/device-notifications-section.test.tsx` (con `vi.mock('@/lib/native-notifications')`): `shows that phone notifications are on`, `asks for the permission from the button and shows the new state`, `explains how to enable them in Android settings when denied`. Cubre: R16, R17, R18.
- [x] T16 — En `apps/web/src/features/settings/settings-page.test.tsx` (`renderApp('/settings')`, `vi.mock('@/lib/native-notifications')` con flag `loaded`): `web: hides the phone notifications card and never loads the native module` y `native: shows the phone notifications card`. Cubre: R6, R16.

## i18n y docs

- [x] T17 — `apps/web/src/i18n/locales/es.json` y `en.json`: `schedules.calendar.device`, `schedules.calendar.deviceError`, `deviceNotifications.{title,description,checking,granted,prompt,allow,denied}`; `locales.test.ts` en verde. Cubre: R21.
- [x] T18 — `docs/mobile.md`: sección «Calendario y notificaciones» (calendario del teléfono sin permisos; permiso de notificaciones y tarjeta de ajustes; solo llegan con la app abierta; para la app cerrada, canales ntfy/Gotify/Apprise/webhook). Quitar de «Limitaciones conocidas» las notificaciones y el calendario nativo y añadir «notificaciones solo con la app abierta». Test `documents the phone calendar and local notifications` en `apps/mobile/test/docs.test.mjs` (no aparece «notificaciones del sistema ni calendario nativo»; sí «app abierta» y «canales»). Cubre: R22, R23.

## Cierre

- [x] T19 — Verificación previa a Gate 2: `pnpm --filter @ikrive/web build` y `build:native` sin errores. APK debug local solo si hay SDK de Android; si no, indicar cómo obtener el artefacto `ikrive-debug-apk` de CI. Copiar en `progress/impl_mobile-native-calendar-notifications.md` la checklist manual de `design.md` para que el humano la ejecute antes de Gate 2. Cubre: R1, R3, R7, R8, R20.
- [x] T20 — Ejecutar `pnpm harness --full` y documentar trazabilidad en `progress/impl_mobile-native-calendar-notifications.md`.
