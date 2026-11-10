# Implementación — mobile-native-calendar-notifications (#52)

Rama `feat/mobile-native-calendar-notifications`, sin commits. T1–T20 marcadas en `specs/mobile-native-calendar-notifications/tasks.md`.

## Cambios por archivo

### Dependencias y Android
- `apps/web/package.json`, `apps/mobile/package.json`, `pnpm-lock.yaml`: `@capacitor/local-notifications` `8.3.1` y `@ebarooni/capacitor-calendar` `8.10.0`, versiones exactas (T1).
- `apps/mobile/android/capacitor.settings.gradle`, `apps/mobile/android/app/capacitor.build.gradle`: regenerados con `cap sync android`, ahora incluyen los dos plugins (T1).
- `apps/mobile/android/app/src/main/AndroidManifest.xml`: `xmlns:tools` y `<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" tools:node="remove" />` (T2).
- `apps/mobile/test/config.test.mjs`: el filtro de plugins incluye `@ebarooni/` y la lista obligatoria, los dos plugins nuevos. Test nuevo para el manifest (T3).

### Calendario
- `apps/web/src/lib/native-calendar.ts` (nuevo): `calendarPromptOptions` (día completo, de medianoche local a la medianoche local siguiente) y `createDeviceEvent` (`CapacitorCalendar.createEventWithPrompt`) (T4).
- `apps/web/src/features/calendar/actions.ts`: `addToDeviceCalendar(event)` con `await import('@/lib/native-calendar')` (T5).
- `apps/web/src/features/schedules/add-to-calendar.tsx`: en la app, el item «Calendario del teléfono» sustituye a «Descargar .ics» y, si falla, muestra el toast `schedules.calendar.deviceError`. En la web, sin cambios (T5).
- `apps/web/src/lib/native-calendar.test.ts` (nuevo, T6) y `apps/web/src/features/schedules/add-to-calendar.test.tsx` (T7): los dos tests nativos del `.ics` de #55 se sustituyen por los del calendario del teléfono, y el mock de `native-files` por el de `native-calendar` con el flag `loaded`.

### Notificaciones
- `apps/web/src/features/notifications/device-notifications.ts` (nuevo): `selectNewNotifications`, `notificationIntId` (FNV-1a de 31 bits, nunca 0), `load/saveDeviceNotificationState` (`ikrive.deviceNotifications.<userId>`, con un valor corrupto → `null`) y `wasPermissionAsked`/`markPermissionAsked` (`ikrive.notificationPermissionAsked`). Todo el acceso a `localStorage` va en `try/catch` (T8).
- `apps/web/src/features/notifications/device-notifications.test.ts` (nuevo, T9). Usa el entorno jsdom por `localStorage`, como `lib/download.test.ts`.
- `apps/web/src/lib/native-notifications.ts` (nuevo): `getNotificationPermission`, `requestNotificationPermission` (`prompt-with-rationale` → `prompt`) y `showNotifications` (sin `schedule`, con `isExactNotification: false`; una lista vacía no llama al plugin) (T10). Test en `native-notifications.test.ts` (T11).
- `apps/web/src/features/notifications/device-notifications-sync.tsx` (nuevo): `useQuery(notificationsQuery)`. Pide el permiso una vez al montar, con un `ref` contra el doble efecto de StrictMode. Carga, selecciona y guarda el estado de forma síncrona antes de importar el plugin, solo muestra con `granted` e ignora los errores (T12).
- `apps/web/src/routes/_app.tsx`: `{isNativeApp() && <DeviceNotificationsSync userId={me.id} />}`, con `me` de `Route.useRouteContext()` (T12).
- `apps/web/src/features/notifications/device-notifications-sync.test.tsx` (nuevo, T13).

### Ajustes
- `apps/web/src/features/notifications/device-notifications-section.tsx` (nuevo): tarjeta «Notificaciones del teléfono». Pasa por `checking` y luego muestra `granted`, `prompt` (con el botón «Permitir notificaciones») o `denied`; si el plugin falla, cuenta como `denied` (T14).
- `apps/web/src/routes/_app/settings.tsx`: la monta tras `NotificationChannelsSection`, solo si `isNativeApp()` (T14).
- `device-notifications-section.test.tsx` (nuevo, T15). En `features/settings/settings-page.test.tsx`, el mock `native-notifications` con `loaded` y los tests web/nativo (T16).

### i18n y docs
- `apps/web/src/i18n/locales/{es,en}.json`: `schedules.calendar.device`, `schedules.calendar.deviceError` y `deviceNotifications.{title,description,checking,granted,prompt,allow,denied}` (T17).
- `docs/mobile.md`: sección «Calendario y notificaciones». «Limitaciones conocidas» ya no recoge las notificaciones del sistema ni el calendario nativo y añade «solo con la app abierta» → canales. La viñeta de «Ficheros» ya no menciona el `.ics` de «Añadir al calendario», que en la app no existe (T18).
- `apps/mobile/test/docs.test.mjs`: test `documents the phone calendar and local notifications` (T18).

