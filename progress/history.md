# Bitácora (append-only)

> Una entrada por feature cerrada. No se editan entradas anteriores; solo se añade al final.

---

## 2026-10-14 — Arnés SDD

- **Cambios:** `AGENTS.md`, `CHECKPOINTS.md`, `feature_list.json`, `docs/sdd.md`, `docs/verification.md`, `progress/`, agentes en `.claude/agents/`, hooks y skills en `.claude/`, `scripts/harness/`.
- **Backlog:** fases 1, 1b y 2 registradas como `done` (anteriores al arnés, sin spec). Fase 3 dividida en las features 4–8 (`pending`, `sdd: true`).
- **Resultado:** `pnpm harness` en verde.

## 2026-10-15 — #4 maintenance-records-api

- **Rama:** `feat/maintenance-records-api` (spec en `specs/maintenance-records-api/`, 18 R / 15 T).
- **Cambios:** helpers zod movidos a `shared/schemas/common.ts`; esquemas `shared/schemas/maintenance.ts`; tabla `maintenance_records` (migración `0002`, enlace `odometer_reading_id` con `set null`); módulo `api/modules/maintenance` con CRUD en `/api/vehicles/:id/maintenance`, sincronizado en transacción con una lectura de odómetro `source: 'maintenance'` (409 en conflicto, 400 en fecha futura, 404 en recursos ajenos).
- **Tests:** `apps/api/test/maintenance.test.ts` (11) y `shared/schemas/maintenance.test.ts` (3). `pnpm harness --full` en verde.
- **Revisión:** APPROVED (`progress/review_maintenance-records-api.md`). Avisos no bloqueantes: un PATCH revalida fecha/km actuales; test de borrado en cascada del vehículo pendiente para la feature 6.
- **Gate 2:** probado manualmente por el humano vía curl y aprobado.

## 2026-10-15 — #5 maintenance-attachments-api

- **Rama:** `feat/maintenance-attachments-api` (spec en `specs/maintenance-attachments-api/`, 20 R / 17 T).
- **Cambios:** enums `ATTACHMENT_MIME_TYPES`/`ATTACHMENT_ENTITY_TYPES` y `shared/schemas/attachments.ts`; tabla polimórfica `attachments` (migración `0003`); `lib/file-type.ts` (magic bytes de PDF, JPEG, PNG y WebP, sin dependencias nuevas), decodificación y miniatura WebP de 320 px en `lib/images.ts`, `UnsupportedMediaTypeError` (415); módulo `api/modules/attachments` con listado, subida, descarga, miniatura y borrado en `/api/vehicles/:id/maintenance/:recordId/attachments`; borrar un mantenimiento o un vehículo borra sus adjuntos (filas y ficheros).
- **Tests:** `apps/api/test/attachments.test.ts` (13) y `apps/api/test/file-type.test.ts` (2). `pnpm harness --full` en verde.
- **Revisión:** APPROVED (`progress/review_maintenance-attachments-api.md`). Avisos no bloqueantes: `request.file()` acepta cualquier nombre de campo; el fichero se bufferiza antes del 404 de propiedad; si una fila no tiene su fichero en disco, la descarga y la miniatura dan 500 en vez de 404 (revisar con el barrido de huérfanos de la fase 7).
- **Gate 2:** curls de prueba manual entregados al humano; merge aprobado.

## 2026-10-15 — #9 web-component-testing

- **Rama:** `feat/web-component-testing` (`sdd: false`, sin spec; guiada por los `acceptance`). Añadida a petición del humano para ir antes de #6.
- **Cambios:** devDependencies de Testing Library (`react`, `dom`, `user-event`, `jest-dom`) y `jsdom` en `apps/web`; `apps/web/vitest.config.ts` con proyectos `unit` (node, `*.test.ts`) y `dom` (jsdom, `*.test.tsx`); helper `apps/web/src/test/render.tsx` (`renderWithProviders`, `mockApi`) y `setup.ts`; `allowImportingTsExtensions` en `apps/web/tsconfig.json`; el script `test` de la web ya no usa `--passWithNoTests`. Docs en `CONTRIBUTING.md` y `docs/verification.md`.
- **Tests:** `odometer-form.test.tsx` (409 → error en el campo) y `form-field.test.tsx` (`role="alert"`). Web 18 tests. `pnpm harness --full` en verde.
- **Revisión:** APPROVED (`progress/review_web-component-testing.md`), con re-revisión tras Gate 2. Avisos no bloqueantes: el test de `OdometerForm` localiza la petición por URL en texto; `packages/shared` sigue con `--passWithNoTests`.
- **Gate 2:** el humano pidió quitar `--passWithNoTests` y aprobó el merge.

## 2026-10-15 — #6 maintenance-timeline-web

- **Rama:** `feat/maintenance-timeline-web` (spec en `specs/maintenance-timeline-web/`, 22 R / 14 T). El spec se revisó antes de Gate 1 para usar tests de componente tras #9.
- **Cambios:** `apps/web/src/features/maintenance/` con lógica pura (`timeline.ts`: orden, filtro, grupos por año; `form.ts`: esquema, payload y mapeo de errores), `queries.ts` (consulta y mutaciones que invalidan `vehicles.all`), `MaintenanceSection` (timeline, chips de categoría, borrado con `AlertDialog`, alta solo con vehículo activo) y `MaintenanceFormDialog` (alta y edición, 409 en el campo km). Namespace `maintenance.*` en es/en; la ficha precarga y monta la sección.
- **Tests:** 13 unitarios, 2 de locales y 17 de componente (`maintenance-form.test.tsx`, `maintenance-timeline.test.tsx`). Web 50 tests. Capturas claro/oscuro/375 px. `pnpm harness --full` en verde.
- **Revisión:** APPROVED (`progress/review_maintenance-timeline-web.md`). Avisos no bloqueantes: los mensajes de validación de zod salen en inglés en todos los formularios (hueco transversal, candidato a feature propia).
- **Incidencia:** el primer intento de capturas usó el `pnpm dev` del humano (:5174 → API :3000) y sembró datos en su BD de desarrollo; se borró el vehículo de prueba, queda la cuenta `demo@ikrive.test`.
- **Gate 2:** probado manualmente por el humano (alta, edición, borrado y actualización de km) y aprobado.

## 2026-10-15 — #10 localize-zod-messages

- **Rama:** `feat/localize-zod-messages` (`sdd: false`, sin spec; guiada por los `acceptance`). Añadida a petición del humano para ir antes de #7, a partir del aviso 1 de la revisión de #6.
- **Cambios:** `apps/web/src/i18n/zod.ts` registra un `customError` global (`z.config`) que traduce cada issue de zod con claves `validation.*` de es/en (sin los locales de zod, demasiado técnicos; fallback `validation.invalid`, nunca el inglés por defecto). Se activa una vez desde `i18n/index.ts` y lee el idioma activo en cada validación, así que cubre todos los formularios y los esquemas de `@ikrive/shared` sin tocarlos.
- **Tests:** `i18n/zod.test.ts` (mapa de issues, cambio de idioma, esquemas compartidos), test de componente en `odometer-form.test.tsx` (es → `changeLanguage('en')` → en) y textos exactos en `maintenance-form.test.tsx`. Web 67 tests. `pnpm harness --full` en verde.
- **Revisión:** APPROVED (`progress/review_localize-zod-messages.md`). Avisos no bloqueantes: fecha de compra inválida da el mensaje genérico (`invalid_union`); moneda vacía da «exactamente 3 caracteres»; un error ya visible no cambia de idioma hasta revalidar.
- **Gate 2:** el humano detectó que el idioma elegido en Ajustes no se mantiene al recargar (fallo previo: `i18n/index.ts` solo usa `navigator.language`); se abre como feature aparte. Merge aprobado.

## 2026-10-19 — #11 persist-user-locale

- **Rama:** `feat/persist-user-locale` (`sdd: false`, sin spec; guiada por los `acceptance`). Abierta por el humano en Gate 2 de #10: el idioma elegido en Ajustes se perdía al recargar.
- **Cambios:** `apps/web/src/i18n/locale.ts` (`pickInitialLocale`: localStorage válido → navegador → `es`; `getStoredLocale`/`storeLocale` con try/catch, clave `ikrive.locale`); `i18n/index.ts` arranca con ese idioma y guarda cada `languageChanged`; hook `features/settings/use-user-locale.ts` en el layout `_app` aplica `settings.locale` cuando llegan o cambian los ajustes; Ajustes ya no llama a `changeLanguage` y el toast usa `getFixedT(saved.locale)`.
- **Tests:** `i18n/locale.test.ts` (elección del idioma inicial) y `use-user-locale.test.tsx` (navegador en es + ajustes en en → inglés). Web 75 tests. `pnpm harness --full` en verde.
- **Revisión:** APPROVED (`progress/review_persist-user-locale.md`). Avisos no bloqueantes: en la primera carga sin valor guardado se ve un instante el idioma del navegador; el try/catch del almacenamiento no tiene test propio; `test/setup.ts` escribe `ikrive.locale` en el localStorage de jsdom.
- **Gate 2:** merge aprobado por el humano.

## 2026-10-19 — #7 maintenance-attachments-web

- **Rama:** `feat/maintenance-attachments-web` (SDD, spec en `specs/maintenance-attachments-web/`). En Gate 1 el humano pidió una revisión del spec: adjuntar facturas en el alta, que la web conozca el límite en MB y confirmar la subida en serie. La previsualización sin descargar pasa a la feature #12 `attachment-preview`.
- **Cambios:** `GET /api/config` (con sesión) devuelve `{ maxUploadMb }` (`clientConfigSchema` en shared). En la web, `MaintenanceAttachmentsDialog` se abre con el clip de cada fila de la timeline: miniatura o icono PDF que enlaza al original, subida múltiple en serie, borrado con confirmación y toasts por fichero para 415, 413 y el resto. `AttachmentPicker` y `useAttachmentUpload` se comparten con el formulario de alta: allí se eligen facturas que se suben tras crear el mantenimiento; si alguna falla, el mantenimiento se queda y se avisa para reintentar. Los ficheros que superan el límite se descartan en cliente. En móvil, los iconos de la fila pasan a la línea del badge.
- **Tests:** API 42 (2 nuevos de `/api/config`), web 104 (unitarios de `attachments.ts` y tests de componente del diálogo, el alta y la timeline), shared 11. 16 capturas en claro, oscuro y 375 px, sin desbordamiento. `pnpm harness --full` en verde.
- **Revisión:** APPROVED (`progress/review_maintenance-attachments-web.md`). Avisos no bloqueantes: los toasts de error por fichero salen al terminar la tanda; el diálogo de facturas se puede cerrar con una subida en curso; miniatura o icono se decide por `thumbnailUrl`; `AttachmentPicker` tiene una prop `context` no prevista en el diseño.
- **Gate 2:** merge aprobado por el humano.

## 2026-10-19 — #8 vehicle-maintenance-spending

