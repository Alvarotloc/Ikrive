# Review — #16 notification-channels

**Veredicto:** APPROVED

**Re-revisión tras Gate 2** (R38–R39, T24–T26). Revisado: `git diff main...HEAD` (commits del spec y `docs(plan)`) + árbol de trabajo sin commitear (modificados y nuevos), contra `specs/notification-channels/`, `CONTRIBUTING.md`, `docs/sdd.md`, `docs/verification.md` y `CHECKPOINTS.md`. Riesgos aceptados por el humano (no se evalúan como hallazgos): SSRF hacia cualquier URL `http(s)` y tokens en claro en SQLite.

## Trazabilidad requirements ↔ tests

- R1: [x] La migración `0006_notification_channels.sql` (revisada: columnas, FK `ON DELETE cascade`, índice) se aplica en `createTestApp`; todos los tests de `apps/api/test/notification-channels*.test.ts` leen y escriben la tabla y comprueban filas (`row(db, id)`, `rows(db)`).
- R2: [x] `packages/shared/src/schemas/notification-channels.test.ts` › `accepts a valid config for every channel type`, `rejects an unknown type and missing required fields`, `rejects non-http urls` (ftp, javascript, file, texto).
- R3: [x] `apps/api/test/notification-channels.test.ts` › `rejects an invalid channel` (4 cuerpos → 400 problem+json, 0 filas) y `updates enabled and config keeping the stored token` (PATCH `ftp://` → 400, config sin cambios en BD).
- R4: [x] › `creates and lists channels oldest first` (orden `['gotify','webhook']`).
- R5: [x] › mismo test: 201, cuerpo exacto con `enabled: true`, `lastError: null`; shared › `defaults enabled to true`.
- R6: [x] › `updates enabled and config keeping the stored token`: comprueba 200, cuerpo y que la fila conserva `token: 'tk_secret'`; con `token` nuevo lo reemplaza.
- R7: [x] › `rejects a patch with a different type`: 400 problem+json y fila idéntica a la anterior.
- R8: [x] › `deletes a channel`: 204, fila borrada y segundo DELETE → 404.
- R9: [x] › `never returns the token`: POST, PATCH y GET sin el secreto ni la clave `"token"` en el cuerpo.
- R10: [x] › `never returns the token` (`hasToken` true/true/false) y `creates and lists…`.
- R11: [x] › `returns 404 for another user's channel`: PATCH, DELETE, test de otro usuario e id inexistente → 404 problem+json, fila sin cambios, `fetch` no llamado.
- R12: [x] › `hides other users' channels`.
- R13: [x] › `requires a session`: 401 en los cinco endpoints.
- R14: [x] › `sends a test message and clears the last error`: canal desactivado, `{ ok: true, error: null }`, petición Gotify exacta en inglés.
- R15: [x] › `reports a failed test and stores the error`: `{ ok: false, error: 'HTTP 500' }`, `last_error` en BD y en `GET`.
- R16: [x] `apps/api/src/modules/notification-channels/channels.test.ts` › `builds the ntfy request` (URL, cabeceras con/sin bearer, cuerpo con/sin `click`).
- R17: [x] › `builds the gotify request` (`x-gotify-key`, `priority: 5`, `extras` solo con enlace).
- R18: [x] › `builds the apprise request` (`/notify/<key>`, `tag`, enlace al final de `body`).
- R19: [x] › `builds the webhook request` (cuerpo completo, con/sin bearer).
- R20: [x] › `fails with the HTTP status on a non-2xx response` (`/^HTTP 401$/`); integración en `reports a failed test…`.
- R21: [x] › `aborts after the timeout` (`timeoutMs: 20`, error `Timeout after 20 ms` y `signal.aborted`).
- R22: [x] `messages.test.ts` › `composes the message in the owner's locale` (es/en, enlace absoluto, cuerpo nulo); `notification-channels-dispatch.test.ts` › `sends new notifications…` (títulos es/en y enlace con `BASE_URL`).
- R23: [x] `messages.test.ts` › `builds the test message`; integración en inglés y en español (`es` por defecto).
- R24: [x] `notification-channels-dispatch.test.ts` › `sends new notifications through the owner's enabled channels` (lista exacta de URLs: ningún envío cruzado).
- R25: [x] › `skips disabled channels`.
- R26: [x] › `does not resend deduplicated notifications` (`created: 0` y `fetch` sigue con una llamada).
- R27: [x] › `a failing channel stores last_error and does not stop the rest` (resuelve, notificación in-app creada, el segundo canal recibe la petición, `last_error` solo en el primero).
- R28: [x] › `a successful send clears last_error`; `notification-channels.test.ts` › `sends a test message and clears the last error`.
- R29: [x] `channels-section.test.tsx` › `shows an empty state`, `lists channels with type, summary and last error`; `form.test.ts` › `summarises each channel type`.
- R30: [x] `channel-form.test.tsx` › `creates a gotify channel` (cambio de tipo cambia campos, POST exacto, diálogo cerrado). Ver aviso 1.
- R31: [x] `channel-form.test.tsx` › `edits a channel without sending the token` (tipo deshabilitado, token vacío, PATCH sin `token`); `form.test.ts` › `omits an empty token from the update body`.
- R32: [x] `channels-section.test.tsx` › `toggles a channel` (PATCH `{ type: 'ntfy', enabled: false }` y checkbox desmarcado tras recargar).
- R33: [x] › `deletes a channel after confirming` (cancelar no borra; confirmar envía DELETE y la fila desaparece).
- R34: [x] › `shows the test result` (toast de éxito y de fallo con `HTTP 401`).
- R35: [x] `channel-form.test.tsx` › `shows field errors without sending` (`aria-invalid="true"`, mensaje, ningún fetch).
- R36: [x] › `shows the API error and stays open` (`role="alert"`, diálogo abierto).
- R37: [x] `apps/web/src/i18n/locales.test.ts` › `es and en define the same keys`, `defines a label for every notification channel type`.
- R38: [x] `packages/shared/src/schemas/notification-channels.test.ts:57` › `rejects urls with credentials` (4 URLs con userinfo × 4 tipos → issue exacto en `config.url`/`config.serverUrl` con `CHANNEL_URL_CREDENTIALS`; `@` en ruta/query/fragmento aceptado; PATCH también rechaza); `apps/api/test/notification-channels.test.ts:81` › `rejects urls with credentials` (POST y PATCH → 400 problem+json con `errors` exactos, 0 filas, config sin cambios); `apps/web/src/features/notification-channels/channel-form.test.tsx:122` › `rejects a url with credentials without sending` (`aria-invalid`, mensaje traducido que pide usar el token, ningún fetch). Claves `notificationChannels.errors.urlCredentials` en es y en.
- R39: [x] `apps/web/src/features/notification-channels/channels-section.test.tsx:106` › `adds a channel and shows it in the list` (GET vacío → alta → la fila `ntfy.sh/coche` aparece, diálogo cerrado, cuerpo del POST exacto, segundo GET). Cierra el aviso 1 de la revisión anterior.

