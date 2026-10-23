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