- **Rama:** `feat/vehicle-maintenance-spending` (SDD, spec en `specs/vehicle-maintenance-spending/`, 8 R / 13 T). Spec aprobado sin cambios en Gate 1.
- **Cambios:** `maintenanceSpendingSchema` en shared; `GET /api/vehicles/:id/maintenance/spending` devuelve `{ total }` (suma con `total()` de SQLite, ignora costes nulos, redondeo a 2 decimales, 404 a vehículos ajenos). En la web, `MaintenanceSpendingMetric` es la cuarta métrica del expediente de la ficha (rejilla `sm:grid-cols-2 xl:grid-cols-4`), con la moneda del usuario; el 0 se muestra como importe. Se refresca por la invalidación existente de `vehicles.all`. Sin cambios de BD.
- **Tests:** API 45 (3 nuevos: suma, cero, autorización), web 107 (3 de componente nuevos + invalidación en `maintenance-form.test.tsx`), shared 11. Capturas en claro, oscuro, 375 px, 1024 px y escritorio, sin desbordamiento. `pnpm harness --full` en verde.
- **Revisión:** APPROVED (`progress/review_vehicle-maintenance-spending.md`). Avisos no bloqueantes: la etiqueta «GASTO EN MANTENIMIENTO» ocupa dos líneas a 1024 px y escritorio; la prioridad de `/maintenance/spending` sobre `/:recordId` se comprueba de forma implícita; las capturas quedaron en el scratchpad efímero.
- **Gate 2:** merge aprobado por el humano.

## 2026-10-20 — #12 attachment-preview

- **Rama:** `feat/attachment-preview` (SDD, spec en `specs/attachment-preview/`, 17 R / 11 T). Spec aprobado sin cambios en Gate 1, incluida la CSP del PDF sin `sandbox`.
- **Cambios:** `attachmentFileQuerySchema` en shared. `GET …/attachments/:attachmentId?inline=1` sirve el adjunto con `Content-Disposition: inline`; sin query o con `inline=0` sigue descargando, y cualquier otro valor da 400. `userContentPolicy` fija una CSP por tipo que sustituye a la de helmet: las imágenes llevan `sandbox`; los PDF no lo llevan y tienen `object-src 'self'` para que Chrome muestre su visor. `nosniff` va explícito en la ruta. CSP y `nosniff` se aplican también a la descarga. En la web, `AttachmentViewer` abre las imágenes en un `Dialog` anidado; los PDF se abren en una pestaña nueva (`noopener noreferrer`) y cada tarjeta y el visor tienen un botón «Descargar». Sin cambios de BD.
- **Tests:** API 50, web 112, shared 11. Verificado en Chrome 151 y Firefox 156 (headless): el PDF y las imágenes se ven con las CSP finales. Capturas en claro, oscuro y 375 px, sin desbordamiento. `pnpm harness --full` en verde.
- **Revisión:** APPROVED (`progress/review_attachment-preview.md`). Avisos no bloqueantes: el PDF sin `sandbox` es la capa más débil (moverlo a un segundo origen si algún día existe); el foco se devuelve a mano al cerrar el visor; con `inline` inválido y sin sesión se responde 400 antes que 401; el nombre de un test de la lista quedó desfasado.
- **Gate 2:** merge aprobado por el humano. Cierra la fase 3.

## 2026-10-21 — #13 maintenance-schedules-api

- **Rama:** `feat/maintenance-schedules-api` (SDD, spec en `specs/maintenance-schedules-api/`, 28 R / 19 T, con 2 exploraciones previas). Spec aprobado sin cambios en Gate 1. El humano no descarta avisar en el futuro también por la fecha estimada (anotado en `docs/PLAN.md`).
- **Cambios:** tabla `maintenance_schedules` (intervalo en meses y/o distancia, `warn_days` + `warn_distance`, último realizado) y `maintenance_records.schedule_id` (FK `ON DELETE set null`), migración `0004`. CRUD en `/api/vehicles/:id/schedules` (404 a vehículos ajenos). `nextDueDate`, `nextDueOdometer`, `nextDueDateEstimated` y `status` (`ok|due_soon|overdue`) se calculan al leer con `computeScheduleDue` en shared; la fecha estimada usa la media de los últimos 90 días (mín. 30 días de lecturas) y no afecta al estado. Vincular un mantenimiento avanza el último realizado si su fecha es ≥ la actual; `scheduleId` de otro vehículo → 400.
- **Tests:** shared 26, API 62, web 112 (fixtures de la web con `scheduleId: null`). `pnpm harness --full` en verde.
- **Revisión:** CHANGES_REQUESTED en la vuelta 1: drizzle-kit omitió `ON DELETE set null` en el `ADD COLUMN`. Con autorización expresa del humano, el implementer retocó a mano esa línea del SQL (con comentario) y se quitó el workaround del repositorio. APPROVED en la vuelta 2 (`progress/review_maintenance-schedules-api.md`). Avisos no bloqueantes: un test compara con «hoy» y podría fallar justo al cambiar de día; editar un mantenimiento vinculado reescribe (idempotente) el último realizado.
- **Gate 2:** merge aprobado por el humano.

## 2026-10-21 — #14 maintenance-schedules-web

- **Rama:** `feat/maintenance-schedules-web` (SDD, spec en `specs/maintenance-schedules-web/`, 21 R / 14 T). Spec aprobado sin cambios en Gate 1.
- **Cambios:** solo `apps/web`. Sección «Próximos mantenimientos» en la ficha del vehículo (`features/schedules/`): reglas ordenadas por estado → fecha → km → título (`sortSchedules`), intervalo, próximo vencimiento con marca «estimada» o texto sin datos, y Badge al día / próximo / vencido (variantes nuevas `warning` con token `--warning` y `danger`). Alta (solo vehículos activos), edición y borrado con confirmación; formulario con `scheduleFormSchema(unit)` derivado de `createMaintenanceScheduleSchema`. Selector «Regla» en el formulario de mantenimiento (oculto sin reglas); guardar recarga la sección. Textos en es/en.
- **Desviaciones aceptadas:** `toUpdateBody` omite `lastDoneDate` vacío (la API no acepta `null`); `z.preprocess` para los números; prefijo «Vence: …».
- **Tests:** web 144, API 62, shared 26. Capturas en claro, oscuro y 375 px sin desbordamiento. `pnpm harness --full` en verde.
- **Revisión:** CHANGES_REQUESTED en la vuelta 1 (faltaba test de recarga tras crear una regla, R12); APPROVED en la vuelta 2 (`progress/review_maintenance-schedules-web.md`). Avisos no bloqueantes: con título vacío y sin intervalos el error de intervalo aparece en un segundo paso (Zod 4); borrar una regla con el formulario de mantenimiento abierto da un 400 que se muestra como «fecha futura».
- **Gate 2:** merge aprobado por el humano.

## 2026-10-21 — #20 locale-independent-unit-tests

- **Rama:** `feat/locale-independent-unit-tests` (`sdd: false`, sin spec). Detectada por el humano en el primer run de GitHub Actions.
- **Causa:** el proyecto vitest `unit` de la web no tenía setup; i18n arrancaba con `navigator.language`, que en Node sale del idioma del sistema. En CI (en-US) fallaban `src/i18n/zod.test.ts` (primer caso) y `src/features/schedules/form.test.ts`.
- **Cambios:** `apps/web/src/test/setup-unit.ts` fija `es` y se carga como `setupFiles` del proyecto `unit`. Nota en CONTRIBUTING.md › Tests. Sin cambios en el código de la app.
- **Tests:** web 144 en verde con `LANG=en_US.UTF-8` y con `es_ES.UTF-8`. `pnpm harness --full` en verde.
- **Revisión:** APPROVED (`progress/review_locale-independent-unit-tests.md`), sin hallazgos.
- **Gate 2:** merge aprobado por el humano. Primera feature cerrada con PR en GitHub en vez de merge local.

## 2026-10-22 — #15 in-app-notifications

- **Rama:** `feat/in-app-notifications` (SDD, spec en `specs/in-app-notifications/`, 34 R / 31 T, con 3 exploraciones previas).
- **Gate 1:** el humano pidió 3 cambios:
  - Hora de los recordatorios configurable en Ajustes (`reminderHour`, por defecto 8), con el job ejecutándose cada hora. Se cambió el criterio de aceptación «una vez al día» por «cada hora».
  - Notificaciones borradas en cascada con su vehículo (`vehicle_id`).
  - El job solo lee los últimos 91 días de km más la última lectura.
  
  Además se anotó en `docs/PLAN.md` › «Decisiones aplazadas» la idea de una versión hospedada (SaaS con Postgres en AWS) y cómo mantener el código portable.
- **Cambios:**
  - Tabla `notifications` (`dedupe_key` único, `vehicle_id` con borrado en cascada) y `user_settings.reminder_hour`, migración `0005`.
  - `GET /api/notifications` paginado con offset/limit y `{ items, total, unreadCount }`, `PATCH /api/notifications/:id/read` (200) y `POST /api/notifications/read-all` (204). Lo ajeno responde 404.
  - `apps/api/src/jobs/reminders.job.ts`: `runReminders({ db, now })` invocable aparte y croner con `0 * * * *` arrancado en `server.ts`, desactivable con `REMINDERS_ENABLED`. Deduplica por estado y periodo.
  - Web: campana en la cabecera con contador «9+», popover, sondeo cada 60 s y marcar como leída al navegar. Desplegable «Hora de los recordatorios» en Ajustes. Textos en es/en.
  - Nueva dependencia `croner`.
- **Tests:** shared 29, API 91, web 152. Capturas en claro, oscuro y 375 px. `pnpm harness --full` en verde.
- **Revisión:** APPROVED a la primera (`progress/review_in-app-notifications.md`). Avisos no bloqueantes:
  - Desempate por `id` en vez de `rowid`.
  - Deuda de portabilidad previa (`sql\`rowid\`` en `schedules/repository.ts`, import de `sqlite-core`).
  - Cabecera móvil compactada para que quepa la campana.
  - El rate limit global cuenta también los estáticos de la SPA (problema previo, posible feature aparte).
- **Gate 2:** merge aprobado por el humano.

## 2026-10-23 — #21 rate-limit-api-only

- **Rama:** `feat/rate-limit-api-only` (`sdd: false`, sin spec). Detectada por el implementer en #15; prioritaria sobre #16.
- **Causa:** el `@fastify/rate-limit` global (300 req/min por IP) contaba también las rutas de `@fastify/static` de la SPA, así que unas pocas recargas agotaban el límite.
- **Cambios:** `apps/api/src/app.ts` registra el rate limit con `allowList: (request) => !isApiRequest(request.url)`; el helper `isApiRequest` se reutiliza en el not-found handler. Better Auth sin cambios.
- **Tests:** `apps/api/test/rate-limit.test.ts` (estáticos y fallback sin límite; `/api` responde 429 en la petición 301). API 93, web 152. `pnpm harness --full` en verde.
- **Revisión:** APPROVED (`progress/review_rate-limit-api-only.md`). Avisos no bloqueantes: `startsWith('/api/')` distingue mayúsculas (sin hueco real, el router también) y el test hace ~1.280 `inject`.
- **Gate 2:** merge aprobado por el humano.

