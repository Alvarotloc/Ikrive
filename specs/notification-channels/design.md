# Design — notification-channels

## Resumen

Nuevo módulo `notification-channels` (CRUD + prueba) y un **dispatcher** reutilizable que `runReminders` (y más adelante `odometer-nudge.job`, #17) llama con las notificaciones recién creadas. Cada tipo de canal es una función pura que construye la petición HTTP; un único `send` con `fetch` inyectado aplica el timeout y traduce errores. La web añade una tarjeta en Ajustes.

## Archivos por capa

### `packages/shared`
- `src/schemas/notification-channels.ts` (nuevo, exportado en `src/index.ts`):
  - `ntfyConfigSchema` `{ serverUrl, topic, token? }`, `gotifyConfigSchema` `{ serverUrl, token }`, `appriseConfigSchema` `{ serverUrl, key, tag? }`, `webhookConfigSchema` `{ url, token? }`.
    - `serverUrl`/`url`: `z.url({ protocol: /^https?$/ })`, máx. 2048. `topic`/`key`: `^[A-Za-z0-9_-]{1,64}$`. `token`: `string().trim().min(1).max(512)`. `tag`: `optionalText(128)`.
  - `createNotificationChannelSchema`: `z.discriminatedUnion('type', [{ type: literal, enabled: boolean().default(true), config }…])`.
  - `updateNotificationChannelSchema`: `discriminatedUnion('type', [{ type: literal, enabled?: boolean, config?: <config con token opcional> }…])`.
  - `notificationChannelSchema` (DTO): `discriminatedUnion('type', [{ id, type, enabled, hasToken, lastError: string|null, createdAt, updatedAt, config: <config sin token> }…])`.
  - `notificationChannelTestResultSchema` `{ ok: boolean, error: string | null }`.
  - Tipos `NotificationChannelConfig` (`{ type, config }` discriminado), `CreateNotificationChannel`, `UpdateNotificationChannel`, `NotificationChannel`, `NotificationChannelTestResult`.
- `NOTIFICATION_CHANNEL_TYPES` ya existe en `src/enums.ts`.

### `apps/api`
- `src/db/schema/notification-channels.ts` (+ barrel): `type text({ enum })`, `config text({ mode: 'json' }).$type<…>()`, `enabled integer({ mode: 'boolean' }).notNull().default(true)`, `lastError text()`, timestamps; índice `notification_channels_user_id_idx`. Migración `0006_notification_channels` con `pnpm --filter @ikrive/api exec drizzle-kit generate --name notification_channels`.
- `src/modules/notification-channels/`
  - `repository.ts`: `listByUser`, `findOwned`, `create`, `update`, `remove` (todas filtran por `userId`), `listEnabledByUsers(userIds)`, `setLastError(id, error | null)`.
  - `channels.ts`: `CHANNEL_TIMEOUT_MS = 10_000`, `ChannelMessage`, `buildChannelRequest(channel, message): { url, init }` (un `switch` por tipo, sin barra doble al unir `serverUrl`), `interface NotificationChannel { send(message): Promise<void> }` y `createChannel(channel, { fetch, timeoutMs })`. `send` usa `AbortSignal.timeout(timeoutMs)`; status no 2xx → `Error('HTTP <status>')`; abort → `Error('Timeout after <ms> ms')`; el mensaje se recorta a 500 caracteres.
  - `messages.ts`: textos `es`/`en` (`Record<Locale, …>` para que un tipo nuevo obligue a traducirlo): etiquetas de `NOTIFICATION_TYPES` y mensaje de prueba. `toChannelMessage(row, locale, baseUrl)` y `testMessage(locale, now)`.
  - `dispatcher.ts`: `createNotificationDispatcher({ db, fetch, baseUrl, timeoutMs? })` → `{ dispatch(rows: NotificationRow[]): Promise<void>, sendTest(channel): Promise<NotificationChannelTestResult> }`. `dispatch` agrupa por `userId`, carga los canales activos y el `locale` de cada dueño, envía con `Promise.allSettled` y llama a `setLastError` con el error o `null`. Nunca rechaza.
  - `service.ts` (`toDto` quita `token` y calcula `hasToken`; 404 `NotFoundError('Notification channel not found')`; tipo distinto en PATCH → `BadRequestError`; `token` ausente en PATCH → se fusiona con el guardado) y `routes.ts` (`preHandler: app.authenticate`; esquemas de respuesta de `@ikrive/shared`).
- `src/app.ts`: `AppDeps.fetch?: typeof fetch` (por defecto `globalThis.fetch`); crea el dispatcher y registra las rutas.
- `src/jobs/reminders.job.ts`: `runReminders({ db, now, dispatcher })` pasa a ser `async`; tras `createMany` hace `await dispatcher.dispatch(created)`. `startRemindersJob` devuelve la promesa de `run()` para que `protect` evite solapes.
- `src/server.ts`: crea el dispatcher con `globalThis.fetch` y `config.BASE_URL`, `run: async () => app.log.info(await runReminders({ db, dispatcher }), …)`.
- `test/helpers.ts`: `createTestApp(env, { fetch })`.

### `apps/web`
- `src/lib/query-keys.ts`: `notificationChannels: { all: ['notification-channels'] }`.
- `src/features/notification-channels/`
  - `queries.ts`: `notificationChannelsQuery`, `useCreateChannel`, `useUpdateChannel`, `useDeleteChannel`, `useTestChannel` (todas invalidan `all`; la prueba también, para refrescar `lastError`).
  - `form.ts`: `channelFormSchema(mode)` (crear → `createNotificationChannelSchema`; editar → `updateNotificationChannelSchema`), `defaultsFrom(channel?)`, `toCreateBody`, `toUpdateBody` (omite `token` vacío) y `channelSummary(channel)` (host + topic / key, o host del webhook).
  - `channel-form.tsx`: `ChannelFormDialog` (patrón `ScheduleFormDialog`; `useWatch('type')` cambia los campos; token como `type="password"` con pista «Déjalo vacío para conservarlo» al editar; selector de tipo deshabilitado al editar).
  - `channels-section.tsx`: `NotificationChannelsSection` (tarjeta con «Añadir», filas con `Badge` del tipo, resumen, checkbox nativo «Activo» con `aria-label`, último error en `text-destructive`, botones fantasma «Probar», «Editar», «Eliminar» con `AlertDialog` de confirmación).
- `src/routes/_app/settings.tsx`: loader `Promise.all([settingsQuery, notificationChannelsQuery])` y la sección tras «Preferencias», dentro de `<Suspense>`.
- `src/i18n/locales/{es,en}.json`: bloque `notificationChannels` (`title`, `description`, `add`, `edit`, `empty`, `created`, `updated`, `deleted`, `enabled`, `enabledLabel`, `test`, `testLabel`, `testOk`, `testFailed`, `lastError`, `tokenKeep`, `editLabel`, `deleteLabel`, `deleteTitle`, `deleteDescription`, `types.*`, `fields.*`).

## Base de datos

```sql
CREATE TABLE notification_channels (
  id text PRIMARY KEY NOT NULL,
  user_id text NOT NULL REFERENCES user(id) ON DELETE cascade,
  type text NOT NULL,           -- ntfy | gotify | apprise | webhook
  config text NOT NULL,         -- JSON, incluye el token
  enabled integer DEFAULT true NOT NULL,
  last_error text,
  created_at integer NOT NULL,
  updated_at integer NOT NULL
);
CREATE INDEX notification_channels_user_id_idx ON notification_channels (user_id);
```

## Contrato HTTP (todas requieren sesión → 401)

| Método y ruta | Cuerpo | Respuesta | Errores |
|---|---|---|---|
| `GET /api/notification-channels` | — | 200 `NotificationChannel[]` | — |
| `POST /api/notification-channels` | `{ type, enabled?, config }` | 201 `NotificationChannel` | 400 |
| `PATCH /api/notification-channels/:id` | `{ type, enabled?, config? }` | 200 `NotificationChannel` | 400 (validación o tipo distinto), 404 |
| `DELETE /api/notification-channels/:id` | — | 204 | 404 |
| `POST /api/notification-channels/:id/test` | — | 200 `{ ok, error }` | 404 |

Ejemplo de respuesta: `{ "id": "…", "type": "ntfy", "enabled": true, "hasToken": true, "lastError": null, "config": { "serverUrl": "https://ntfy.sh", "topic": "coche" }, "createdAt": "…", "updatedAt": "…" }`.

## Peticiones salientes

| Tipo | Petición |
|---|---|
| ntfy | `POST <serverUrl>/` · JSON `{ topic, title, message, click? }` · `Authorization: Bearer <token>`? |
| Gotify | `POST <serverUrl>/message` · `X-Gotify-Key: <token>` · JSON `{ title, message, priority: 5, extras? }` |
| Apprise | `POST <serverUrl>/notify/<key>` · JSON `{ title, body, tag? }` (enlace al final de `body`) |
| Webhook | `POST <url>` · JSON `{ event: 'notification'\|'test', type, title, body, link, createdAt }` · `Authorization: Bearer <token>`? |

Todas con `content-type: application/json`. `ChannelMessage = { event, type: NotificationType | null, title, body, link: string | null, createdAt }`; para una notificación: `title = "<etiqueta del tipo>: <title>"`, `body = body ?? title`, `link = new URL(link, BASE_URL)`.

## Tipos y firmas

```ts
export interface NotificationChannel { send(message: ChannelMessage): Promise<void> }
export function buildChannelRequest(channel: NotificationChannelConfig, message: ChannelMessage): { url: string; init: RequestInit };
export function createChannel(channel: NotificationChannelConfig, deps: { fetch: typeof fetch; timeoutMs?: number }): NotificationChannel;
export function createNotificationDispatcher(deps: { db: Db; fetch: typeof fetch; baseUrl: string; timeoutMs?: number }): NotificationDispatcher;
export async function runReminders(args: { db: Db; now?: Date; dispatcher: NotificationDispatcher }): Promise<{ evaluated: number; created: number }>;
```

## Impacto en UI

- Tarjeta con `Card`, `Badge variant="stamp"` para el tipo, `Button variant="accent" size="sm"` para «Añadir», `Dialog` / `AlertDialog` existentes, `FormField`, `Input`, `Select`. Sin componentes nuevos.
- Vacío: `<p>` atenuado. Carga: la del loader de la ruta (Suspense). Error al guardar: `role="alert"` en el diálogo. Prueba: `toast.success` / `toast.error` con el error.
- Móvil: filas en columna con las acciones debajo; botones de 44 px. Modo oscuro: solo tokens existentes.

## Alternativas descartadas

- **Cifrar los tokens en reposo con `AUTH_SECRET`.** Rotar el secreto rompería los canales y el backup ya es copiar `/data`, donde también están las sesiones. El criterio solo pide no devolverlos en claro.
- **Dejar `runReminders` síncrono y enviar desde `server.ts`.** El pegamento quedaría sin test y #17 tendría que repetirlo; el dispatcher inyectado se prueba con `runReminders` directamente.
- **Apprise en modo sin estado (`POST /notify` con `urls`).** Guardaría credenciales de terceros dentro de las URL; con una clave (`/notify/<key>`) viven en apprise-api.
- **Un switch de Radix nuevo para «Activo».** Un checkbox nativo accesible basta (ya se usa en `maintenance-form.tsx`).

## Decisiones a validar (Gate 1)

1. **Sin nombre de canal**: la fila se identifica por tipo + resumen (host y topic/clave). El criterio no lo pide.
2. **El tipo es inmutable**: `PATCH` exige `type` (para validar la config) y responde 400 si no coincide. Para cambiar de tipo, se borra y se crea otro.
3. **Token en `PATCH`**: ausente → se conserva; no hay forma de quitar un token opcional salvo recrear el canal.
4. **La prueba responde 200** con `{ ok, error }` aunque falle (no 502), funciona con el canal desactivado y actualiza `last_error` como un envío real.
5. **Timeout fijo de 10 s** (`CHANNEL_TIMEOUT_MS`), sin variable de entorno; sin reintentos.
6. **Formato del mensaje**: `«Mantenimiento vencido: Cambio de aceite»` + nombre del vehículo + enlace absoluto con `BASE_URL`.
7. **Apprise solo con clave** (`key`) de apprise-api.

## Riesgos

- **SSRF**: cualquier usuario puede hacer que el servidor haga `POST` a una URL arbitraria, incluida la red local (es el caso de uso de Gotify o ntfy en LAN). Se acepta en una app autoalojada; solo `http(s)` y respuesta reducida a `HTTP <status>`.
- Los tokens quedan en claro en SQLite.
- Serializar uniones discriminadas en la respuesta con `fastify-type-provider-zod`: si da guerra, se valida con el esquema DTO en el servicio y la ruta declara la unión igualmente.
- `runReminders` pasa a `async`: hay que poner `await` en los tests existentes de `reminders.test.ts` y `notifications.test.ts`.

## Fuera de alcance

- `odometer-nudge.job` (#17), que reutilizará `dispatcher.dispatch`.
- Filtros por tipo de notificación por canal, reintentos o cola, cifrado de secretos, endpoint de admin para lanzar jobs.