## Tasks

- T1..T26: [x]

## Checkpoints

- C1: [x] `pnpm harness` OK; una sola feature activa (#16 `in_progress`); rama `feat/notification-channels`.
- C2: [x] Spec completo, EARS estricto, tabla de acceptance cubierta; tasks todas `[x]`; cada R con test leído.
- C3: [x] El diff sin commitear se ciñe a `design.md`. Ver aviso 4 sobre el commit `docs(plan)` de la rama.
- C4: [x] Módulo `modules/notification-channels/{routes,service,repository}.ts` (+ `channels`, `messages`, `dispatcher` previstos en design) cableado en `app.ts`; rutas con esquemas de `@ikrive/shared`; propiedad en el servicio y en el repositorio (404); errores `NotFoundError`/`BadRequestError`; esquema en `db/schema/` y migración generada con drizzle-kit (SQL + snapshot + journal); web en `features/notification-channels/` con `queryOptions`, textos en es/en, `Card`/`Badge stamp`/`Dialog`/`AlertDialog`/`FormField` reutilizados; esquemas en `packages/shared` con tests.
- C5: [x] Sin `any`, `@ts-ignore`, `console.log` ni TODOs; fechas ISO en DTO; sin ficheros subidos.
- C6: [x] `pnpm harness --full` en verde ejecutado por mí (shared 35, api 121, web 170, re-ejecutado tras T24–T26); SQLite en memoria, solo se simula `fetch`; 16 capturas (claro/oscuro/escritorio/móvil) presentes en el scratchpad (revisada `mobile-dark-section.png`).
- C7: [x] `progress/impl_notification-channels.md` con archivos, mapa R→test y salida; `progress/current.md` al día; `docs/PLAN.md` no cambia de decisión (la fase 4 sigue abierta).

## Hallazgos

Ninguno bloqueante.

## Avisos para el humano (no bloquean)

1. ~~R30/R39 sin test de alta visible en la lista~~ → resuelto con R39.
2. **R1 FK en cascada:** no hay test que borre un usuario y compruebe que desaparecen sus canales; está en el SQL generado (revisado).
3. ~~Credenciales en URL devueltas en `config`~~ → resuelto con R38 (se rechazan en crear y editar).
4. **Commit `0f0cd63 docs(plan): drop hosted version notes`** está en la rama y entrará con el merge de la feature aunque no es parte de #16.
5. **`dispatch` y fallos de BD:** si falla la consulta de canales, `runReminders` rechaza después de guardar las notificaciones in-app (lo captura croner). Documentado en «Desviaciones»; no contradice R27.
6. **Envíos secuenciales por canal:** con muchas notificaciones y un canal que no responde, una ejecución puede tardar N × 10 s; `protect` evita solapes.
7. `progress/explore_notification-channels_{backend,web}.md` sin trackear: decidir si se commitean o se borran al cerrar.
8. **R38, detección por regex** (`AUTHORITY` en `packages/shared/src/schemas/notification-channels.ts`) en lugar de `new URL()`, justificada porque `shared` no tiene tipos DOM/Node; los casos del test cubren userinfo y `@` fuera del host. La tabla «Acceptance → requirements» de `requirements.md` no lista R38–R39 (son añadidos de Gate 2, con su propia sección).

## Cambios requeridos

Ninguno.
