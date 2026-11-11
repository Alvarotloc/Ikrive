# Design — mobile-native-calendar-notifications

Mismo patrón que #55: el código de los plugins vive solo en dos módulos nuevos, `lib/native-calendar.ts` y `lib/native-notifications.ts`, que se cargan con `await import()` dentro de una rama `isNativeApp()`. La lógica de deduplicación es pura y no importa ningún plugin. Sin cambios en la API, la BD ni `packages/shared`: el evento sale de `scheduleCalendarEvent` (fase 4) y los avisos, de `GET /notifications`, que ya se consulta cada 60 s (`notificationsQuery`).

## Plugins elegidos (verificados en npm el 2026-11-10)

| Plugin (versión exacta) | Peer | Uso | Comprobado en el tarball |
|---|---|---|---|
| `@capacitor/local-notifications` `8.3.1` (oficial, MIT) | `@capacitor/core >=8.0.0` | `checkPermissions`, `requestPermissions` y `schedule` sin `schedule` (entrega inmediata) | Su manifest añade `POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM`, `RECEIVE_BOOT_COMPLETED` y `WAKE_LOCK`. Sin `schedule` llama directamente a `notificationManager.notify`. **`schedule()` abre la pantalla «Alarmas y recordatorios» (API 31+) si `isExactNotification` es `true`, que es su valor por defecto**: siempre se pasa `false` (ver decisión 3). Icono pequeño por defecto: `android.R.drawable.ic_dialog_info` |
| `@ebarooni/capacitor-calendar` `8.10.0` (MIT) | `@capacitor/core >=8.0.0` | `createEventWithPrompt` | Manifest vacío. En Android lanza `Intent.ACTION_INSERT` sobre `CalendarContract.Events.CONTENT_URI` con `TITLE`, `DESCRIPTION`, `EXTRA_EVENT_BEGIN_TIME/END_TIME` y `EXTRA_EVENT_ALL_DAY`, **sin permisos de calendario**. Resuelve siempre con `{ id: null }`, guarde o cancele el usuario. `minSdk 24` / `compileSdk 36`, como `variables.gradle` |

Ambos van en `dependencies` de `apps/web` y de `apps/mobile` con la misma versión exacta (R19), seguidos de `pnpm --filter @ikrive/mobile exec cap sync android` (regenera `capacitor.settings.gradle` y `app/capacitor.build.gradle`, versionados). Capacitor sigue en 8.6.0.

## Decisiones (con alternativas)

1. **Calendario: `createEventWithPrompt` de `@ebarooni/capacitor-calendar`** (intent `ACTION_INSERT`). Abre la pantalla de «nuevo evento» de la app de calendario con los datos rellenos; el usuario elige la cuenta y guarda. Sin permisos ni selector de calendarios propio.
   - *Descartado: abrir el `.ics` con el sistema* (`FileOpener` con `text/calendar`, sin dependencias nuevas). Google Calendar para Android no importa `.ics` por `ACTION_VIEW`; en la mayoría de los móviles saldría «no hay app».
   - *Descartado: un plugin Kotlin propio en `apps/mobile/android`* (~40 líneas, el mismo intent). Es código nativo sin tests en un proyecto que regenera `cap sync`. Queda como plan B si el plugin se abandona.
   - *Descartado: `createEvent` silencioso.* Exige `WRITE_CALENDAR` en tiempo de ejecución y elegir el calendario por la app.
   - *Descartado: `capacitor-calendar` (Fir3st, 2.0.2).* Menos adoptado y su vía sin permisos no se ha verificado.