## 2026-10-23 — #16 notification-channels

- **Rama:** `feat/notification-channels` (SDD, spec en `specs/notification-channels/`, 39 R / 26 T, con 2 exploraciones previas en `progress/explore_notification-channels_{backend,web}.md`).
- **Gate 1:** aprobado sin cambios al spec. El humano aceptó el riesgo de SSRF (proyecto solo autoalojado) y descartó por ahora la versión hospedada (SaaS): se quitó «Decisiones aplazadas» de `docs/PLAN.md` (commit `docs(plan)` en la rama).
- **Cambios:**
  - Tabla `notification_channels` (config JSON, `enabled`, `last_error`), migración `0006`. Esquemas zod discriminados por tipo en `packages/shared`.
  - `GET|POST /api/notification-channels`, `PATCH|DELETE /:id` y `POST /:id/test` (200 `{ ok, error }`). El token nunca se devuelve (`hasToken`); lo ajeno responde 404.
  - `modules/notification-channels/`: `channels.ts` (ntfy, Gotify, Apprise con clave, webhook; timeout de 10 s, error `HTTP <status>`), `messages.ts` (es/en) y `dispatcher.ts` reutilizable por #17.
  - `runReminders` pasa a async y envía solo las notificaciones nuevas por los canales activos del dueño; un fallo guarda `last_error` sin afectar al resto.
  - Web: sección «Canales de notificación» en Ajustes (añadir, editar, activar, borrar, probar), textos en es/en.
- **Gate 2:** el humano pidió 2 cambios: R38 (rechazar URLs con `usuario:contraseña@`, que el `fetch` de Node no admite) y R39 (test de canal nuevo visible en la lista).
- **Tests:** shared 35, API 121, web 170. Capturas en claro, oscuro y 375 px. `pnpm harness --full` en verde.
- **Revisión:** APPROVED dos veces (`progress/review_notification-channels.md`). Avisos no bloqueantes:
  - Sin test del borrado en cascada de canales al borrar un usuario (está en el SQL).
  - Un fallo de BD al consultar canales hace fallar el job después de guardar las in-app (lo registra croner); se deja así.
  - Envíos secuenciales por canal: con un canal caído, una ejecución puede tardar N × 10 s.
- **Gate 2:** merge aprobado por el humano.

## 2026-10-26 — #17 odometer-nudge

- **Rama:** `feat/odometer-nudge` (SDD, spec en `specs/odometer-nudge/`, 19 R / 19 T).
- **Gate 1:** aprobado sin cambios. El humano confirmó que recrear tablas en migraciones no es problema (desarrollo, sin usuarios reales).
- **Cambios:**
  - `odometerReminderWeekday` admite `null` («No avisar»); migración `0007` recrea `user_settings` copiando sus 8 columnas. Nuevo tipo de notificación `odometer_nudge`.
  - `jobs/odometer-nudge.job.ts`: cada hora en punto, el día de recordatorio del usuario y a partir de su `reminderHour` (en su zona horaria), una notificación con los vehículos activos con ≥ 7 días sin lectura (sin lecturas: desde el alta), enlace a `/odometer`. Dedupe por usuario y semana ISO; enviada por los canales activos. Mismo `REMINDERS_ENABLED`.
  - Web: opción «No avisar» en Ajustes y etiqueta del tipo en la campana y en los canales (es/en).
- **Gate 2:** el humano preguntó por una hora `hh:mm` y la descartó; pidió un icono de información junto a la hora de los recordatorios (R18). Se añadió también junto al día de km (R19). `InfoPopover` sobre `Popover` (funciona al tocar en móvil) y prop `labelAction` en `FormField`.
- **Tests:** shared 35, API 142, web 175. Capturas en claro, oscuro y móvil. `pnpm harness --full` en verde.
- **Revisión:** APPROVED dos veces (`progress/review_odometer-nudge.md`). Avisos no bloqueantes:
  - Ningún test de componente comprueba que Ajustes muestra «No avisar» con un ajuste `null` cargado.
  - `db/schema/settings.ts` usa `default(0)` literal (comentado) en vez de `DEFAULT_USER_SETTINGS`.
- **Gate 2:** merge aprobado por el humano.

## 2026-10-26 — #18 admin-run-jobs

- **Rama:** `feat/admin-run-jobs` (SDD, spec en `specs/admin-run-jobs/`, 11 R / 15 T).
- **Gate 1:** aprobado sin cambios.
- **Cambios:**
  - `POST /api/admin/jobs/:name/run` (`reminders` | `odometer-nudge`) devuelve `{ job, evaluated, created, failed }`. Decorador `requireAdmin`: 401/403 antes del 404 de job desconocido. Ignora `REMINDERS_ENABLED`.
  - `dispatch` devuelve `{ sent, failed }` (`failed` = mensajes canal × notificación); los jobs lo propagan.
  - `jobs/registry.ts` (única lista de jobs), `jobs/cli.ts` + `src/job.ts` (aplica migraciones, JSON por stdout, 1 si el nombre es inválido). Segunda entrada en tsup → `dist/job.js` en la imagen Docker.
  - README: sección «Lanzar los jobs a mano».
- **Tests:** API 153, web 175. Verificación Docker real (`docker exec … node dist/job.js reminders` → JSON, 0; `foo` → 1). `pnpm harness --full` en verde.
- **Revisión:** APPROVED (`progress/review_admin-run-jobs.md`). Avisos no bloqueantes:
  - `runs the odometer-nudge job` podría fallar si cruza la medianoche UTC durante el test.
  - `job-cli.test.ts` no borra sus carpetas temporales `ikrive-cli-*`.
  - Si falla el guardado de `last_error`, esos mensajes no cuentan ni en `sent` ni en `failed`.
- **Gate 2:** merge aprobado por el humano.

## 2026-10-28 — #19 maintenance-calendar

- **Rama:** `feat/maintenance-calendar` (SDD, spec en `specs/maintenance-calendar/`, 31 R / 26 T).
- **Gate 1:** aprobado. El humano pidió aclarar la decisión 1 y aceptó que los textos del evento vivan en `packages/shared` (`CALENDAR_EVENT_TEXTS`, es/en), no en `es.json`/`en.json`, porque la API genera el feed sin i18next (mismo patrón que `notification-channels/messages.ts`).
- **Cambios:**
  - shared: `domain/calendar.ts` con `scheduleCalendarEvent`, `googleCalendarUrl`, `outlookCalendarUrl` y `toICalendar` (RFC 5545: CRLF, escapado, plegado a 75 octetos UTF-8, eventos de día completo, UID `schedule-<id>@ikrive`). Sin `URL`/`TextEncoder` (shared no tiene tipos DOM/Node).
  - api: tabla `calendar_feeds` (`0008_calendar_feeds.sql`), token selector + verificador con `sha256` y `timingSafeEqual` (`lib/tokens.ts`). Gestión en `/api/settings/calendar-feed` (GET/POST activar=regenerar/DELETE) y feed público `GET /api/calendar/<token>.ics` con las reglas con fecha de los vehículos activos del dueño, en su idioma, unidad y zona horaria; 404 uniforme. `lib/logging.ts` oculta el token en los logs.
  - web: `DropdownMenu`, «Añadir al calendario» por regla (Google, Outlook, `.ics`; desactivado con explicación sin fecha) y sección «Calendario» en Ajustes (activar, copiar, regenerar, desactivar).
- **Gate 2:** el humano pidió cerrar tres avisos del reviewer: ocultar el token en los logs, test de zona horaria del feed y escapar cualquier salto de línea en el `.ics`. Tras la re-revisión se cerraron también las rutas no canónicas en la redacción (barras dobles, mayúsculas, codificadas, rachas de 32+ hex) y los caracteres de control en el `.ics` (T22–T26).
- **Tests:** shared 51, API 176, web 183. Capturas en claro, oscuro y móvil. `pnpm harness --full` en verde.
- **Revisión:** APPROVED tres veces (`progress/review_maintenance-calendar.md`). Avisos no bloqueantes que quedan:
  - Un proxy inverso delante de Ikrive registra la URL del feed con el token en sus propios logs (fuera del alcance de la app).
  - Idea a futuro: que los formularios rechacen caracteres de control en títulos y nombres (el `.ics` ya los limpia).
- **Gate 2:** merge aprobado por el humano. Cierra la fase 4.

## 2026-10-29 — #22 fuel-logs-api

- **Rama:** `feat/fuel-logs-api` (SDD, spec en `specs/fuel-logs-api/`, 26 R / 16 T). Primera feature de la fase 5, que se dividió en #22–#25 (repostajes API y web, estadísticas API y web).
- **Gate 1:** aprobado sin cambios. Los repostajes no llevan adjuntos en esta fase; se valorará más adelante.
- **Cambios:**
  - shared: `FUEL_QUANTITY_UNITS` (`l`, `gal`, `kwh`), `fuelQuantityUnit()` (`electric` → kWh; el resto, incluido `plugin_hybrid`, → `volumeUnit` del usuario) y `resolveFuelPrices()` (el precio que falta: total a 2 decimales, precio por unidad a 3; si llegan los dos, se guardan tal cual). Schemas `fuel-logs`.
  - api: tabla `fuel_logs` (`0009_fuel_logs.sql`) y CRUD en `/api/vehicles/:id/fuel-logs`. Cada repostaje tiene una lectura de odómetro `source: 'fuel'` que se crea, edita y borra en la misma transacción. Los km son obligatorios; 409 si van hacia atrás, 400 si la fecha es futura y 404 para recursos ajenos. La unidad no se guarda: se deriva del vehículo.
- **Tests:** shared 60, API 190, web 183. `pnpm harness --full` en verde.
- **Revisión:** APPROVED (`progress/review_fuel-logs-api.md`). Avisos no bloqueantes:
  - Con entradas extremas el precio calculado puede redondearse a 0. Se ha añadido a #24 un criterio para que las estadísticas no dividan entre 0.
  - Un PATCH vacío responde 200 y solo actualiza `updatedAt`, igual que el resto de módulos (aceptado por el humano).
  - Si cambia el `fuelType` del vehículo, los repostajes antiguos se muestran con la otra unidad (aceptado por el humano).
- **Gate 2:** merge aprobado por el humano.

## 2026-10-29 — #23 fuel-logs-web

- **Rama:** `feat/fuel-logs-web` (SDD, spec en `specs/fuel-logs-web/`, 28 R / 17 T). Solo `apps/web`.
- **Gate 1:** aprobado con dos cambios:
  - Un único `.` o `,` en cantidad, total y precio por unidad es siempre decimal; los separadores de miles no se aceptan. La cantidad admite 3 decimales (surtidores con 3), el total 2 y el precio por unidad 3. Las entradas ambiguas o con demasiados decimales dan error y nunca se reinterpretan (R12, R25, R26).
  - Pista en edición: «Vacía un campo para recalcularlo con los otros dos» (R27).
  - El humano confirmó que los km se precarguen con la última lectura aunque no se actualicen.
