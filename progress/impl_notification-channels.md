# Implementación — #16 notification-channels

Rama `feat/notification-channels`. Tareas T1–T26 completadas (T24–T26: cambios pedidos por el humano en Gate 2, R38–R39). No hay commits: los hace el leader después de Gate 2.

## Cambios por archivo

### `packages/shared`
- `src/schemas/notification-channels.ts` (nuevo, exportado en `src/index.ts`):
  - Configs por tipo: `ntfyConfigSchema`, `gotifyConfigSchema`, `appriseConfigSchema` y `webhookConfigSchema`. URLs `http(s)` de hasta 2048 caracteres; `topic` y `key` con el formato `^[A-Za-z0-9_-]{1,64}$`; `token` entre 1 y 512 caracteres, recortado; `tag` como `optionalText(128)`.
  - `notificationChannelConfigSchema`: el par `{ type, config }` que se guarda.
  - `createNotificationChannelSchema` (`enabled` por defecto `true`) y `updateNotificationChannelSchema` (`type` obligatorio; `config` opcional y con el token opcional).
  - DTO `notificationChannelSchema`: config sin token y con `hasToken`.
  - `notificationChannelTestResultSchema` y sus tipos.
- `src/schemas/notification-channels.test.ts` (nuevo).
- **T24 (R38).** `channelUrlSchema` añade un `refine` que rechaza URLs con userinfo (`usuario:contraseña@`, también solo usuario o solo contraseña) con el mensaje exportado `CHANNEL_URL_CREDENTIALS` («URLs with credentials are not allowed: use the token field»). Aplica a `serverUrl` y `url` en crear, editar y en la config guardada. La detección lee la autoridad como el parser WHATWG (tras el esquema y las `/` o `\`, hasta la primera `/`, `\`, `?` o `#`); un `@` en la ruta, la query o el fragmento no cuenta. No usa `URL` porque `packages/shared` no tiene tipos de DOM ni de Node; comprobado contra `new URL()` de Node con los casos del test. Test: `rejects urls with credentials`.

### `apps/api`
- `src/db/schema/notification-channels.ts` (nuevo, añadido al barrel).
- `src/db/migrations/0006_notification_channels.sql`, `meta/0006_snapshot.json` y `_journal.json`: generados con `drizzle-kit generate --name notification_channels`. He revisado el SQL y coincide con `design.md`.
- `src/modules/notification-channels/`:
  - `repository.ts`: `listByUser`, `findOwned`, `create`, `update`, `remove`, `listEnabledByUsers` y `setLastError`, más el helper `channelConfigOf(row)`.
  - `channels.ts`:
    - `CHANNEL_TIMEOUT_MS = 10_000` y `ChannelMessage`.
    - `buildChannelRequest`: un `switch` por tipo; `joinUrl` evita la barra doble.
    - `createChannel` usa `AbortSignal.timeout`. Los errores posibles son `HTTP <status>`, `Timeout after <ms> ms` y los de red con su causa (`fetch failed: <causa>`), recortados a 500 caracteres. El cuerpo de la respuesta se descarta.
  - `messages.ts`: textos es/en como `Record<Locale, …>`, `toChannelMessage` y `testMessage`.
  - `dispatcher.ts`: `createNotificationDispatcher({ db, fetch, baseUrl, timeoutMs? })` devuelve `{ dispatch, sendTest }`. Detalles en «Desviaciones».
  - `service.ts`:
    - `toDto` quita el token y calcula `hasToken`; la salida pasa por `notificationChannelSchema.parse`.
    - Un canal ajeno o inexistente responde 404.
    - Un tipo distinto en PATCH responde 400 `BadRequestError`.
    - El token guardado se fusiona y se revalida con `notificationChannelConfigSchema`.
  - `routes.ts`: los cinco endpoints, con `preHandler: app.authenticate`.
- `src/app.ts`: añade `AppDeps.fetch?` (por defecto `globalThis.fetch`) y monta el dispatcher, el servicio y las rutas.
- `src/jobs/reminders.job.ts`:
  - `runReminders({ db, now, dispatcher })` ahora es async y hace `await dispatcher.dispatch(created)` solo con las filas que devuelve `createMany`.
  - `startRemindersJob` recibe `run: () => Promise<unknown>`, y el callback de croner la espera con `await`, así `protect` sigue evitando solapes.
- `src/server.ts`: crea el dispatcher con `globalThis.fetch` y `BASE_URL`; `run` es async.
- `test/helpers.ts`: `createTestApp(env, { fetch })`, `createTestDispatcher(db, fetch?)` y `TEST_BASE_URL`.
- `test/reminders.test.ts` y `test/notifications.test.ts`: `await runReminders({ …, dispatcher: createTestDispatcher(db) })`.
- **T24 (R38).** `test/notification-channels.test.ts` › `rejects urls with credentials`: POST y PATCH → 400 problem+json con `errors: [{ path: 'config.url' | 'config.serverUrl', message: CHANNEL_URL_CREDENTIALS }]`, sin filas nuevas y sin cambios en la config guardada. No hace falta tocar código de la API: valida con el esquema compartido.
- Tests nuevos: `src/modules/notification-channels/channels.test.ts`, `src/modules/notification-channels/messages.test.ts`, `test/notification-channels.test.ts` y `test/notification-channels-dispatch.test.ts`.

### `apps/web`
- `src/lib/query-keys.ts`: `notificationChannels.all`.
- `src/features/notification-channels/`:
  - `queries.ts`: la query y las mutaciones de crear, editar, borrar y probar. Todas invalidan `all`.
  - `form.ts`:
    - `CHANNEL_FIELDS` por tipo.
    - `channelFormSchema(mode)`: valida con el esquema compartido de crear o editar y lleva sus errores a `config.<campo>`.
    - `defaultsFrom`, `toCreateBody`, `toUpdateBody` (deja fuera los campos vacíos, incluido el token) y `channelSummary`.
  - `form.test.ts`.
  - `channel-form.tsx` (`ChannelFormDialog`):
    - `useWatch('type')` decide qué campos se muestran.
    - El tipo se deshabilita al editar.
    - El token es `type="password"`. Cuando hay uno guardado, se muestra la pista «Hay un token guardado. Déjalo vacío para conservarlo.» como descripción accesible.
    - La etiqueta es «Token (opcional)» salvo en Gotify al crear.
    - Un error de la API muestra un `role="alert"` y el diálogo sigue abierto.
  - `channels-section.tsx` (`NotificationChannelsSection`):
    - Tarjeta con «Añadir canal» y filas con `Badge stamp` del tipo, resumen y último error en `text-destructive`.
    - Checkbox nativo «Activo», que refleja el valor pedido mientras se guarda.
    - Botón «Probar» con toast de éxito o de fallo con el error.
    - Botones de editar y de eliminar; eliminar pide confirmación con `AlertDialog`.
    - En móvil, las acciones van debajo con objetivos de 44 px.
  - `channels-section.test.tsx` y `channel-form.test.tsx`.
- `src/routes/_app/settings.tsx`: el loader hace `Promise.all` de ajustes y canales; la sección va tras «Preferencias», dentro de `<Suspense>`.
- `src/i18n/locales/{es,en}.json`: bloque `notificationChannels` con las claves de `design.md` más `fields.tokenOptional`.
- `src/i18n/locales.test.ts`: `defines a label for every notification channel type`.
- `src/features/settings/settings-page.test.tsx` y `use-user-locale.test.tsx`: mock de `GET /notification-channels`.
- **T24 (R38).**
  - `features/notification-channels/form.ts`: `channelFormSchema` traduce el issue con mensaje `CHANNEL_URL_CREDENTIALS` a `notificationChannels.errors.urlCredentials` (el mensaje literal del esquema tiene prioridad sobre el mapa global de zod; mismo patrón que `schedules/form.ts`).
  - `i18n/locales/{es,en}.json`: `notificationChannels.errors.urlCredentials` («No pongas usuario ni contraseña en la URL: usa el campo token.» / «Do not put a username or password in the URL: use the token field.»).
  - `channel-form.test.tsx` › `rejects a url with credentials without sending`.
- **T25 (R39).** `channels-section.test.tsx` › `adds a channel and shows it in the list`: GET vacío → «Añadir canal» → rellenar → «Guardar» → la fila `ntfy.sh/coche` aparece, el diálogo se cierra y hay un segundo GET. Comprobado que falla si `useCreateChannel` deja de invalidar `notificationChannels.all` (cambio temporal, revertido).

## Trazabilidad

| R | Test(s) |
|---|---|
| R1 | La migración `0006` se aplica en todos los tests de la API (`createTestApp` → `runMigrations`). Usan la tabla: `test/notification-channels.test.ts` › todos; `test/notification-channels-dispatch.test.ts` › todos |
| R2 | `packages/shared/src/schemas/notification-channels.test.ts` › `accepts a valid config for every channel type`, `rejects an unknown type and missing required fields`, `rejects non-http urls` |
| R3 | `notification-channels.test.ts` (shared) › `rejects an unknown type and missing required fields`, `rejects non-http urls`; `apps/api/test/notification-channels.test.ts` › `rejects an invalid channel` (400 problem+json, sin filas), `updates enabled and config keeping the stored token` (PATCH con URL `ftp` → 400 sin cambios) |
| R4 | `notification-channels.test.ts` › `creates and lists channels oldest first` |
| R5 | `notification-channels.test.ts` › `creates and lists channels oldest first` (201, `enabled: true`, `lastError: null`); shared › `defaults enabled to true` |
| R6 | `notification-channels.test.ts` › `updates enabled and config keeping the stored token` |
| R7 | `notification-channels.test.ts` › `rejects a patch with a different type` |
| R8 | `notification-channels.test.ts` › `deletes a channel` |
| R9 | `notification-channels.test.ts` › `never returns the token` (POST, GET y PATCH) |
| R10 | `notification-channels.test.ts` › `never returns the token`, `creates and lists channels oldest first` |
| R11 | `notification-channels.test.ts` › `returns 404 for another user's channel` (PATCH, DELETE y test; sin cambios y `fetch` sin llamar) |
| R12 | `notification-channels.test.ts` › `hides other users' channels` |
| R13 | `notification-channels.test.ts` › `requires a session` (401 en los cinco endpoints) |
| R14 | `notification-channels.test.ts` › `sends a test message and clears the last error` (canal desactivado) |
| R15 | `notification-channels.test.ts` › `reports a failed test and stores the error` |
| R16 | `channels.test.ts` › `builds the ntfy request` |
| R17 | `channels.test.ts` › `builds the gotify request` |
| R18 | `channels.test.ts` › `builds the apprise request` |
| R19 | `channels.test.ts` › `builds the webhook request` |
| R20 | `channels.test.ts` › `fails with the HTTP status on a non-2xx response`; `notification-channels.test.ts` › `reports a failed test and stores the error` |
| R21 | `channels.test.ts` › `aborts after the timeout` |
| R22 | `messages.test.ts` › `composes the message in the owner's locale`; `notification-channels-dispatch.test.ts` › `sends new notifications through the owner's enabled channels` (es y en) |
| R23 | `messages.test.ts` › `builds the test message`; `notification-channels.test.ts` › `sends a test message and clears the last error` (en), `reports a failed test and stores the error` (es) |
| R24 | `notification-channels-dispatch.test.ts` › `sends new notifications through the owner's enabled channels` |
| R25 | `notification-channels-dispatch.test.ts` › `skips disabled channels` |
| R26 | `notification-channels-dispatch.test.ts` › `does not resend deduplicated notifications` |
| R27 | `notification-channels-dispatch.test.ts` › `a failing channel stores last_error and does not stop the rest` |
| R28 | `notification-channels-dispatch.test.ts` › `a successful send clears last_error`; `notification-channels.test.ts` › `sends a test message and clears the last error` |
| R29 | `channels-section.test.tsx` › `shows an empty state`, `lists channels with type, summary and last error`; `form.test.ts` › `summarises each channel type`; `settings-page.test.tsx` (con la sección montada); capturas |
| R30 | `channel-form.test.tsx` › `creates a gotify channel`; `form.test.ts` › `builds the create body for each type`; capturas |
| R31 | `channel-form.test.tsx` › `edits a channel without sending the token`; `form.test.ts` › `omits an empty token from the update body` |
| R32 | `channels-section.test.tsx` › `toggles a channel` |
| R33 | `channels-section.test.tsx` › `deletes a channel after confirming` |
| R34 | `channels-section.test.tsx` › `shows the test result` |
| R35 | `channel-form.test.tsx` › `shows field errors without sending`; `form.test.ts` › `requires the Gotify token only when creating`, `reports invalid fields of the selected type only` |
| R36 | `channel-form.test.tsx` › `shows the API error and stays open` |
| R37 | `src/i18n/locales.test.ts` › `es and en define the same keys`, `defines a label for every notification channel type` |
| R38 | `packages/shared/src/schemas/notification-channels.test.ts` › `rejects urls with credentials`; `apps/api/test/notification-channels.test.ts` › `rejects urls with credentials`; `apps/web/src/features/notification-channels/channel-form.test.tsx` › `rejects a url with credentials without sending`; capturas `*-url-credentials.png` |
| R39 | `apps/web/src/features/notification-channels/channels-section.test.tsx` › `adds a channel and shows it in the list` |

## `pnpm harness --full`

```
[OK]    21 features: 17 done, 3 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #16 notification-channels (in_progress)
[OK]    Rama actual: feat/notification-channels
[OK]    pnpm lint
[OK]    pnpm typecheck
packages/shared  Tests  35 passed (35)
apps/api         Tests  121 passed (121)
apps/web         Tests  170 passed (170)
[OK]    pnpm test
[OK]    Arnés en verde.
```

Ejecución tras T24–T26. El Docker build no se ha repetido: T24–T26 no tocan el arranque ni las dependencias.

Los tests de la web que montan el router siguen sacando el aviso «Not implemented: Window's scrollTo()» de jsdom. Ya salía antes de esta feature.

**Docker** (cambia el arranque en `server.ts`):
- `docker build -f docker/Dockerfile -t ikrive:dev .` termina bien.
- El contenedor, con `AUTH_SECRET`, responde `/api/health` → `{"status":"ok"}`.
- `0006_notification_channels.sql` está en `/app/dist/migrations/`.

## Revisión visual

- **Entorno aislado.** La SPA se compiló en el scratchpad y la sirvió la API en `127.0.0.1:3418`, con `DATA_DIR` también en el scratchpad y `REMINDERS_ENABLED=false`. No se tocó la BD ni el `pnpm dev` del humano. La API ya está parada.
- **Datos.** Usuario `demo@ikrive.test` con cuatro canales:
  - ntfy con token.
  - Gotify apuntando a `http://127.0.0.1:9`. Su prueba falló con `fetch failed: bad port`, y ese error queda guardado y visible.
  - Apprise con etiqueta.
  - Webhook desactivado.
- **Herramienta:** playwright-core 1.58 contra `/usr/bin/google-chrome`, con `es-ES` y `Europe/Madrid`. Desbordamiento horizontal de 0 px en las cuatro variantes.
- **Capturas** (efímeras, en el scratchpad). Se hicieron para escritorio y móvil (375 px), en claro y oscuro. Las rutas siguen el patrón `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/b51bf22a-32d6-4041-9a95-e44e74955d41/scratchpad/shots/{desktop,mobile}-{light,dark}-<vista>.png`. Por cada combinación hay cuatro vistas:
  - `section`: la sección de canales.
  - `edit-dialog`: edición de Gotify, con la pista del token.
  - `add-errors`: alta de Apprise con URL `ftp` → errores de campo.
  - `test-failed`: la página tras pulsar «Probar» en Gotify.

  Las 16 rutas:
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/b51bf22a-32d6-4041-9a95-e44e74955d41/scratchpad/shots/desktop-light-section.png`
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/b51bf22a-32d6-4041-9a95-e44e74955d41/scratchpad/shots/desktop-dark-section.png`
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/b51bf22a-32d6-4041-9a95-e44e74955d41/scratchpad/shots/mobile-light-section.png`
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/b51bf22a-32d6-4041-9a95-e44e74955d41/scratchpad/shots/mobile-dark-section.png`
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/b51bf22a-32d6-4041-9a95-e44e74955d41/scratchpad/shots/desktop-light-edit-dialog.png`
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/b51bf22a-32d6-4041-9a95-e44e74955d41/scratchpad/shots/desktop-dark-edit-dialog.png`
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/b51bf22a-32d6-4041-9a95-e44e74955d41/scratchpad/shots/mobile-light-edit-dialog.png`
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/b51bf22a-32d6-4041-9a95-e44e74955d41/scratchpad/shots/mobile-dark-edit-dialog.png`
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/b51bf22a-32d6-4041-9a95-e44e74955d41/scratchpad/shots/desktop-light-add-errors.png`
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/b51bf22a-32d6-4041-9a95-e44e74955d41/scratchpad/shots/desktop-dark-add-errors.png`
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/b51bf22a-32d6-4041-9a95-e44e74955d41/scratchpad/shots/mobile-light-add-errors.png`
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/b51bf22a-32d6-4041-9a95-e44e74955d41/scratchpad/shots/mobile-dark-add-errors.png`
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/b51bf22a-32d6-4041-9a95-e44e74955d41/scratchpad/shots/desktop-light-test-failed.png`
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/b51bf22a-32d6-4041-9a95-e44e74955d41/scratchpad/shots/desktop-dark-test-failed.png`
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/b51bf22a-32d6-4041-9a95-e44e74955d41/scratchpad/shots/mobile-light-test-failed.png`
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/b51bf22a-32d6-4041-9a95-e44e74955d41/scratchpad/shots/mobile-dark-test-failed.png`

- **T24 (R38), alta con credenciales.** Misma configuración aislada (SPA recompilada en el scratchpad, API en `127.0.0.1:3418`, ya parada): alta ntfy con `https://ada:secreto@ntfy.example.com` → campo marcado y mensaje «No pongas usuario ni contraseña en la URL: usa el campo token.». Desbordamiento 0 px en las cuatro variantes.
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/b51bf22a-32d6-4041-9a95-e44e74955d41/scratchpad/shots/desktop-light-url-credentials.png`
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/b51bf22a-32d6-4041-9a95-e44e74955d41/scratchpad/shots/desktop-dark-url-credentials.png`
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/b51bf22a-32d6-4041-9a95-e44e74955d41/scratchpad/shots/mobile-light-url-credentials.png`
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/b51bf22a-32d6-4041-9a95-e44e74955d41/scratchpad/shots/mobile-dark-url-credentials.png`

## Desviaciones y decisiones menores

Ninguna cambia el contrato ni los requirements.

1. **`dispatch` por canal.** Si una notificación pide varios mensajes a un mismo canal, se envían en secuencia y `last_error` se escribe una vez al final: el último error, o `null` si todos fueron bien. Los canales distintos van en paralelo con `Promise.allSettled`.
   - Motivo: con envíos paralelos al mismo canal, el `null` de un éxito podía pisar el error de un fallo según el orden de llegada.
   - Lo que cubren R27 y R28 se cumple igual.
   - Los envíos nunca hacen rechazar a `dispatch`. Un fallo de la propia BD (la consulta de canales) sí se propagaría, y lo registraría el `catch` de croner.
2. **Errores de red.** Llevan la causa, por ejemplo `fetch failed: connect ECONNREFUSED`. Un `fetch failed` sin más no ayuda al usuario a arreglar el canal. Se recortan igual a 500 caracteres.
3. **`hasToken` y el token en PATCH.** El servicio reconstruye la config fusionando el token guardado y la vuelve a validar con `notificationChannelConfigSchema`. Si no es válida, responde 400 en vez de guardar una config incoherente; con datos guardados por la propia API no ocurre.
4. **Formulario web.** Guarda todos los campos como texto, sea cual sea el tipo, y solo valida y envía los del tipo elegido. Si el usuario cambia de tipo, no pierde lo escrito.
   - `channelFormSchema` reutiliza el esquema compartido con un `superRefine`, así que los mensajes salen del mapa de errores de zod ya traducido.
   - `toCreateBody` y `toUpdateBody` reciben los valores del formulario: la omisión del token vacío ocurre ahí.
5. **Claves i18n.**
   - Se añade `fields.tokenOptional` («Token (opcional)»).
   - `enabledLabel` queda como «Activo ({{channel}})» y no «Activar …», para que el nombre accesible contenga el texto visible «Activo» (WCAG 2.5.3).
   - `testLabel`, `editLabel` y `deleteLabel` usan «<Tipo> <resumen>» como nombre del canal.
6. **Helpers de test de la API.** `createTestDispatcher` en `test/helpers.ts` evita repetir el montaje del dispatcher en los tests de jobs.
7. **T24, canales ya guardados con credenciales.** No se migran: el esquema solo valida entradas nuevas. Un canal antiguo así seguirá fallando el envío con el error de `fetch` en `last_error` hasta que el usuario lo edite (al guardar la config, la validación le pedirá quitar las credenciales).