2. **Fechas del evento** (R4): `startDate` es la medianoche local de `event.date` y `endDate` = `startDate`. *Descartado (versión inicial, falló en la checklist manual): `endDate` = medianoche del día siguiente (fin exclusivo, como `toICalendar`).* Google Calendar trata `END_TIME` del intent `ACTION_INSERT` como inclusivo en los eventos de día completo, y un evento del 24 salía del 24 al 25. Las pantallas de edición de AOSP y Google interpretan `BEGIN_TIME` en la zona local para eventos de día completo. Con la medianoche UTC, en zonas UTC− el evento caería el día anterior. `title` y `description` se pasan tal cual (la descripción ya lleva el enlace a la ficha). `url` no aplica en Android.
3. **Notificaciones: entrega inmediata y no exacta** (`isExactNotification: false`, sin `schedule`). No se programa nada a futuro y así `schedule()` no abre «Alarmas y recordatorios». El manifest de la app elimina `SCHEDULE_EXACT_ALARM` con `tools:node="remove"` (R20) y añade `xmlns:tools`. `RECEIVE_BOOT_COMPLETED` y `WAKE_LOCK` se quedan: son normales (sin diálogo) y los usa el receiver del plugin.
4. **Permiso `POST_NOTIFICATIONS`** (Android 13+; en <13 `checkPermissions` ya da `granted`): lo declara el plugin y se pide una vez, automáticamente, la primera vez que la app monta el layout autenticado, solo si el estado es `prompt` / `prompt-with-rationale` y no existe `ikrive.notificationPermissionAsked` (R7). Después solo se pide desde el botón de ajustes (R17). Así se evita que cada arranque tras un «No» vuelva a sacar el diálogo. Mientras no esté concedido, se procesa la lista igual pero no se muestra nada (R11, R14). *Descartado: pedirlo solo desde ajustes.* El acceptance dice «la app pide permiso» y casi nadie lo encontraría.
5. **Deduplicación** (R9–R13), en `features/notifications/device-notifications.ts` (pura):
   - Estado `{ since: string | null, seen: string[] }` en `localStorage['ikrive.deviceNotifications.<userId>']`, por usuario porque otra cuenta en el mismo móvil tendría su propio histórico.
   - **Primer arranque** (no hay clave): `seen` = ids de la página, `since` = `createdAt` máximo (o `null` si está vacía), y no se notifica nada. Así el histórico no se notifica.
   - **Nuevo** = `readAt === null && !seen.includes(id) && createdAt >= since`. El corte evita notificar avisos antiguos que suben a la primera página cuando se borran otros (cascada al borrar un vehículo). `seen` cubre los empates de milisegundo en `since`.
   - **Estado siguiente**: `seen` = ids de la página actual (≤ 20, acotado) y `since` = `max(since, createdAt máximo)`. Se guarda **antes** de llamar al plugin (como mucho una vez). Además, carga, selección y guardado son síncronos en el mismo efecto, así que el doble efecto de StrictMode tampoco duplica.
   - **Id de Android**: `notificationIntId` = FNV-1a de 32 bits del UUID, de 31 bits y nunca 0. Una colisión solo haría que una notificación sustituyera a otra en la bandeja del sistema.
   - Los avisos leídos en otro dispositivo (`readAt` ≠ null) se marcan vistos sin notificar.
   - *Descartado: comparar solo por `createdAt`.* Varias filas comparten milisegundo (`repository.ts:17`).
   - *Descartado: guardar todos los ids vistos sin corte.* Crece sin límite y no resuelve el primer arranque.
6. **Dónde se monta**: `<DeviceNotificationsSync userId={me.id} />` en `AppLayout` (`routes/_app.tsx`), renderizado solo si `isNativeApp()`. `me` sale de `Route.useRouteContext()`. Usa `useQuery(notificationsQuery)`: comparte caché y polling con la campana sin peticiones extra y devuelve `null`. *Descartado: engancharlo en `NotificationBell`.* Se monta en dos sitios (sidebar / cabecera móvil). *Descartado: `queryCache.subscribe`.* Más código para el mismo resultado.
7. **Estado del permiso en ajustes**: tarjeta nueva `DeviceNotificationsSection` («Notificaciones del teléfono») justo después de `NotificationChannelsSection` en `routes/_app/settings.tsx`, solo si `isNativeApp()` (R16–R18). Consulta el permiso al montarse (`import('@/lib/native-notifications')`). Mientras tanto pinta `deviceNotifications.checking`. Es una preferencia del dispositivo, no de `userSettingsSchema` (como el tema).
8. **Solo con la app en marcha (polling)**: las notificaciones salen del polling de 60 s de `notificationsQuery`, que React Query pausa con la WebView en segundo plano (`refetchIntervalInBackground: false`). En la práctica llegan con la app abierta, como mucho 60 s después de que el job cree el aviso, o en el primer poll al volver a abrirla. La entrega en segundo plano (push, FCM, WorkManager, `BackgroundRunner`) queda **fuera de alcance**. `docs/mobile.md` lo dice y remite a ntfy/Gotify (R23). *Descartado: `refetchIntervalInBackground: true` en la app.* Android congela la WebView igualmente y gasta batería.
9. **Menú en la app** (R2): se mantienen Google y Outlook (abren el navegador del sistema) y «Descargar .ics» se sustituye por «Calendario del teléfono». Así se cumple el comentario de `features/calendar/actions.ts` (la app sustituye el `.ics` por el calendario del dispositivo). *Alternativa:* que en la app el botón abra el calendario directamente, sin menú.