- **Cambios (web):**
  - Sección «Repostajes» en la ficha (`features/fuel/`): lista ordenada, badge «Lleno»/«Parcial», alta solo en vehículos activos, y borrado con `AlertDialog`.
  - `FuelLogFormDialog` (alta y edición): calcula el tercer valor en vivo; usa `parseFuelNumber` propio (sin tocar `parseDecimal`); `inputMode` numeric/decimal.
  - Errores: 409 → campo de km, 400 → campo de fecha. Las mutaciones invalidan `vehicles.all`.
  - kWh en eléctricos; unidad y moneda según los ajustes del usuario.
- **Gate 2:** el humano pidió que borrar o sobrescribir el valor calculado no lo vuelva a rellenar hasta cambiar otro valor (R28, T17, `useRef userOwned`). Re-revisado y aprobado.
- **Tests:** shared 60, API 190, web 234. Capturas en claro, oscuro y 375 px. `pnpm harness --full` en verde.
- **Revisión:** APPROVED dos veces (`progress/review_fuel-logs-web.md`). Avisos no bloqueantes que quedan:
  - Un repostaje creado por la API con más decimales de los permitidos se redondea o bloquea el guardado al editarlo. No puede pasar desde la UI.
  - Un 0 en cantidad o precio muestra el mensaje genérico de zod.
  - Los errores de `FormField` no están enlazados a su campo: abierta la #26 `form-field-error-a11y` en el backlog.
- El humano preguntó por los impuestos. El cálculo es aritmético (los precios del surtidor ya llevan IVA). Con descuentos en el ticket hay que escribir los tres valores.
- **Gate 2:** merge aprobado por el humano.

## 2026-10-29 — #24 vehicle-stats-api

- **Rama:** `feat/vehicle-stats-api` (SDD, spec en `specs/vehicle-stats-api/`, 22 R / 11 T). `packages/shared` + `apps/api`, sin cambios de BD.
- **Gate 1:** aprobado tras explicar al humano la distancia por mes: se reparte entre lecturas por interpolación lineal por días (la suma cuadra con la distancia recorrida), descartando atribuirla al mes de la lectura.
- **Cambios:**
  - shared: `domain/stats.ts` con funciones puras (distancia recorrida y por mes, tramos de consumo entre llenos, consumo medio ponderado, coste por distancia, coste total de propiedad, gasto por categoría y por mes, `roundMoney`, `computeVehicleStats`) y `schemas/stats.ts` (`vehicleStatsSchema`). `averageDistancePerMonth()` en `domain/odometer.ts`; `byDateThenValue` pasa a exportarse.
  - api: módulo `stats` con `GET /api/vehicles/:id/stats` (sin repositorio propio, reutiliza los de vehículos, repostajes y mantenimiento). `maintenance.spending()` usa `roundMoney`, así que cuadra con `spending.maintenance`.
- **Tests:** shared 75, API 194, web 234. `pnpm harness --full` en verde.
- **Revisión:** APPROVED (`progress/review_vehicle-stats-api.md`). Avisos no bloqueantes: `quantity` de cada tramo redondeada a 3 decimales en la salida; `byDateThenValue` público; `missedPrevious` en el lleno de apertura no invalida el tramo.
- **Pendiente menor:** biome avisa (warning, no error) de una constante `DAY_MS` sin usar en `packages/shared/src/domain/stats.ts`. Quitarla en #25.
- **Gate 2:** el humano preguntó por la «Media anual» de la ficha (60 833 km/año con 5 000 km en 30 días de datos de prueba); se mantiene el umbral de 30 días. Añadida la #27 `mobile-nav-menu` (menú de hamburguesa en móvil) después de #25. Merge aprobado por el humano.

## 2026-10-31 — #25 vehicle-stats-web

