# Ikrive: plan del proyecto

> Documento vivo. Actualiza el estado de las fases y las decisiones a medida que avance el proyecto.

## Contexto

Ikrive es una aplicación open source y autoalojada (Docker) para gestionar tus vehículos de forma privada:

1. Añadir, ver, editar y eliminar vehículos (marca, modelo, matrícula, VIN, kilometraje…).
2. Gestionar el mantenimiento de cada vehículo (aceite, ruedas, ITV, averías…) con facturas adjuntas.
3. Alertas de próximos mantenimientos, por fecha o por kilometraje. Para los de kilometraje, se recuerda semanalmente al usuario que introduzca los km actuales.
4. Estadísticas a partir del histórico de km y de los repostajes: km/año, consumo, coste por km…
5. Informe de venta con mantenimientos, facturas y datos de interés para el comprador, para vender más caro o más rápido.

### Decisiones tomadas

- **TypeScript full-stack** en un monorepo pnpm.
- **SQLite** como única base de datos: un solo contenedor, y el backup consiste en copiar `/data`.
- **Multiusuario:** cada usuario ve solo sus vehículos; la primera cuenta es la de administrador y `DISABLE_SIGNUP` cierra los registros.
- **Notificaciones:** dentro de la app y push vía ntfy, Gotify, Apprise o webhook.
- **Node 24 LTS.**
- **Migraciones** aplicadas automáticamente al arrancar el servidor.
- **Diseño alineado con la landing** (`~/dev/personal/Ikrive-landing`, ikrive.com). Ver [Diseño](#diseño).
- **Licencia AGPL-3.0.**
- **Fechas sin hora** (compra, venta, lecturas) como texto `YYYY-MM-DD`; se formatean en UTC para que el día no se desplace. «Hoy» se calcula con la zona horaria del usuario.
- **Kilometraje en la unidad del usuario:** los valores se guardan tal cual, sin convertir. Cambiar `distanceUnit` no reescribe datos antiguos.
- **Autorización por propiedad:** un recurso de otro usuario responde 404 (no 403) para no revelar que existe.
- **Desarrollo guiado por specs** (desde la fase 3): cada feature pasa por spec (EARS) → aprobación humana → implementación → review → aprobación humana → merge `--no-ff` de su rama `feat/<name>` a `main`. El backlog vive en `feature_list.json` y el proceso en [docs/sdd.md](sdd.md).
- **Fotos de vehículos:** se reescalan a 1600 px y se recodifican a WebP con `sharp`, lo que elimina el EXIF (GPS). Se guardan en `/data/uploads/vehicles/<uuid>.webp` y se sirven por `GET /api/vehicles/:id/photo?v=…` (inmutable, con control de acceso).
- **Adjuntos en línea:** `GET …/attachments/:id?inline=1` sirve la factura para verla en el navegador (por defecto se descarga). Como es contenido de usuario en el mismo origen, la respuesta lleva `nosniff` y una CSP por tipo: `sandbox` para imágenes; para PDF, sin `sandbox` y con `object-src 'self'`, porque Chrome no abre su visor en documentos aislados. Si algún día hay un origen aparte para contenido de usuario, conviene servirlos desde ahí.

---

## Estado

| Fase | Estado |
|---|---|
| 1. Fundaciones | ✅ Hecha |
| 1b. Alineación visual con la landing | ✅ Hecha |
| 2. Vehículos y odómetro | ✅ Hecha |
| 3. Mantenimiento y adjuntos | ✅ Hecha |
| 4. Reglas y alertas | ✅ Hecha |
| 5. Repostajes y estadísticas | ✅ Hecha |
| 6. Informe de venta | ✅ Hecha |
| 7. Pulido y release v0.1.0 | Pendiente |

**Pendientes conocidos:**
- La imagen Docker pesa unos 670 MB por dependencias transitivas de better-auth (esbuild, rolldown…). Está previsto reducirla en la fase 7, por ejemplo empaquetando la API con tsup salvo los módulos nativos.
- Aún no existe repositorio remoto en GitHub (cuenta `Alvarotloc`). La imagen se publicará en `ghcr.io/alvarotloc/ikrive`.

---

## Stack

| Capa | Elección |
|---|---|
| Monorepo | pnpm workspaces (pnpm 11: builds nativos permitidos con `allowBuilds` en `pnpm-workspace.yaml`) |
| Backend | Fastify 5 + `fastify-type-provider-zod` (zod 4) |
| ORM / BD | Drizzle ORM + better-sqlite3 (WAL, foreign keys); migraciones generadas con drizzle-kit (`casing: snake_case`) |
| Auth | Better Auth (email y contraseña, sesiones en cookie; OIDC como plugin futuro) |
| Jobs | `croner`, dentro del mismo proceso (fase 4) |
| PDF | `@react-pdf/renderer` + `pdf-lib` para anexar facturas (fase 6) |
| Ficheros | Disco local en `/data/uploads` (`lib/storage.ts`) + `@fastify/multipart` + `sharp` |
| Frontend | React 19 + Vite 8, TanStack Router (rutas por fichero) y Query, Tailwind 4, react-hook-form + zod, react-i18next (es/en), sonner, lucide-react, primitivas de Radix |
| Gráficos | Recharts (fase 5) |
| PWA | `vite-plugin-pwa` (fase 7; los iconos 192/512 ya existen en `apps/web/public/icons`) |
| Calidad | TypeScript strict, Biome, Vitest, Playwright (E2E, pendiente), lefthook en pre-commit |
| CI/CD | GitHub Actions: `ci.yml` (lint, typecheck, test, build y build de Docker) y `release.yml` (al etiquetar `v*.*.*`, imagen multi-arch a GHCR) |

## Estructura

```
ikrive/
├── apps/
│   ├── api/                      # Fastify
│   │   ├── src/
│   │   │   ├── app.ts            # buildApp(): composition root (repos → services → routes)
│   │   │   ├── server.ts         # arranque, migraciones, planificador de jobs, cierre ordenado
│   │   │   ├── config.ts         # env validado con zod
│   │   │   ├── auth.ts           # Better Auth (primer usuario = admin, DISABLE_SIGNUP)
│   │   │   ├── db/ (schema/*.ts, client.ts, migrate.ts, migrations/)
│   │   │   ├── plugins/ (auth, errors [RFC 7807], static-spa)
│   │   │   ├── lib/ (errors.ts → AppError, NotFoundError…; storage.ts, images.ts, dates.ts, version.ts)
│   │   │   ├── jobs/             # <nombre>.job.ts: run…() invocable sin planificador + start…Job() con croner
│   │   │   └── modules/<dominio>/ (routes.ts, service.ts, repository.ts)
│   │   └── test/                 # integración con app.inject() + SQLite :memory:
│   └── web/                      # React SPA
│       ├── public/ (favicon.ico, logo.png, icons/, fonts/)
│       └── src/ (routes/, features/<dominio>/, components/{ui,…}, lib/, i18n/locales/)
├── packages/shared/              # esquemas zod, enums y lógica de dominio pura (exporta TS directamente)
├── docker/Dockerfile             # multi-stage; una imagen sirve API + SPA
├── docker-compose.yml, .env.example
├── docs/PLAN.md                  # este documento (referenciado desde CLAUDE.md)
├── docs/sdd.md, docs/verification.md  # proceso SDD y cómo verificar
├── AGENTS.md, CHECKPOINTS.md     # arnés SDD: mapa para agentes y criterios de revisión
├── feature_list.json             # backlog por features; specs/<name>/ y progress/ guardan su rastro
├── scripts/harness/              # pnpm harness y los hooks de Claude Code (.claude/settings.json)
└── README.md, CONTRIBUTING.md, LICENSE
```

**Arquitectura del backend:** módulos por dominio con tres capas.
- `routes` valida con los esquemas de `@ikrive/shared` y protege con `app.authenticate` + `currentUser(req)`.
- `service` contiene la lógica de negocio y las reglas de propiedad (`ownerId === user.id`).
- `repository` es el acceso a datos con Drizzle.

Los errores se lanzan como `AppError` y se serializan como `application/problem+json`. Las rutas de la API van bajo `/api` y Better Auth bajo `/api/auth/*`.

**Frontend:**
- Las rutas protegidas cuelgan del layout `_app` (su `beforeLoad` exige sesión).
- Los datos se piden con `queryOptions` en `features/<dominio>/queries.ts` y `lib/api-client.ts`.
- Tras iniciar sesión o registrarse hay que usar `fetchQuery({ ...meQuery, staleTime: 0 })`, no `invalidateQueries`.

## Modelo de datos (SQLite)

Ya existen:

- **user / session / account / verification**: los gestiona Better Auth. `user.role` puede ser `admin` o `user`; `user.disabled_at` (propio, fuera de Better Auth) marca una cuenta desactivada por el admin, que no puede iniciar sesión.
- **user_settings**: moneda, unidad de distancia, unidad de volumen, idioma, zona horaria, `odometerReminderWeekday` (`null` = «No avisar») y `reminderHour`.

- **vehicles**: id, owner_id, alias (`name`), marca, modelo, versión, año, matrícula, VIN, tipo, combustible, fecha y precio de compra, km de compra, foto (clave en disco), notas, `sold_at` (fecha) y `archived_at`.
  - El estado (`active|archived|sold`) se deriva: vendido gana a archivado.
- **odometer_readings**: vehicle_id, fecha, valor, origen (`manual|maintenance|fuel`).
  - Es la fuente única del kilometraje y se valida que sea monótono respecto a las lecturas vecinas (`findOdometerConflict` en `packages/shared`). Las lecturas del mismo día pueden ir en cualquier orden.
  - Solo las lecturas `manual` se borran directamente; las demás se gestionarán desde su registro de origen.

Pendientes:

- **maintenance_records**: vehicle_id, fecha, km, categoría, título, descripción, taller, coste, `schedule_id?` e `include_in_report`.
  - Al crearlo se genera una lectura de odómetro.
- **maintenance_schedules**: vehicle_id, título, categoría, `interval_months?` y/o `interval_distance?` (vence lo primero que llegue), umbral de aviso en dos campos (`warn_days` para la fecha y `warn_distance` para los km) y último realizado (`last_done_date`, `last_done_odometer?`). `next_due_date`, `next_due_odometer` y el estado no se guardan: se calculan al leer con la fecha de hoy y las lecturas de odómetro.
  - Al registrar un mantenimiento vinculado se recalcula el siguiente vencimiento.
- **fuel_logs**: fecha, km, cantidad (L o kWh), precio total, precio por unidad, `full_tank` y `missed_previous`.
  - También genera una lectura de odómetro.
- **attachments**: owner, `entity_type`/`entity_id`, nombre original, mime, tamaño, sha256, ruta en disco con nombre aleatorio y tipo.
  - Se descargan solo a través de la API y con control de acceso.
- **notifications**: user_id, tipo, título, cuerpo, enlace, `dedupe_key` único y `read_at`.
- **notification_channels**: `ntfy|gotify|apprise|webhook`, config JSON, activo y último error.
- **report_shares**: token, opciones de privacidad, `expires_at` y `revoked_at`.

Los enums ya están definidos en `packages/shared/src/enums.ts`.

## Funcionalidades por fase

### Fase 2: vehículos y odómetro ✅
- CRUD de vehículos, con foto, archivado y marca de vendido.
- Ficha del vehículo con el estilo de «Expediente del vehículo» de la landing: km actuales, media anual y km desde la compra.
- Lecturas de km y un formulario rápido de km pensado para el móvil (en la ficha y en `/odometer`, una tarjeta por vehículo activo; el recordatorio semanal de la fase 4 enlazará ahí).
- Tests de autorización: un usuario no puede acceder a vehículos de otro.
- API: `GET|POST /api/vehicles` (`?status=active|archived|sold|all`), `GET|PATCH|DELETE /api/vehicles/:id`, `GET|PUT|DELETE /api/vehicles/:id/photo` y `GET|POST /api/vehicles/:id/odometer`, `DELETE /api/vehicles/:id/odometer/:readingId`.
- **Queda para fases siguientes:** los próximos mantenimientos (fase 4) y el gasto (fases 3 y 5) en la ficha.

### Fase 3: mantenimiento y adjuntos ✅
- Reutilizar `lib/storage.ts` (`createFileStorage`) para las facturas; `@fastify/multipart` y `sharp` ya están instalados.
- Al crear un mantenimiento con km, crear una lectura `source: 'maintenance'` y validarla con `findOdometerConflict`.
- Añadir a la ficha el gasto acumulado y la timeline de mantenimientos.
- CRUD de mantenimientos con varias facturas (PDF o imagen) por registro, y miniaturas.
- Timeline filtrable por categoría, con las etiquetas `Badge variant="stamp"`.
- Validación de MIME y tamaño (`MAX_UPLOAD_MB`).
- `GET /api/config` (autenticado) expone `maxUploadMb` para que la web muestre el límite y descarte antes de subir los ficheros que lo superan.

### Fase 4: reglas y alertas ✅
- `reminders.job` (diario):
  - Evalúa las reglas. Para las de km estima la fecha de vencimiento con la media de km/día de los últimos 90 días.
  - Crea la notificación in-app, deduplicada, y la envía por los canales del usuario.
  - **Decisión (spec maintenance-schedules-api):** el estado (al día / próximo / vencido) solo usa la fecha por meses y los km reales; la fecha estimada se informa pero no avisa. Idea a futuro: avisar también por la fecha estimada.
- `odometer-nudge.job`: el día elegido por cada usuario, avisa si un vehículo activo lleva 7 días sin lectura de km.
- Interfaz `NotificationChannel.send()` con implementaciones para ntfy, Gotify, Apprise (apprise-api) y webhook, y botón de prueba.
- Lanzar los jobs a mano: `POST /api/admin/jobs/:name/run` (solo `admin`) y script `node dist/job.js <name>` (`pnpm --filter @ikrive/api job <name>` en desarrollo). Aplican las mismas reglas que el planificador e ignoran `REMINDERS_ENABLED`.
- Próximos mantenimientos en el calendario del usuario, sin calendario propio:
  - Botón «Añadir al calendario» por regla (enlaces de Google y Outlook, y descarga `.ics`). Funciona en cualquier instalación porque lo hace el navegador.
  - Feed iCal opcional con token. Google Calendar necesita que el servidor sea accesible desde internet; Apple Calendar, Thunderbird o ICSx5 sirven en red local o por VPN.
  - El evento se genera con funciones puras en `packages/shared`, separadas de la acción, para que la app móvil pueda usar el calendario nativo.

### Fase 5: repostajes y estadísticas
- Fuel logs.
- Estadísticas: km/año y km/mes, consumo (entre repostajes de depósito lleno), coste por km de combustible y de mantenimiento, coste total de propiedad y gasto por categoría.
- Las fórmulas son funciones puras en `packages/shared`, con tests unitarios.

### Fase 6: informe de venta
- PDF basado en el mockup «Informe Profesional Ikrive» de la landing:
  - Portada con los datos del vehículo.
  - Resumen y gráfico del histórico de km.
  - Tabla de mantenimientos.
  - Facturas anexadas: los PDF se fusionan y las imágenes se incrustan.
- Opciones para ocultar precios, matrícula o VIN.
- Enlace público de solo lectura con token y caducidad.
- **Reparto en features:** `sale-report-pdf` (#29), `sale-report-invoices` (#30), `sale-report-web` (#31), `report-shares-api` (#32) y `report-shares-web` (#33).
- **Decisiones:**
  - El enlace público sirve directamente el PDF (`GET /api/public/reports/:token`), generado al vuelo con las opciones guardadas en el enlace; no hay página pública en la SPA. El token sigue el patrón del feed iCal (selector + SHA-256 del verificador).
  - Las facturas se anexan tal cual y no se pueden tachar, así que van detrás de una opción propia «Incluir facturas», independiente de las de ocultar. La web avisa si se combinan.
  - El informe usa el idioma, la moneda y las unidades del propietario, y omite los adornos de marketing del mockup (estrellas, «blockchain»).
  - El enlace se construye con `BASE_URL` y solo funciona si el servidor es accesible desde internet; si no, se descarga el PDF y se envía. La web avisa si `BASE_URL` es local.
  - react-pdf no lee woff2: las fuentes del PDF salen de los paquetes `@fontsource` (`.woff`), sin binarios en el repo.

### Fase 7: pulido
- Exportar e importar (zip con un JSON de los datos y los adjuntos).
- PWA.
- Gestión de usuarios para el admin.
- Reducir el tamaño de la imagen.
- E2E con Playwright.
- Docs con capturas y release v0.1.0.

### Después de v0.1.0: app móvil (idea)
- APK Android con Capacitor a partir de la misma SPA, inspirada en [openGym](https://github.com/DuarteSantos8/openGym): APK firmada en GitHub Releases con su `.sha256`, sin Play Store, y en iPhone la PWA o compilar con Xcode.
- Usos nativos previstos: añadir los próximos mantenimientos al calendario del teléfono y notificaciones locales.
- **Decisión:** como en openGym, la primera pantalla ofrece dos modos y el usuario elige uno:
  - **Mi servidor:** cliente del servidor del usuario. Pide la URL del servidor y exige adaptar Better Auth y CORS a un origen nativo (`trustedOrigins` y, probablemente, sesión por token en vez de cookie).
  - **En este teléfono:** datos en una base de datos local (SQLite en el dispositivo), sin cuenta ni servidor.
  - Para no duplicar la lógica, la web habla con una capa de datos intercambiable (HTTP o local) y las reglas de negocio viven en `packages/shared`, que ya concentra validaciones y cálculos puros. Falta decidir cómo se pasa del modo local a un servidor (p. ej. con el export/import de la fase 7).

## Diseño

Fuente de verdad: `apps/web/src/index.css` (tokens) y la landing en `~/dev/personal/Ikrive-landing/src/styles/global.css`.

- **Colores:** tinta `#2d3a3a` (primario), menta `#c5e8e0` y `#a8d9cd` (acento), fondo `#f9fafb`, superficies `#fff`, texto secundario `#6b7280`, verde oscuro `#1a3638` para el informe y bordes `rgba(45,58,58,.1)`.
  - El modo oscuro se deriva de la misma paleta, con la menta como color principal.
- **Tipografías** (autoalojadas en `public/fonts`): **Outfit** para títulos (`font-display`) y **Plus Jakarta Sans** para texto (`font-sans`).
- **Radios:** 8, 12, 16 y 24 px. Sombras `shadow-soft` y `shadow-float`.
- **Botones:** alto mínimo de 44 px, radio de 12 px, peso 600 y elevación de 1px al pasar el ratón. Variantes: default (tinta), accent (menta), outline y ghost.
- **Utilidades:** `eyebrow`, `label-caps`, `glow-shell` (resplandor menta arriba a la derecha) y `reveal` (animación de entrada).
- **Componentes de marca:** `Brand` (logo y el texto «ikrive»), `PageHeader`, `Badge` (`status` y `stamp`) y `CheckItem`.

## Convenciones

- TypeScript `strict`, sin `any`, y validación zod en todos los bordes (env, HTTP y formularios).
- Textos siempre en `apps/web/src/i18n/locales/{es,en}.json`.
- Seguridad:
  - Cookies httpOnly, helmet y rate limit.
  - Los adjuntos se guardan con nombre aleatorio y se sirven con control de acceso.
- Conventional Commits en inglés, agrupados por tipo (`feat`, `fix`, `test`, `build`, `ci`, `docs`, `chore`).
- Cambios en la base de datos:
  1. Editar `apps/api/src/db/schema/`.
  2. Ejecutar `pnpm db:generate`.
  3. Commitear el SQL generado.

## Verificación

- `pnpm harness` valida el estado del backlog y los specs; `pnpm harness --full` añade lint, typecheck y tests. Detalle en [docs/verification.md](verification.md).
- `pnpm lint && pnpm typecheck && pnpm test` en verde.
- `pnpm dev`: la API queda en `:3000` y la web en `:5173` (con proxy de `/api`).
- `docker build -f docker/Dockerfile -t ikrive:dev .` y después `docker run -p 3000:3000 -e AUTH_SECRET=… ikrive:dev`. Comprobar health, registro, `/api/me` y que la SPA carga.
- Revisión visual con capturas en claro, oscuro y móvil (playwright-core contra `/usr/bin/google-chrome`).