## Archivos

| Capa | Archivo | Cambio |
|---|---|---|
| web | `package.json` | `@capacitor/local-notifications` `8.3.1`, `@ebarooni/capacitor-calendar` `8.10.0` (exactas) |
| web | `src/lib/native-calendar.ts` (nuevo) | `calendarPromptOptions`, `createDeviceEvent` (R3, R4) |
| web | `src/lib/native-notifications.ts` (nuevo) | `getNotificationPermission`, `requestNotificationPermission`, `showNotifications` (R7, R8) |
| web | `src/features/calendar/actions.ts` | `addToDeviceCalendar(event)`: `await import('@/lib/native-calendar')` |
| web | `src/features/schedules/add-to-calendar.tsx` | si `isNativeApp()`, el item «Calendario del teléfono» llama a `addToDeviceCalendar(event).catch(() => toast.error(t('schedules.calendar.deviceError')))`; si no, el `.ics` actual (R1, R2, R5) |
| web | `src/features/notifications/device-notifications.ts` (nuevo) | estado, `selectNewNotifications`, `notificationIntId`, `load/save`, marca de permiso pedido (R9–R13) |
| web | `src/features/notifications/device-notifications-sync.tsx` (nuevo) | componente sin UI del punto 6 (R7, R8, R11, R14, R15) |
| web | `src/features/notifications/device-notifications-section.tsx` (nuevo) | tarjeta de ajustes (R16–R18) |
| web | `src/routes/_app.tsx` | monta `DeviceNotificationsSync` si `isNativeApp()` (R6) |
| web | `src/routes/_app/settings.tsx` | monta `DeviceNotificationsSection` si `isNativeApp()` (R6, R16) |
| web | `src/i18n/locales/{es,en}.json` | `schedules.calendar.device`, `schedules.calendar.deviceError`, `deviceNotifications.*` (R21) |
| mobile | `package.json` | los dos plugins con las mismas versiones; `cap sync android` (R19) |
| mobile | `android/app/src/main/AndroidManifest.xml` | `xmlns:tools` + `<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" tools:node="remove" />` (R20) |
| mobile | `test/config.test.mjs` | el test de plugins incluye `@ebarooni/` y los dos nuevos; test del manifest (R19, R20) |
| docs | `docs/mobile.md`, `apps/mobile/test/docs.test.mjs` | sección «Calendario y notificaciones» y «Limitaciones conocidas» (R22, R23) |

## Tipos y firmas

```ts
// lib/native-calendar.ts — solo en la app
import type { CalendarEvent } from '@ikrive/shared';
export function calendarPromptOptions(event: CalendarEvent): {
  title: string; description: string; isAllDay: true; startDate: number; endDate: number;
};
/** CapacitorCalendar.createEventWithPrompt(calendarPromptOptions(event)); rechaza si el plugin falla. */
export function createDeviceEvent(event: CalendarEvent): Promise<void>;

// lib/native-notifications.ts — solo en la app
export type DevicePermission = 'granted' | 'denied' | 'prompt'; // 'prompt-with-rationale' → 'prompt'
export function getNotificationPermission(): Promise<DevicePermission>;
export function requestNotificationPermission(): Promise<DevicePermission>;
/** LocalNotifications.schedule({ notifications: items.map(n => ({ ...n, isExactNotification: false })) }). */
export function showNotifications(items: { id: number; title: string; body: string }[]): Promise<void>;

// features/notifications/device-notifications.ts — puro
export interface DeviceNotificationState { since: string | null; seen: string[] }
export function selectNewNotifications(
  items: Notification[], state: DeviceNotificationState | null,
): { notify: Notification[]; next: DeviceNotificationState };
export function notificationIntId(uuid: string): number;
export function loadDeviceNotificationState(userId: string): DeviceNotificationState | null;
export function saveDeviceNotificationState(userId: string, state: DeviceNotificationState): void;
export function wasPermissionAsked(): boolean;   // 'ikrive.notificationPermissionAsked'
export function markPermissionAsked(): void;
```

`localStorage` va en `try/catch`, como `lib/theme.ts`. Si no está disponible, `load` devuelve `null` y no se notifica nada (primer arranque perpetuo, sin duplicados).

## Impacto en UI