- **Rama:** `feat/vehicle-stats-web` (SDD, spec en `specs/vehicle-stats-web/`, 18 R / 12 T). `apps/web` + limpieza en `packages/shared`. Exploración en `progress/explore_vehicle-stats-web_*.md`.
- **Gate 1:** aprobado sin cambios (sección tras Mantenimientos, solo consumo por 100, categorías en barras horizontales).
- **Cambios:**
  - shared: borrada la constante `DAY_MS` sin usar de `domain/stats.ts` (warning de biome pendiente de #24).
  - web: dependencias `recharts` 3.10 y `react-is` 19 (peer explícito). `features/stats/`: `statsQuery` (clave bajo `vehicles.all`, la refrescan las mutaciones existentes), `createStatsFormatters` + `useStatsFormat`, `ChartFigure` con cuatro gráficos (km por mes, consumo por tramo, gasto mensual apilado, gasto por categoría) y `VehicleStatsSection` con cinco cifras (km/año, consumo medio, coste por distancia de combustible y de mantenimiento, coste total con desglose). «—» y explicación cuando falta un dato; estado vacío por gráfico. Textos `stats.*` en es/en. Precarga en el loader de la ficha.
- **Tests:** shared 75, API 194, web 244. Capturas en claro, oscuro, 1024 y 375 px. `pnpm harness --full` en verde.
- **Revisión:** APPROVED (`progress/review_vehicle-stats-web.md`). Avisos no bloqueantes:
  - Punto en `endDate` y barras apiladas no se afirman en tests (jsdom no da layout); se cubren con código y capturas.
  - `format.test.ts` solo detecta regresiones de zona horaria al oeste de UTC; valorar fijar `TZ` en el proyecto `unit`.
  - Barras de mantenimiento con poco contraste en modo oscuro.
  - Recharts suma ~100 kB gzip a la página del vehículo.
- **Gate 2:** el humano preguntó por qué no se testean los gráficos; se explicó la limitación de jsdom y que los E2E con Playwright (fase 7) son el sitio natural para cubrirlo. Merge aprobado por el humano.

## 2026-10-31 — #26 form-field-error-a11y

- **Rama:** `feat/form-field-error-a11y` (`sdd: false`, sin spec; guía: `acceptance`). Solo `apps/web`.
- **Cambios:** `FormField` da un id estable (`useId`) a su error y publica un contexto (`form-field-context.ts`). `Input`, `Select` y `Textarea` lo leen con `useFormFieldControl`: si su `id` coincide con el del campo y hay error, añaden el id del error a su `aria-describedby` (conservando pistas previas) y ponen `aria-invalid`. Ningún formulario modificado.
- **Tests:** web 251 (7 nuevos en `form-field.test.tsx` con `toHaveAccessibleDescription`). `pnpm harness --full` en verde.
- **Revisión:** APPROVED (`progress/review_form-field-error-a11y.md`). Avisos no bloqueantes:
  - El enlace depende de la convención «control `ui/` con el mismo `id` que el `FormField`»; si se rompe, falla en silencio.
  - `odometer-form.tsx` no usa `FormField` y sus errores siguen sin enlazar.
- **Gate 2:** merge aprobado por el humano sin cambios.

## 2026-10-31 — #27 mobile-nav-menu

- **Rama:** `feat/mobile-nav-menu` (SDD, spec en `specs/mobile-nav-menu/`, 14 R / 11 T). Solo `apps/web`.
- **Gate 1:** aprobado sin cambios (panel lateral derecho, `Dialog` de Radix, viewport decidido en JS con `matchMedia`, botón X extra, `useLogout` extraído).
- **Cambios:** `useMediaQuery` + `DESKTOP_QUERY` (48rem = `md`), `ui/sheet.tsx` sobre el `Dialog` de Radix (`overlayClassName` exportado), `useLogout()` y `navItems` extraídos de `_app.tsx`, `features/navigation/app-navigation.tsx` (`Sidebar` sin cambios visuales + `MobileHeader`/`MobileNavMenu` que se cierra al elegir, Escape, clic fuera y en `onBeforeNavigate`). Textos `nav.openMenu`, `nav.closeMenu`, `nav.menu` en es/en. Helper `mockMediaQuery` en `test/render.tsx`; dos tests de settings lo usan (montan el `routeTree` completo).
- **Tests:** shared 75, API 194, web 260 (9 nuevos). Capturas de escritorio antes/después idénticas píxel a píxel (claro y oscuro) y de móvil 375 px con el panel cerrado y abierto. `pnpm harness --full` en verde.
- **Revisión:** APPROVED (`progress/review_mobile-nav-menu.md`). Avisos no bloqueantes: capturas en scratchpad efímero; `authClient` captura `fetch` al importarse y puede saltarse `mockApi` (un `sign-out` sin cookie llegó a `localhost:3000` durante la depuración, sin efecto); ruido de `scrollTo()` de jsdom; variantes sin `md:` inertes en `Sidebar`.
- **Gate 2:** el humano pidió propuesta para los avisos 2 y 3; se añade la #28 `web-test-isolation` (`sdd: false`). Merge aprobado por el humano.

## 2026-10-31 — #28 web-test-isolation

- **Rama:** `feat/web-test-isolation` (`sdd: false`, sin spec; guía: `acceptance` y avisos 2 y 3 de `progress/review_mobile-nav-menu.md`). Solo tests de `apps/web` + `CONTRIBUTING.md`.
- **Cambios:** `src/test/setup.ts` instala por asignación directa (sobrevive a `vi.unstubAllGlobals()`) un `fetch` diferido antes de importar la app, que delega en el stub vigente o rechaza con `Unmocked request: <MÉTODO> <URL>`; el `afterEach` falla el test si hubo peticiones sin mock. `window.scrollTo` anulado (los 32 avisos venían de la scroll restoration de TanStack Router). `mockApi` ya no responde 404 a rutas no declaradas. Registro en `src/test/unmocked-requests.ts`. Quitado el `vi.hoisted` de `app-navigation.test.tsx`. Seis tests de mantenimiento y odómetro declaran sus peticiones incidentales (`GET /config`, `/schedules`, `/settings`) sin tocar asertos.
- **Tests:** shared 75, API 194, web 263 (3 nuevos en `setup.test.tsx`). 0 avisos `scrollTo`. `pnpm harness --full` en verde.
- **Revisión:** APPROVED (`progress/review_web-test-isolation.md`). Avisos no bloqueantes: hay que declarar todas las peticiones en `mockApi`; una petición sin mock tras el último test de un fichero se bloquea pero no falla nada.
- **Gate 2:** el humano preguntó si los avisos suponían un problema; se verificó en código que no (riesgo teórico adicional: una petición tardía de un test se atribuiría al siguiente). Merge aprobado por el humano.

## 2026-11-01 — #29 sale-report-pdf

- **Rama:** `feat/sale-report-pdf` (SDD, spec en `specs/sale-report-pdf/`, 25 R / 14 T). Primera feature de la fase 6; antes se partió la fase en #29–#33 y se anotaron las decisiones en `docs/PLAN.md`. Exploración en `progress/explore_sale-report-pdf_{data,infra}.md`.
- **Gate 1:** aprobado sin cambios (nº y gasto solo de mantenimientos incluidos, km y gráfico con todas las lecturas; tabla ascendente; portada como cabecera; gráfico de línea del odómetro; booleanos `true/false/1/0`; rate limit 10/min; nombre `ikrive-<slug>-<fecha>.pdf`).
- **Cambios:** `buildSaleReport` + `SALE_REPORT_TEXTS` (es/en) + `saleReportFileName` en `packages/shared/src/domain/sale-report.ts` y `saleReportQuerySchema` (`z.stringbool`) en `schemas/reports.ts`. Módulo `apps/api/src/modules/reports/` con `generate(ownerId, vehicleId, options)` (frontera para #30 y #32), ruta `GET /api/vehicles/:id/report.pdf` y documento react-pdf con fuentes `.woff` de `@fontsource`. `contentDisposition` movido a `apps/api/src/lib/http.ts`. `jsx: react-jsx` en la API, sin lib DOM. Dockerfile sin cambios.
- **Tests:** shared 92, API 203, web 263 (17 nuevos en shared, 9 de integración con `unpdf`). Capturas del PDF en es/en, con datos ocultos y vacío; build de Docker e informe descargado desde el contenedor. `pnpm harness --full` en verde.
- **Revisión:** APPROVED (`progress/review_sale-report-pdf.md`). Avisos no bloqueantes: el texto libre (alias, versión, títulos) puede contener datos ocultos; el eyebrow espaciado se extrae como `I N F O R M E …`; rate limit por IP saltable con `X-Forwarded-For` sin proxy (ya pasaba con el global); `/app/dist/dist` duplicado en la imagen (previo).
- **Gate 2:** el humano aceptó avisar del texto libre en #31 (criterio añadido) y pidió prohibir a reviewer y spec-author escribir en `apps/`, `packages/` y `docker/` también por shell (el reviewer creó y borró un test temporal). Merge aprobado por el humano.

## 2026-11-01 — #30 sale-report-invoices

- **Rama:** `feat/sale-report-invoices` (SDD, spec en `specs/sale-report-invoices/`, 20 R / 15 T). Solo `apps/api` y `packages/shared`.
- **Gate 1:** el humano preguntó por los riesgos; se añadió un tope total de anexos por informe `REPORT_MAX_ANNEX_MB` (100 por defecto): se mide `attachments.size` antes de cargar, se salta el que no cabe y se sigue con los siguientes, aviso propio y `warn`, siempre 200. Resto aprobado (referencias en columna «Anexos» + lista, sin páginas separadoras; nombre original del fichero; cualquier ilegible se omite con aviso; imágenes ≤ 2000 px sin ampliar, WebP→PNG; pie «n / total» solo del informe).
- **Cambios:** `includeInvoices` en `saleReportQuerySchema`; modelo con referencias `A<n>`, columna `annexes` y sección `annexes` (avisos `unreadable`/`size_limit`, es/en). API: `pdf-lib`, `toAnnexImage` (sharp), `pdf/annexes.ts` (`loadAnnex`, `fitImage`, `appendAnnexes`), servicio con adjuntos, `storage`, tope y `request.log`; anexado en el orden de `report.annexes.items`. Documentado en README y `.env.example`.
- **Tests:** shared 98, API 215, web 263. `pnpm harness --full` en verde.
- **Revisión:** CHANGES_REQUESTED (R18 sin test que distinguiera tope total de tope por fichero) → APPROVED (`progress/review_sale-report-invoices.md`). Avisos no bloqueantes: R16 «no leer» sin comprobación vía `warn`; orden interno de páginas de un mismo PDF no discriminado; `toAnnexImage` sin test unitario; el orden de anexado no tiene test discriminante (con el repo real ambos órdenes coinciden).
- **Gate 2:** el humano pidió cubrir avisos: anexar por `report.annexes.items` (Map por id), tests de PDF sin páginas / imagen que no decodifica y de ilegible que no consume tope. Re-revisión APPROVED. Merge aprobado por el humano.

## 2026-11-02 — #31 sale-report-web

- **Rama:** `feat/sale-report-web` (SDD, spec en `specs/sale-report-web/`, 18 R / 15 T). Solo `apps/web`.
- **Gate 1:** aprobado sin cambios (botón junto a «Editar» en cualquier estado; `fetch` + blob para tener carga y errores; solo se envían las opciones marcadas; sin toast de éxito; un único toast de error, incluido 429; casillas desmarcadas en cada apertura; nombre de respaldo con `saleReportFileName`).
- **Cambios:** `api.download` + `toApiError` en `lib/api-client.ts`; `downloadBlob` en `lib/download.ts` (también lo usa `downloadIcs`); `features/reports/` con `saleReportPath`, `fileNameFromContentDisposition`, `hidesAnything`, `useDownloadSaleReport` y `SaleReportDialog` (casillas de matrícula/VIN condicionales, avisos de texto libre y de facturas en región `aria-live`, «Generando…», toast de error). Botón en la ficha del vehículo; textos `saleReport.*` en es/en. `mockApi` admite `headers` y cuerpo `Blob`.
- **Tests:** shared 98, API 215, web 277. Capturas en claro/oscuro/móvil. `pnpm harness --full` en verde.
- **Revisión:** APPROVED (`progress/review_sale-report-web.md`). Avisos no bloqueantes: `lib/api-client.ts` importa de `features/reports` (sin ciclo, ya había precedente); R1 sin test de ruta; capturas en scratchpad efímero.
- **Gate 2:** el humano pidió aplicar los avisos 1 (quitar `empty:hidden` de la región `aria-live`, ahora `not-empty:mt-5`) y 2 (`onError` en el `useMutation` para que el toast salga aunque se cierre el diálogo). Re-revisión APPROVED. Merge aprobado por el humano.

## 2026-11-02 — #32 report-shares-api

- **Rama:** `feat/report-shares-api` (SDD, spec en `specs/report-shares-api/`, 21 R / 11 T). Solo `apps/api` y `packages/shared`. Exploración en `progress/explore_report-shares-api_patterns.md`.
- **Gate 1:** aprobado sin cambios (enlaces de vehículos archivados/vendidos siguen sirviendo y se pueden crear; cuerpo con booleanos JSON y `expiresInDays` 1–90, 30 por defecto; ruta pública `GET /api/public/reports/:token` con rate limit propio de 10/min por IP que cuenta los 404; estado derivado revoked > expired > active, caducidad = ahora + días × 24 h; revocar idempotente conservando la primera fecha; sin límite ni purga de enlaces; R21 extra: el token no aparece en logs, ya cubierto por `redactUrl`).
- **Cambios:** shared: `REPORT_SHARE_STATUSES`, `schemas/report-shares.ts` y `reportShareStatus` en `domain/report-shares.ts`. API: tabla `report_shares` (selector único + hash SHA-256 del verificador, opciones, `expires_at`, `revoked_at`, cascada con el vehículo) con migración `0010_report_shares.sql`; módulo `modules/report-shares/` reutilizando `lib/tokens.ts` y `reports.generate`; rutas autenticadas `POST/GET/DELETE /api/vehicles/:id/report-shares` y pública con `inline`, `private, no-store`, `noindex`, `nosniff`.
- **Tests:** shared 105, API 234, web 277. `pnpm harness --full` en verde.
- **Revisión:** APPROVED (`progress/review_report-shares-api.md`). Avisos no bloqueantes: `hidePrices` sin test sobre el PDF público; el rate limit cuenta los 404 (decisión de Gate 1).
- **Gate 2:** el humano pidió añadir el test de `hidePrices` (`hides the prices`, pasó sin cambiar código de producción) y mantener el rate limit. Se explicó cómo probarlo en red local con `BASE_URL` = IP del PC. Re-revisión APPROVED. Merge aprobado por el humano.

## 2026-11-02 — #33 report-shares-web

- **Rama:** `feat/report-shares-web` (SDD, spec en `specs/report-shares-web/`, 22 R / 15 T). `apps/web`, con un cambio pequeño en `apps/api` y `packages/shared`. Cierra la fase 6.
- **Gate 1:** el humano pidió ampliar la detección de hosts locales (además de loopback, privadas, link-local y ULA: `100.64.0.0/10`, `.local`, `.lan`, `.home.arpa`, `.internal` y nombres sin punto; `*.ts.net` sigue siendo público) y que el leader dé siempre recomendaciones sobre decisiones discutibles y riesgos en Gate 1 (añadido a `leader.md`). Resto aprobado (indicador `localBaseUrl` en vez de la URL; se puede crear con `BASE_URL` local; URL visible solo hasta cerrar el diálogo; sin toasts de éxito; caducados y revocados siguen en la lista).
- **Cambios:** shared: `localBaseUrl` en `clientConfigSchema`. API: `lib/base-url.ts` (`isLocalHost`, `isLocalBaseUrl`) y `GET /api/config` lo devuelve, calculado al arrancar. Web: `components/copy-url-field.tsx` extraído del feed iCal (`calendarFeed.copy` → `common.copy`), queries y mutaciones de report shares, `ReportSharesSection` (caducidad 7/30/90, crear, copiar, aviso local, listado con estados, revocar con `AlertDialog`) en el diálogo del informe, `features/reports/warning.tsx`, textos `reportShares.*` en es/en. `docs/PLAN.md`: fase 6 ✅.
- **Tests:** shared 105, API 238, web 289. Capturas en claro/oscuro/móvil. `pnpm harness --full` en verde.
- **Revisión:** APPROVED (`progress/review_report-shares-web.md`). Avisos no bloqueantes: Enter en el campo de la URL descarga el PDF (envío implícito, inocuo); tras un segundo intento fallido sigue la URL del primero; `::` no se trata como local; capturas en scratchpad efímero.
- **Gate 2:** el humano pidió mover «Descargar»/«Cancelar» al final del diálogo, tras la sección de enlaces. Re-revisión APPROVED. Resto de avisos aceptados. Merge aprobado por el humano.

## 2026-11-02 — #34 data-export-api

- **Rama:** `feat/data-export-api` (SDD, spec en `specs/data-export-api/`, 19 R / 13 T). `apps/api` y `packages/shared`. Primera feature de la fase 7, que se repartió en #34–#42 (export, import y web; usuarios para el admin API y web; PWA; imagen Docker; E2E; docs y release v0.1.0).
- **Gate 1:** aprobado sin cambios (export por usuario; se incluyen las fotos de los vehículos; canales sin token con `hasToken`; un fichero perdido en disco se omite con `warn`; sin perfil, notificaciones in-app, enlaces públicos ni feed iCal; `yazl` frente a `archiver`/`fflate`).
- **Cambios:** shared: `dataExportSchema` versionado (`DATA_EXPORT_FORMAT_VERSION = 1`) con `superRefine` de integridad (ids únicos, referencias en el mismo vehículo, rutas de fichero generadas) y helpers `attachmentExportPath`/`photoExportPath`. API: `storage.exists`, módulo `modules/data-export/` (repositorio por `ownerId`, servicio que construye el documento anidado por vehículo y un zip en streaming con `yazl` abriendo un fichero a la vez) y `GET /api/me/export` (`attachment`, `no-store`). Dependencias: `yazl`, y `yauzl` solo para los tests.
- **Tests:** shared 111, API 251, web 289. `pnpm harness --full` en verde y `docker build` OK.
- **Revisión:** CHANGES_REQUESTED (un error de lectura de un fichero a mitad del zip tumbaba el proceso por `'error'` sin manejar) → APPROVED (`progress/review_data-export-api.md`), verificado contra el servidor real con ficheros ilegibles y descargas abortadas. Avisos no bloqueantes: el esquema no limita la longitud de las cadenas, así que el import (#35) debe acotar el tamaño del zip y de `data.json`.
- **Gate 2:** merge aprobado por el humano sin cambios.

## 2026-11-03 — #35 data-import-api

- **Rama:** `feat/data-import-api` (SDD, spec en `specs/data-import-api/`, 27 R / 16 T). `apps/api` y `packages/shared`.
- **Gate 1:** aprobado sin cambios (añade, no sobrescribe; 409 si `currency`/`distanceUnit`/`volumeUnit` no coinciden y el resto de ajustes se ignoran; canales con token omitidos y contados en `skipped`, los demás revalidados con el esquema estricto; fotos guardadas tal cual si son WebP decodificable; `IMPORT_MAX_MB` = 1024, `data.json` ≤ 32 MiB, ≤ 50 000 entradas; 413 tamaños, 415 tipos, 400 el resto; sin revalidar reglas de negocio; el import no crea notificaciones).
- **Cambios:** shared: `dataImportSummarySchema`. API: `IMPORT_MAX_MB`, `PayloadTooLargeError` y `errors[]` en `AppError`/problem; `lib/zip-reader.ts` sobre `yauzl` (límites declarados, `validateEntrySizes`, entradas cifradas/duplicadas/inseguras → 400); módulo `modules/data-import/` (zip a `DATA_DIR/tmp`, validación de tipo real con `detectAttachmentType`/`assertDecodableImage`, ficheros primero y una sola transacción con ids nuevos y remapeo, borrado compensatorio) y `POST /api/me/import`. `yauzl` pasa a dependencia. README y `.env.example`.
- **Tests:** shared 111, API 277, web 289. `pnpm harness --full` en verde.
- **Revisión:** 3 vueltas (la tercera autorizada por el humano). V1: multipart sin boundary de cierre colgaba la petición y dejaba el zip temporal abierto; faltaban tests de R18 y R25. V2: cuelgue resuelto, pero en varios chunks daba 500. V3: errores del origen → 400, de escritura → 500. APPROVED (`progress/review_data-import-api.md`), verificado contra el servidor real. Avisos: la subida de adjuntos/foto responde 500 a un multipart incompleto (→ #43); flake puntual en `use-user-locale.test.tsx`; el test del 500 por escritura no vale como root.
- **Gate 2:** el humano pidió añadir #43 `truncated-upload-400` (`sdd: false`) al backlog. Merge aprobado.

## 2026-11-03 — #36 data-portability-web

- **Rama:** `feat/data-portability-web` (SDD, spec en `specs/data-portability-web/`, 11 R / 9 T). Solo `apps/web`; sin cambios en API, shared ni BD.
- **Gate 1:** aprobado sin cambios (export como enlace nativo `<a download>` sin toast si falla; error traducido por estado con el `detail` de la API como descripción; el diálogo avisa de que moneda y unidades deben coincidir; sin límite de tamaño en el cliente; sección al final de Ajustes).
- **Cambios:** `features/data-portability/` (`import.ts` con `IMPORT_ACCEPT` e `importErrorKey`, `queries.ts` con `EXPORT_URL` y `useImportData` que invalida `vehicles.all` y `notificationChannels.all`, `DataPortabilitySection` con enlace de export, input oculto, `AlertDialog` de confirmación, «Importando…», resumen de 8 contadores y aviso de canales omitidos), montada en `routes/_app/settings.tsx`; textos `dataPortability.*` en es/en.
- **Tests:** shared 111, API 277, web 299. Capturas claro/oscuro/móvil con un import real. `pnpm harness --full` en verde.
- **Revisión:** APPROVED a la primera (`progress/review_data-portability-web.md`). Avisos no bloqueantes: `mutateAsync` + `try/catch` para que el toast salga aunque se salga de Ajustes; el toast de éxito espera al refetch; el test de R5 inspecciona el `FormData` (limitación de jsdom); capturas en scratchpad efímero.
- **Gate 2:** el humano preguntó por los duplicados al importar dos veces el mismo zip; se añadió #44 `import-dedupe` (`sdd: true`) al backlog. Merge aprobado.

## 2026-11-03 — #37 admin-users-api

- **Rama:** `feat/admin-users-api` (SDD, spec en `specs/admin-users-api/`, 22 R / 16 T). `apps/api` y `packages/shared`. Exploraciones previas en `progress/explore_admin-users-api_{auth,data}.md` (los agentes Explore son de solo lectura; el leader guardó sus informes).
- **Gate 1:** aprobado sin cambios (endpoints propios frente al plugin `admin` de Better Auth; 409 para último admin y uno mismo; solo cuentan los admins activos; un admin puede degradarse si queda otro; cambiar rol no cierra sesiones; sin paginación; acciones idempotentes; login de un desactivado → 403 de Better Auth). El humano pidió añadir a #38 el mensaje específico de cuenta desactivada en el login.
- **Cambios:** shared: `USER_STATUSES`, `ADMIN_USER_LOCK_REASONS`, `adminUserLocks` (función pura) y esquemas `adminUser*`. API: columna `user.disabled_at` (migración 0011), hook `session.create.before` que bloquea a los desactivados, módulo `modules/admin-users/` (`GET /api/admin/users`, `PUT /:id/role`, `POST /:id/disable`, `POST /:id/enable`, `DELETE /:id`; borrado con cascada FK y ficheros después con log si fallan). `docs/PLAN.md`: `user.disabled_at` en el modelo de datos.
- **Tests:** shared 117, API 293, web 299. `pnpm harness --full` en verde.
- **Revisión:** APPROVED a la primera (`progress/review_admin-users-api.md`). Desviación aceptada: `requireAdmin` en `preValidation` (no `preHandler`) para que 401/403 precedan al 400. Seguridad revisada sin bypass. Avisos: el test de R11 no afirma todas las tablas en cascada; JSON mal formado de un no admin → 400; desactivar no corta feed ni enlaces públicos (→ #45); revisar si se activa `cookieCache`.
- **Gate 2:** el humano preguntó qué cuenta es la admin de la instancia local y pidió añadir #45 `disabled-user-public-access`. En la pasada final apareció un flake en web (`settings-page.test.tsx › saves the reminder hour`, `findByLabelText` sin encontrar la etiqueta, 1 de 5 ejecuciones), ajeno a esta feature. Merge aprobado.

## 2026-11-04 — #38 admin-users-web

- **Rama:** `feat/admin-users-web` (SDD, spec en `specs/admin-users-web/`, 25 R / 15 T). Solo `apps/web`; sin cambios en API, shared ni BD.
- **Gate 1:** el leader propuso y el humano aprobó pedir confirmación al quitarse uno mismo el rol de admin (R24, R25). Resto sin cambios: ruta `/admin/users` con la entrada «Usuarios» antes de Ajustes; desactivar/reactivar sin confirmación y borrar con `alertdialog`; 403 en el sign-in = cuenta desactivada, sin cambios en la API; 409 con mensaje traducido propio que recarga la lista; se muestra el nº de vehículos.
- **Cambios:** `features/admin-users/` (`adminUsersQuery` y cuatro mutaciones que invalidan la lista en `onSettled`, `adminUserErrorKey`, `UserRow` con selector de rol controlado, `DemoteSelfDialog`, `DeleteUserDialog` y motivos de bloqueo con `aria-describedby`, `AdminUsersPage`); ruta `/_app/admin/users` con guarda `beforeLoad`; `navItemsFor(role)` con entrada `adminOnly`; `signInErrorKey` en el login; textos `nav.users`, `auth.accountDisabled` y `adminUsers.*` en es/en.
- **Tests:** shared 117, API 293, web 322. Capturas claro/oscuro/móvil (scratchpad efímero).
- **Revisión:** APPROVED a la primera (`progress/review_admin-users-web.md`). Avisos: `login-page.test.tsx` usa `findBy*` tras cargar el chunk perezoso de `/login` y un import estático de `@/lib/auth-client` que debería ir a `src/test/setup.ts` (ambos anotados en #46); `meQuery` en caché 5 min tras ser degradado por otro admin (aceptado en el spec).
- **Gate 2:** `pnpm harness --full` intermitente por el flake de #46 (`settings-page.test.tsx`, también `use-user-locale.test.tsx`), ajeno a esta feature y sin agravarlo según las mediciones del reviewer; el humano decidió no bloquear #38 y abordar #46 a continuación. Pasada final en verde. Merge aprobado.

## 2026-11-04 — #46 settings-test-flake

- **Rama:** `feat/settings-test-flake` (`sdd: false`, sin spec ni Gate 1). Solo tests de `apps/web` y una línea de `CONTRIBUTING.md`.
- **Orden:** el humano pidió hacer #46 antes que #39 `pwa`. El spec de `pwa` (ya en `spec_ready`) se guardó en `git stash` mientras tanto.
- **Causa:** `autoCodeSplitting` hace que el primer test de cada fichero importe en frío el chunk de la ruta (0,85–1,8 s con la suite cargada), dentro del 1 s del primer `findBy*`.
- **Cambios:** nuevo helper `src/test/render-app.tsx` › `renderApp(path)`, que precarga los chunks de todas las rutas antes de renderizar; `setup.ts` importa `@/lib/auth-client` tras el shim de `fetch`. Migrados `settings-page`, `use-user-locale`, `login-page` y `admin-route`. No se ha subido ningún timeout.
- **Tests:** shared 117, API 293, web 322. 20/20 ejecuciones seguidas de la suite web con los tests de la API en paralelo (y 6/6 más del reviewer). `pnpm harness --full` en verde.
- **Revisión:** APPROVED a la primera (`progress/review_settings-test-flake.md`). Avisos: un `vi.mock('@/lib/auth-client')` futuro podría no aplicarse porque `setup.ts` ya lo importa; la precarga del primer test de cada fichero crece con el árbol de rutas.
- **Gate 2:** merge aprobado.

## 2026-11-04 — #39 pwa

- **Rama:** `feat/pwa` (SDD, spec en `specs/pwa/`, 17 R / 18 T). `apps/web` y una cabecera en `apps/api`; sin cambios en BD, shared ni Docker.
- **Gate 1:** aprobado con un cambio: en la T17, `playwright-core` vía `pnpm dlx`, sin añadirlo como dependencia (eso es de #41). Resto sin cambios: `generateSW` + `registerType: 'prompt'`; `/api/` en `navigateFallbackDenylist` y sin `runtimeCaching`; icono maskable nuevo; `no-cache` explícito; manifest sin `lang` ni `description`. El spec esperó en `git stash` mientras se hacía #46.
- **Cambios:** `features/pwa/` (`config.ts` con manifest y Workbox, controlador del SW inyectable sobre `virtual:pwa-register`, `UpdatePrompt`, `OfflineBanner` con `useOnlineStatus`, `isNetworkError`, `RouteErrorScreen` como `errorComponent` de `_app`, `login`, `register` y por defecto); `icon-maskable-512.png`; textos `pwa.*` en es/en; API: `setHeaders` con `no-cache` en `sw.js`, `manifest.webmanifest` e `index.html`. Dependencias: `vite-plugin-pwa` (dev) y `workbox-window` (necesaria con pnpm estricto).
- **Tests:** shared 117, API 296, web 342. Verificación manual repetida tras un reinicio del PC: build, `curl` de cabeceras, Chrome con `playwright-core` (SW activo, recarga offline, PDF público no cacheado, aviso de versión) en claro, oscuro y móvil. `pnpm harness --full` en verde.
- **Revisión:** APPROVED a la primera (`progress/review_pwa.md`). Avisos: `OfflineBanner` en el flujo y no `fixed` (se pierde al hacer scroll y ~37 px de scroll de más en escritorio offline); el plugin añade `lang: "en"` al manifest; cualquier `TypeError` cuenta como error de red; sin test de `/register` offline; `UpdatePrompt` tapa el final del contenido en móvil.
- **Gate 2:** el humano probó la PWA en local y aprobó el PR.

## 2026-11-05 — #40 docker-image-slim

- **Rama:** `feat/docker-image-slim` (SDD, spec en `specs/docker-image-slim/`, 21 R / 13 T). `apps/api` (build y fuentes del PDF), `docker/` y CI; sin cambios en BD, HTTP, shared ni web.
- **Gate 1:** aprobado sin cambios: runtime `node:24-alpine` (la base bookworm-slim ya pesaba 249 MB); tamaño = suma de capas de `docker history`, umbral 250 000 000 B; `pdfkit` como tercer externo (no se puede empaquetar por sus `require('#standard-fonts/…')`) fijado a 0.20.1; sin sourcemaps en la imagen; CI construye y prueba también arm64.
- **Cambios:** `tsup.config.ts` (bundle completo salvo `RUNTIME_EXTERNALS` = `better-sqlite3`, `sharp`, `pdfkit`; banner `createRequire`; `dist/package.json`, `dist/migrations`, `dist/fonts`); `font-files.ts` + `resolveReportFont` (bundle → `@fontsource`); Dockerfile en tres etapas (`build` en `$BUILDPLATFORM`, `natives` con `npm install` + `prune-runtime.mjs`, `runtime` alpine con `USER node`); `docker/image-size.mjs` y `docker/smoke.mjs`; job `docker` de CI con amd64 + arm64, tamaño, smoke, `job.js reminders`, uid 1000 y nativos en arm64.
- **Resultado:** amd64 233,4 MB y arm64 228,0 MB (antes ~670 MB).
- **Tests:** API 303, web 342, shared en verde. `pnpm harness --full` en verde. Verificación local de las dos arquitecturas (arm64 con QEMU/binfmt registrado en el host por decisión del humano).
- **Revisión:** CHANGES_REQUESTED en la primera vuelta (arm64 sin construir ni medir: R9, R10, R19, R20). En la vuelta 1 el implementer anotó arm64 = 176,0 MB; el leader lo volvió a medir (228,0 MB) y corrigió la cifra. APPROVED en la segunda (`progress/review_docker-image-slim.md`). Avisos: margen de ~17 MB (amd64) y ~22 MB (arm64), con 3,7 MB de `pdfkit/.yarn` aún podables; el job `docker` no se había ejecutado aún en GitHub Actions; la caché `gha` con scope no se comparte con `release.yml`; `PLAN.md` dice todavía que no hay remoto (ajeno).
- **Gate 2:** el humano preguntó cómo probarlo con `docker compose up -d` (respuesta: `--build`, sin subir nada). Merge aprobado.

## 2026-11-05 — #41 e2e-playwright

- **Rama:** `feat/e2e-playwright` (SDD, spec en `specs/e2e-playwright/`, 17 R / 16 T). Nuevo paquete de workspace `e2e/`, script raíz `test:e2e`, job `e2e` de CI, una línea en el Dockerfile y docs; sin cambios en `apps/` ni `packages/`.
- **Gate 1:** aprobado sin cambios: `test:e2e` hace `pnpm build` siempre; paquete `e2e/` en la raíz (+ `COPY e2e/package.json` en el Dockerfile); una IP por test con `x-forwarded-for` para no chocar con los rate limits; sesión de admin compartida creada por el proyecto `setup`; `retries: 0`, solo Chromium, service workers bloqueados.
- **Cambios:** `e2e/server.mjs` (build de producción con `DATA_DIR` temporal que se borra al salir); `playwright.config.ts` (proyectos `setup`, `chromium` y `data-portability`; trazas y capturas solo si falla); `tests/fixtures.ts` (`t()` sobre `es.json`, IP por test, `uniquePlate`, `createVehicle`); 6 tests (registro admin, vehículo, mantenimiento con adjunto, repostajes + consumo, PDF de venta, export/import); guard Vitest `no-fixed-waits`; job `e2e` con artefactos 14 días si falla.
- **Desviaciones aceptadas:** proyecto `data-portability` con `workers: 1` (dos imports en paralelo se duplican entre sí) y `.first()` en `vehicles.spec.ts`; `gracefulShutdown: SIGTERM` para que se borre el `DATA_DIR`.
- **Tests:** E2E 6/6, por spec en solitario y `--repeat-each=3` (16/16). `pnpm harness --full` en verde (shared 117, API 303, web 342, e2e 1). Imagen 233,4 MB.
- **Revisión:** APPROVED a la primera (`progress/review_e2e-playwright.md`). Avisos: `.dockerignore` no excluye los artefactos de `e2e/` ni `e2e/.auth/` (→ backlog #47 `dockerignore-e2e-artifacts`); `fuel-stats` depende del DOM de la tarjeta y del literal `6 L/100 km`; `e2e/package.json` solo declara Playwright. El aviso del import en paralelo se añadió a `CONTRIBUTING.md` en el cierre.
- **Gate 2:** merge aprobado.

## 2026-11-05 — #47 dockerignore-e2e-artifacts

- **Rama:** `feat/dockerignore-e2e-artifacts` (`sdd: false`, sin spec ni Gate 1). Solo `.dockerignore`. Surgió del aviso del reviewer en Gate 2 de #41.
- **Cambios:** patrones `**/` para `coverage`, `*.tsbuildinfo`, `.tanstack`, `data`, `*.db`, `*.db-*`, `.env`, `.env.local`, `.env.*.local`, `playwright-report` y `test-results`; `e2e/.auth`. Hallazgo: antes entraban en el contexto la BD de desarrollo y sus uploads (`apps/api/data/`), porque `data` solo cubría la raíz. `.env.example` sigue entrando.
- **Vuelta 1 (petición del humano en Gate 2):** excluir también `.claude` (incluye `settings.local.json`) y `.agents`. Contexto de build: ~865 → 639 ficheros; los únicos versionados que salen son los 8 de `.claude/`.
- **Tests:** `docker build` + `smoke.mjs`, job `reminders` y `id -u` = 1000 en verde. `pnpm harness --full` en verde.
- **Revisión:** APPROVED en las dos pasadas (`progress/review_dockerignore-e2e-artifacts.md`).
- **Gate 2:** merge aprobado.

## 2026-11-06 — #43 truncated-upload-400

- **Rama:** `feat/truncated-upload-400` (`sdd: false`, sin spec ni Gate 1). Solo `apps/api`. La sesión se cortó por un apagado del PC con el código casi terminado; se reanudó el mismo implementer.
- **Cambios:** nuevo `src/lib/uploads.ts` con `receiveToFile` (la `receive` de import, movida sin cambios) y `receiveToBuffer` (envuelve `toBuffer()`); adjuntos, foto del vehículo e import lo usan. Una subida sin boundary de cierre o cortada responde 400 problem+json en vez de 500, sin dejar ficheros ni filas. Helper de test `incompleteMultipart`.
- **Vuelta 1 (petición del humano en Gate 2, aviso 1 del reviewer):** los dos helpers relanzan tal cual cualquier error con `statusCode` 4xx (no solo `FST_REQ_FILE_TOO_LARGE`); el fallo del disco sigue en 500. Tests unitarios en `test/uploads.test.ts`.
- **Tests:** API 312, web 342, shared 117, e2e 1. `pnpm harness --full` en verde. Una pasada dio 1 fallo intermitente sin identificar en `apps/api`; 3 + 5 + 15 repeticiones posteriores en verde.
- **Revisión:** APPROVED en las dos pasadas (`progress/review_truncated-upload-400.md`). Aviso: un error de la subida con un 5xx explícito acabaría en 400 (hoy `@fastify/multipart` no lo lanza); el humano lo mantiene.
- **Gate 2:** merge aprobado.

## 2026-11-06 — #44 import-dedupe

- **Rama:** `feat/import-dedupe` (SDD, spec en `specs/import-dedupe/`, 13 R / 14 T). Shared, API (tabla + migración `0012_data_imports`) y web.
- **Gate 1:** aprobado sin cambios: problem `type` propio `urn:ikrive:problem:duplicate-import`; borrar los vehículos importados no libera la huella; orden 400 documento > 409 repetido > 409 ajustes; matrícula/VIN normalizados a mayúsculas y solo letras/dígitos, comparados también con archivados y vendidos; imports anteriores sin huella se aceptan una vez.
- **Cambios:** `data_imports` (`userId` + `dataSha256` únicos, `ON DELETE CASCADE`); la fila es el primer `INSERT` de la transacción del import y la violación del `UNIQUE` se traduce al 409 repetido (rollback + borrado de ficheros); comprobación previa tras `parseDocument`; `AppError`/`ConflictError` con `type` opcional; `normalizeVehicleIdentifier` y `findMatchingVehicles` en shared; `matchingVehicles` en el resumen; toast `errors.duplicate` y aviso `role="status"` en Ajustes (es/en).
- **Tests:** shared 119, API 321, web 346, e2e 1. `pnpm harness --full` en verde.
- **Revisión:** APPROVED a la primera (`progress/review_import-dedupe.md`). Avisos: `isUniqueViolation` acepta cualquier `SQLITE_CONSTRAINT_UNIQUE`, no solo el índice de `data_imports`; `findMatchingVehicles` se calcula tras el commit (si lanzara, se borrarían ficheros de un import confirmado); toasts de `sonner` blancos en modo oscuro (preexistente).
- **Gate 2:** merge aprobado sin aplicar los avisos.

## 2026-11-06 — #45 disabled-user-public-access

- **Rama:** `feat/disabled-user-public-access` (SDD, spec en `specs/disabled-user-public-access/`, 12 R / 17 T). Solo `apps/api`; sin cambios en BD, shared ni web.
- **Gate 1:** aprobado sin cambios: filtro en la consulta del selector (token válido de desactivado indistinguible de uno inventado, también en tiempo); `cache-control: private, no-store` en todas las respuestas de las rutas públicas, 404 incluidos; los jobs omiten por completo al desactivado y al reactivar la siguiente ejecución crea los avisos aún pendientes; las notificaciones in-app existentes se conservan; `evaluated` no cuenta a los desactivados.
- **Inventario:** se filtran feed iCal, informe público, `reminders`, `odometer-nudge` y dispatcher (defensa en profundidad). Sin cambios: sesiones (#37), `verification` (sin reset ni verificación de email configurados), rutas con sesión; no hay emails.
- **Cambios:** `db/filters.ts` con `activeUserFilter` (también en `countActiveAdmins`); `innerJoin(user)` + filtro en `findBySelector` de calendario e informe, `listForActiveVehicles`, `listActiveForOdometerNudge` y `listEnabledByUsers`; hook `onSend` con `cache-control` en los plugins encapsulados `calendarFeedRoutes` y `publicReportRoutes`.
- **Tests:** API 335, web 346, shared 119, e2e 1. `pnpm harness --full` en verde.
- **Revisión:** APPROVED a la primera (`progress/review_disabled-user-public-access.md`). Avisos: sin test que afirme que otras rutas no reciben el `cache-control` (lo garantiza la encapsulación de Fastify); futuros accesos por token o jobs deben usar `activeUserFilter`.
- **Gate 2:** merge aprobado.

## 2026-11-06 — #42 release-v0-1-0

- **Rama:** `feat/release-v0-1-0` (SDD, spec en `specs/release-v0-1-0/`, 17 R / 16 T). Docs, `e2e/` y versiones; en producción solo `apps/api/src/config.ts` (exporta `ENV_VARIABLES`, sin cambio de comportamiento).
- **Gate 1:** aprobado tras un cambio pedido: se quitan los tests de contenido que solo valen para la v0.1.0 (versión, CHANGELOG, fase 7, roadmap); R13–R16 se verifican en revisión. Guía aparte `docs/self-hosting.md` con README reducido; 7 capturas versionadas en español.
- **Cambios:** `pnpm screenshots` (config Playwright aparte, `e2e/server-config.ts` compartido, seed propio por API con fechas relativas) genera 7 PNG en `docs/screenshots/` (1,4 MB); guía de instalación, variables, copias (volumen y export/import), exposición a internet y jobs manuales; README reescrito; `CHANGELOG.md` `[0.1.0] - 2026-11-06`; los 5 `package.json` en 0.1.0; fase 7 «✅ Hecha» en `docs/PLAN.md`.
- **Tests:** API 336, web 346, shared 119, e2e 6. `pnpm harness --full` en verde.
- **Revisión:** APPROVED a la primera (`progress/review_release-v0-1-0.md`). Avisos: matrícula desbordada en la tarjeta de vehículo a 1280 px (visible en las capturas de portada), fondo de la barra lateral cortado en `vehicle-detail.png`, `IKRIVE_VERSION` sin build-arg es `0.0.0`, `.env.example` sugiere `DATA_DIR=./data`, restauración puede necesitar `sudo`.
- **Gate 2:** merge aprobado; los avisos pasan a #48 `pre-release-polish`, que va antes del tag `v0.1.0`. El tag no se ha creado.

## 2026-11-06 — #48 pre-release-polish

- **Rama:** `feat/pre-release-polish` (`sdd: false`, sin spec ni Gate 1). Avisos 1–5 del reviewer en Gate 2 de #42, antes del tag `v0.1.0`.
- **Cambios:** `VehicleCard` con `min-w-0` en la cadena del grid y el chip de matrícula `truncate max-w-[50%]` con `title` (nuevo prop opcional en `Plate`); `captureWholePage` en el script de capturas (agranda el viewport en lugar de `fullPage`, con `expect.poll` a la altura del `aside`); `dashboard.png`, `vehicles.png` y `vehicle-detail.png` regeneradas; `docs/self-hosting.md` (`IKRIVE_VERSION` = `0.0.0` sin build-arg, `sudo` al restaurar) y `.env.example` (`DATA_DIR=/data`).
- **Tests:** API 336, web 348, shared 119, e2e 6. `pnpm harness --full` en verde.
- **Revisión:** APPROVED a la primera (`progress/review_pre-release-polish.md`). Avisos: el subtítulo de la tarjeta se trunca a 1280 px; sin captura de la tarjeta en oscuro; matrículas de `/odometer` y de la ficha sin tocar.
- **Gate 2:** merge aprobado, con orden explícita de crear y subir el tag `v0.1.0` tras el merge.

## 2026-11-09 — #49 mobile-auth-api

- **Rama:** `feat/mobile-auth-api` (SDD, spec en `specs/mobile-auth-api/`, 20 R / 23 T). Solo `apps/api` y docs; sin cambios en BD, shared, web ni Docker.
- **Gate 1:** aprobado sin cambios: `TRUSTED_ORIGINS` con `capacitor://localhost,https://localhost` por defecto (vacía = ningún origen); CORS sin credenciales y solo en `/api/*`; token firmado y crudo aceptados; vida del token = la de la sesión; preflight de origen no permitido → 404.
- **Durante la implementación:** Better Auth 1.7.7 salta la comprobación de origen con `NODE_ENV=test`; el humano elige fijar `advanced.disableOriginCheck: false` (sin efecto en producción) y que el helper `signUp` use el `BASE_URL` de la app (design › «Comprobación de origen en tests», T19a).
- **Cambios:** plugin `bearer()` de Better Auth; `TRUSTED_ORIGINS` validada con zod en `config.ts` y añadida a `trustedOrigins`; `plugins/cors.ts` con `@fastify/cors` y `delegator` (solo `/api/*` y orígenes de la lista, `exposedHeaders` `set-auth-token`/`content-disposition`); `isApiRequest` en `lib/http.ts`; el puente de auth no copia `access-control-*`; doc en `self-hosting.md` y `.env.example`.
- **Tests:** API 358, web 348, shared 119, e2e 6. `pnpm harness --full` en verde.
- **Revisión:** APPROVED a la primera (`progress/review_mobile-auth-api.md`). En Gate 2 el humano pide el test del 429 con CORS (T22) y la línea de doc sobre qué orígenes dejar; segunda pasada APPROVED. Descartados: `Vary: Origin` para orígenes no listados y `set-auth-token` en la web (respuestas `private`, sin impacto). Pendientes: login sin cabecera `Origin` (HTTP nativo) no lo limita la lista, a tener en cuenta en #51; el comentario de `app.ts:92` sobre el orden CORS/rate limit ya no es necesario.
- **Gate 2:** merge aprobado.

## 2026-11-09 — #50 web-api-base-url

- **Rama:** `feat/web-api-base-url` (SDD, spec en `specs/web-api-base-url/`, 17 R / 17 T). Solo `apps/web`; sin cambios en API, BD, shared, Docker ni E2E.
- **Gate 1:** aprobado sin cambios: modo servidor = hay URL base guardada; URL y token en `localStorage` (`ikrive.serverUrl`, `ikrive.sessionToken`), costura única en `lib/server.ts` para que #51 pueda cambiar de almacén; cambiar de servidor borra el token; se guarda la cabecera `set-auth-token`; «Añadir al calendario» enlaza a la web del servidor; sin UI para fijar la URL (la pone #51).
- **Cambios:** `lib/server.ts` con `apiFetch` como única puerta a la API (mismo origen: `credentials: 'include'`; servidor: `<URL base>/api/…`, `credentials: 'omit'` y `Authorization: Bearer`); `api-client.ts` y `auth-client.ts` (`customFetchImpl` + `onSuccess` que guarda el token) por `apiFetch`; logout borra el token en `finally`; `ApiImage` y `lib/api-files.ts` (`useApiFileSrc`, `saveApiFile`, `openApiFile`) para fotos, miniaturas, visor, facturas, PDF y export en modo servidor; `openBlob` en `download.ts`; `common.fileError`.
- **Tests:** API 358, web 375, shared 119, e2e 6. `pnpm harness --full` en verde.
- **Revisión:** APPROVED a la primera (`progress/review_web-api-base-url.md`). En Gate 2 el humano pide arreglar el placeholder `<div>` dentro de `<button>` (→ `<span class="block">`) y que `setServerUrl` guarde la URL sin query ni hash; segunda pasada APPROVED. Pendientes: la caché de ficheros no distingue servidores (pasa a un acceptance de #51); la descarga desde el visor no tiene test propio; en la WebView, `blob:` y pestañas nuevas necesitarán ayuda nativa en #51 (`lib/api-files.ts`).
- **Gate 2:** merge aprobado.

## 2026-11-09 — #51 mobile-shell-android

- **Rama:** `feat/mobile-shell-android` (SDD, spec en `specs/mobile-shell-android/`, 25 R / 18 T). `apps/web`, `apps/mobile` (nuevo), CI/release, Docker y docs; sin cambios en API, BD ni shared.
- **Gate 1:** aprobado con cambios: aviso al conectar a un servidor `http:` (R25); el job `android` de CI solo corre con cambios relevantes (`changes` con `dorny/paths-filter`); la descarga y apertura nativa de facturas, export y `.ics` pasa a #55 `mobile-native-files`. No se publica ningún tag con APK hasta tener #55.
- **Cambios:** build nativo de la web (`vite --mode native`, `VitePWA disable`, `dist-native`, `isNativeApp()`); rutas `/welcome` y `/server` con `checkServer` contra `/api/health` (inválida, no responde, no es Ikrive) y aviso `http:`; guards `requireServer`/`requireNative`; «Cambiar servidor» (`useChangeServer` con `queryClient.clear()`) en el login y en `RouteErrorScreen`; `apiFileKey` incluye el servidor; `Warning` movido a `components/`; `apps/mobile` con Capacitor 8 Android (origen `https://localhost`, `usesCleartextTraffic`, iconos, versionCode = major·10000 + minor·100 + patch); CI `changes` + `android` (APK debug como artefacto `ikrive-debug-apk`); release `android` (firma con `apksigner`, APK + `.sha256` a la release); Dockerfile copia `apps/mobile/package.json` (imagen 233,5 MB); `docs/mobile.md`.
- **Tests:** API 358, web 403, e2e 6, más los `node:test` de `apps/mobile`. `pnpm harness --full` en verde.
- **Revisión:** primera pasada CHANGES_REQUESTED (faltaban instrucciones de prueba en el móvil); segunda APPROVED. Prueba en el móvil con la APK de CI (PR #39) contra un servidor real: todo OK salvo «hola mundo» en `/server`, que daba «no responde» porque Chromium acepta `https://hola mundo`. `normalizeServerUrl` rechaza ahora espacios y hosts no válidos (DNS/IPv4/IPv6); tercera review APPROVED y nueva prueba en el móvil OK.
- **Pendientes:** sin tag hasta #55; `ci.yml` sin bloque `permissions`; `allowBackup="true"` (a `false` en #55); tests de ejemplo de la plantilla de Capacitor; `dorny/paths-filter` fijado por tag y no por SHA; el timeout de 10 s de `checkServer` sin test; `VALID_HOST` rechaza hostnames con `_`. En la prueba, `./data` propiedad de root hacía fallar el contenedor (`SQLITE_CANTOPEN`): candidato a mejora de docs o arranque.
- **Gate 2:** merge aprobado (PR #39, lo integra el humano en GitHub).