## Trazabilidad

| R | Archivo › test |
|---|---|
| R1 | `apps/web/src/features/schedules/add-to-calendar.test.tsx` › `web: offers Google, Outlook and .ics without loading the native calendar` (también `downloads an .ics file`) |
| R2 | `add-to-calendar.test.tsx` › `native: offers the phone calendar instead of the .ics` |
| R3 | `add-to-calendar.test.tsx` › `native: adds the schedule event to the phone calendar`; `apps/web/src/lib/native-calendar.test.ts` › `opens the system new-event screen with the title and description` |
| R4 | `native-calendar.test.ts` › `builds all-day options from local midnight to the next local midnight` (America/New_York, Europe/Madrid, cambio de hora, fin de año) |
| R5 | `add-to-calendar.test.tsx` › `native: shows an error toast when the phone calendar fails`; `native-calendar.test.ts` › `rejects when the plugin fails` |
| R6 | `apps/web/src/features/settings/settings-page.test.tsx` › `web: hides the phone notifications card and never loads the native module` (layout + ajustes con `renderApp`) |
| R7 | `apps/web/src/features/notifications/device-notifications-sync.test.tsx` › `asks for the permission once on first launch`, `does not ask again on later launches`; `apps/web/src/lib/native-notifications.test.ts` › `maps the plugin permission states`, `requests the permission` |
| R8 | `device-notifications-sync.test.tsx` › `shows one notification per new notification after a refetch`; `native-notifications.test.ts` › `shows immediate, inexact notifications with title and body` |
| R9 | `apps/web/src/features/notifications/device-notifications.test.ts` › `notifies only unread, unseen notifications not older than the cut-off`, `ignores older notifications that slide into the first page`, `notifies a notification tied with the cut-off only once` |
| R10 | `device-notifications.test.ts` › `first run stores the current page as seen without notifying`; `device-notifications-sync.test.tsx` › `does not notify the history on first launch` |
| R11 | `device-notifications.test.ts` › `does not notify the same notification twice across refetches`; `device-notifications-sync.test.tsx` › `shows one notification per new notification after a refetch` (refetch + remontaje), `does not show notifications without permission`, `ignores errors when showing fails` (no se reintenta) |
| R12 | `device-notifications.test.ts` › `maps a UUID to the same positive int32 id` |
| R13 | `device-notifications.test.ts` › `stores the state per user` |
| R14 | `device-notifications-sync.test.tsx` › `does not show notifications without permission` |
| R15 | `device-notifications-sync.test.tsx` › `ignores errors when showing fails` |
| R16 | `device-notifications-section.test.tsx` › `shows that phone notifications are on`; `settings-page.test.tsx` › `native: shows the phone notifications card` |
| R17 | `device-notifications-section.test.tsx` › `asks for the permission from the button and shows the new state` |
| R18 | `device-notifications-section.test.tsx` › `explains how to enable them in Android settings when denied` (también `treats a failing plugin as denied`) |
| R19 | `apps/mobile/test/config.test.mjs` › `declares the web's Capacitor plugins with the same versions` |
| R20 | `config.test.mjs` › `removes the exact alarm permission and declares no calendar permissions` |
| R21 | `apps/web/src/i18n/locales.test.ts` › `es and en define the same keys` (más los tests de componente que buscan los textos en español) |
| R22 | `apps/mobile/test/docs.test.mjs` › `documents the phone calendar and local notifications` |
| R23 | `docs.test.mjs` › `documents the phone calendar and local notifications` («app abierta», «canales», ntfy/Gotify/Apprise/webhook) |

## `pnpm harness --full`

```
[OK]    62 features: 56 done, 5 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #52 mobile-native-calendar-notifications (in_progress)
[OK]    Rama actual: feat/mobile-native-calendar-notifications
[OK]    pnpm lint          (biome check: 434 archivos, sin errores)
[OK]    pnpm typecheck
[OK]    pnpm test          web 449 · api 368 · shared 119 · mobile 27 · e2e (unit) 6
[OK]    Arnés en verde.
```

## Verificación previa a Gate 2 (T19)