- **Web:** sin cambios.
- **App, menú del calendario:** «Calendario del teléfono» (icono `CalendarPlus`) en lugar de «Descargar .ics»; abre la app de calendario fuera de Ikrive.
- **App, ajustes:** tarjeta con `Card/CardHeader/CardTitle/CardDescription/CardContent`:
  - `granted` → «Activadas».
  - `prompt` → «Desactivadas…» + `Button` «Permitir notificaciones».
  - `denied` → texto con la ruta *Ajustes › Aplicaciones › Ikrive › Notificaciones*.
  - Si la consulta falla, se trata como `denied`.
- **Notificación:** título y cuerpo del aviso, en el canal por defecto del plugin. Al tocarla se abre la app.

## Decisiones a validar (Gate 1)

1. Petición automática una sola vez al primer arranque autenticado (decisión 4).
2. Avisos llegados mientras el permiso estaba denegado: no se notifican al concederlo (siguen en la campana).
3. Tocar la notificación solo abre la app; navegar al `link` del aviso queda fuera (sin requirement en el acceptance; seguimiento barato con `localNotificationActionPerformed`).
4. Menú con Google/Outlook + «Calendario del teléfono», sin `.ics`, en la app (decisión 9).
5. Icono pequeño por defecto del sistema (`ic_dialog_info`); un icono monocromo propio queda fuera.
6. Tras cancelar la pantalla del calendario no se muestra nada: el plugin no distingue guardar de cancelar.

## Riesgos

- **Fechas de día completo según la app de calendario:** la decisión 2 se verifica en la checklist manual. Materializado en Gate 2: con `endDate` = medianoche del día siguiente, Google Calendar mostraba el evento en dos días (trata `END_TIME` del intent `ACTION_INSERT` como inclusivo en los eventos de día completo). Se aplicó el plan B, `endDate = startDate`. Riesgo residual: otra app de calendario que exija un fin exclusivo podría mostrar un evento de duración cero; se revisa en el punto 7 de la checklist.
- **Sin app de calendario:** `startActivityForResult` falla → rechazo → toast (R5).
- **Compatibilidad Gradle/Kotlin del plugin de calendario con Capacitor 8.6:** la verifica el job `android` de CI (`cap sync` + `assembleDebug`).
- **Más de 20 avisos nuevos entre dos polls** (solo primera página): se notifican los 20 más recientes. Es improbable con el job horario.
- **Sin emulador:** la lógica se cubre con Vitest mockeando plugins y módulos nativos. La prueba real la hace el humano con la APK debug.

## Checklist manual de la APK (el implementer la deja en `progress/impl_mobile-native-calendar-notifications.md`)

1. Instalar la APK debug (artefacto `ikrive-debug-apk`) en Android 13+ e iniciar sesión → sale el diálogo de notificaciones una sola vez; cerrar y abrir la app → no vuelve a salir.
2. Primer arranque con avisos antiguos en la campana → ninguna notificación del sistema.
3. Con una regla vencida, lanzar el job a mano (`POST /api/admin/jobs/reminders/run` como admin, #18) o esperar al planificador → en ≤ 60 s aparece una notificación por aviso nuevo; volver a abrir la app o recargar → no se repite.
4. No sale la pantalla «Alarmas y recordatorios» al notificar; en *Info de la app › Permisos* no aparece «Alarmas y recordatorios» ni «Calendario».
5. Denegar el permiso → la app funciona; ajustes muestra «Desactivadas» con la ruta a Ajustes de Android; no hay notificaciones. Concederlo desde Android → la tarjeta muestra «Activadas» al volver a entrar.
6. Desinstalar/reinstalar en Android 13+ y pulsar «Permitir notificaciones» en ajustes → diálogo y estado actualizado.
7. Regla con fecha → menú › «Calendario del teléfono» → la app de calendario muestra el evento de día completo **en el día correcto (uno solo)**, con título «regla · vehículo» y la descripción con el enlace. Guardar y cancelar no rompen nada.
8. Google y Outlook siguen abriendo el navegador del sistema; no aparece «Descargar .ics».
9. Web (`pnpm dev`): menú con las tres opciones de siempre y ajustes sin la tarjeta.

## Fuera de alcance

- Entrega en segundo plano / con la app cerrada (push, FCM, WorkManager, `@capacitor/background-runner`).
- Navegar al `link` al tocar la notificación, icono de notificación propio y canales Android propios.
- Programar recordatorios futuros en el dispositivo (los avisos los genera el servidor).
- Editar o borrar eventos ya creados en el calendario; feed iCal (ya existe, #19).
- iOS y modo «En este teléfono» (#53, #54).