- `pnpm --filter @ikrive/web build` y `pnpm --filter @ikrive/web build:native`: sin errores. `native-calendar` y `native-notifications` salen como chunks aparte que solo se cargan con `import()`, como `native-files`.
- `cap sync android`: detecta los 5 plugins (`file-opener`, `filesystem`, `local-notifications`, `share`, `capacitor-calendar`).
- **APK local: no se ha podido compilar.** El SDK de Android está instalado, pero falta un JDK 21. Con JDK 25 (JBR de Android Studio), Gradle 8.14.3 falla con «Unsupported class file major version 69»; con JDK 17, la toolchain exige `languageVersion=21`. La compilación la hace el job `android` de CI: descarga el artefacto **`ikrive-debug-apk`** de la ejecución de CI del PR (pestaña *Actions* › ejecución › *Artifacts*), o compila en local con JDK 21 según `docs/mobile.md` › «Compilar en local».
- **Capturas** del build nativo (`dist-native`) servido por el bundle de la API en un `DATA_DIR` temporal, en Chrome (los plugins usan su implementación web), en claro, oscuro y móvil:
  - Ajustes con el permiso concedido: `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/77586751-c7f1-4899-b4fe-bcb82345e568/scratchpad/shots/settings-granted-light.png`, `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/77586751-c7f1-4899-b4fe-bcb82345e568/scratchpad/shots/settings-granted-dark.png`, `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/77586751-c7f1-4899-b4fe-bcb82345e568/scratchpad/shots/settings-granted-mobile.png`
  - Ajustes sin decidir (botón «Permitir notificaciones»): `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/77586751-c7f1-4899-b4fe-bcb82345e568/scratchpad/shots/settings-prompt-light.png`, `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/77586751-c7f1-4899-b4fe-bcb82345e568/scratchpad/shots/settings-prompt-dark.png`, `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/77586751-c7f1-4899-b4fe-bcb82345e568/scratchpad/shots/settings-prompt-mobile.png`
  - Menú del calendario (Google, Outlook, «Calendario del teléfono»): `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/77586751-c7f1-4899-b4fe-bcb82345e568/scratchpad/shots/calendar-menu-light.png`, `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/77586751-c7f1-4899-b4fe-bcb82345e568/scratchpad/shots/calendar-menu-dark.png`, `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/77586751-c7f1-4899-b4fe-bcb82345e568/scratchpad/shots/calendar-menu-mobile.png`
  - La web no cambia de aspecto, así que no tiene capturas. Su comportamiento (menú de siempre, ajustes sin la tarjeta) lo cubren los tests de R1 y R6.

## Checklist manual de la APK (para el humano, antes de Gate 2)

1. Instalar la APK debug (artefacto `ikrive-debug-apk`) en Android 13+ e iniciar sesión → sale el diálogo de notificaciones una sola vez; cerrar y abrir la app → no vuelve a salir.
2. Primer arranque con avisos antiguos en la campana → ninguna notificación del sistema.
3. Con una regla vencida, lanzar el job a mano (`POST /api/admin/jobs/reminders/run` como admin, #18) o esperar al planificador → en ≤ 60 s aparece una notificación por aviso nuevo; volver a abrir la app o recargar → no se repite.
4. No sale la pantalla «Alarmas y recordatorios» al notificar; en *Info de la app › Permisos* no aparece «Alarmas y recordatorios» ni «Calendario».
5. Denegar el permiso → la app funciona; ajustes muestra «Desactivadas» con la ruta a Ajustes de Android; no hay notificaciones. Concederlo desde Android → la tarjeta muestra «Activadas» al volver a entrar.
6. Desinstalar/reinstalar en Android 13+ y pulsar «Permitir notificaciones» en ajustes → diálogo y estado actualizado.
7. Regla con fecha → menú › «Calendario del teléfono» → la app de calendario muestra el evento de día completo **en el día correcto (uno solo)**, con título «regla · vehículo» y la descripción con el enlace. Guardar y cancelar no rompen nada.
8. Google y Outlook siguen abriendo el navegador del sistema; no aparece «Descargar .ics».
9. Web (`pnpm dev`): menú con las tres opciones de siempre y ajustes sin la tarjeta.

## Desviaciones y decisiones menores

- **Efecto de `DeviceNotificationsSync` sobre `[data, userId]` y no sobre `dataUpdatedAt`.** Biome (`useExhaustiveDependencies`) marca como sobrante una dependencia que no se usa en el cuerpo. Con el structural sharing de React Query, `data` cambia de referencia cuando cambia el contenido, y un refetch idéntico no notificaría nada de todos modos (todo está en `seen`). El resultado es el mismo.
- **El botón «Permitir notificaciones» también llama a `markPermissionAsked()`.** Así, si el permiso se ha pedido desde ajustes, la petición automática del primer arranque no vuelve a salir. El spec no lo pide expresamente; es coherente con la decisión 4 («se pide una vez»).
- **`showNotifications([])` no llama al plugin.** El componente ya no lo invoca sin avisos nuevos; es una salvaguarda.
- **`docs/mobile.md` › «Ficheros»** ya no menciona el `.ics` de «Añadir al calendario», porque en la app esa opción ya no existe. Es un ajuste de texto dentro de la misma tarea T18.
- Sin cambios en la API, la BD ni `packages/shared`.
